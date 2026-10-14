import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission, requirePermissionForEntity } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { templateCreateSchema } from "@/lib/validation/configuration";
import { recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
function jsonVal(v:unknown){if(typeof v!=="string")return v;try{return JSON.parse(v)}catch{return null}}

export async function GET(request:NextRequest){
 try{
  const actor=await requirePermission("settings:manage");const scopes=[...new Set(actor.legalEntityIds)];
  if(!scopes.length)return jsonNoStore({data:[]});
  const entityId=request.nextUrl.searchParams.get("legalEntityId");
  if(entityId&&!scopes.includes(entityId))return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found in your assigned scope."}},404);
  const target=entityId?[entityId]:scopes;
  const [rows]=await pool.query<(RowDataPacket & {id:string;legal_entity_id:string;brand_id:string|null;document_type:string;template_key:string;display_name:string;version_number:number;template_config:unknown;effective_from:Date;effective_until:Date|null;is_active:number;created_at:Date})[]>(
   `SELECT id,legal_entity_id,brand_id,document_type,template_key,display_name,version_number,template_config,effective_from,effective_until,is_active,created_at
    FROM invoice_document_templates WHERE legal_entity_id IN (${target.map(()=>"?").join(",")})
    ORDER BY legal_entity_id,document_type,template_key,version_number DESC`,target);
  return jsonNoStore({data:rows.map(r=>({id:r.id,legalEntityId:r.legal_entity_id,brandId:r.brand_id,documentType:r.document_type,templateKey:r.template_key,
   displayName:r.display_name,versionNumber:Number(r.version_number),templateConfig:jsonVal(r.template_config),effectiveFrom:r.effective_from,
   effectiveUntil:r.effective_until,isActive:Boolean(r.is_active),createdAt:r.created_at}))});
 }catch(error){return apiError(error)}
}

export async function POST(request:NextRequest){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const input=templateCreateSchema.parse(await request.json());
  const actor=await requirePermissionForEntity("settings:manage",input.legalEntityId);
  conn=await pool.getConnection();await conn.beginTransaction();
  const [entities]=await conn.execute<(RowDataPacket & {is_active:number})[]>("SELECT is_active FROM legal_entities WHERE id=? FOR UPDATE",[input.legalEntityId]);
  if(!entities.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found"}},404)}
  if(input.brandId){
   if(!actor.legalEntityIds.includes(input.legalEntityId)){await conn.rollback();return jsonNoStore({error:{code:"FORBIDDEN",message:"Legal entity is outside your scope."}},403)}
   const [mapping]=await conn.execute<(RowDataPacket & {brand_id:string})[]>(
    "SELECT brand_id FROM brand_legal_entities WHERE brand_id=? AND legal_entity_id=? LIMIT 1",[input.brandId,input.legalEntityId]);
   if(!mapping.length){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Brand must be explicitly mapped to this legal entity before creating a brand-specific template."}},409)}
  }
  if(input.activate&&!entities[0].is_active){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"An inactive legal entity cannot activate a document template."}},409)}
  const [versions]=await conn.execute<(RowDataPacket & {version_number:number})[]>(
   "SELECT version_number FROM invoice_document_templates WHERE legal_entity_id=? AND brand_id <=> ? AND document_type=? AND template_key=? ORDER BY version_number DESC LIMIT 1 FOR UPDATE",
   [input.legalEntityId,input.brandId||null,input.documentType,input.templateKey]);
  const version=Number(versions[0]?.version_number??0)+1;
  if(input.activate){
   const [overlaps]=await conn.execute<(RowDataPacket & {id:string})[]>(
    `SELECT id FROM invoice_document_templates WHERE legal_entity_id=? AND brand_id <=> ? AND document_type=? AND template_key=? AND is_active=TRUE
     AND effective_from<=COALESCE(?,'9999-12-31') AND COALESCE(effective_until,'9999-12-31')>=? FOR UPDATE`,
    [input.legalEntityId,input.brandId||null,input.documentType,input.templateKey,input.effectiveUntil||"9999-12-31",input.effectiveFrom]);
   if(overlaps.length){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"An active template with this key overlaps the requested effective period."}},409)}
  }
  const id=randomUUID();
  await conn.execute(
   `INSERT INTO invoice_document_templates
    (id,legal_entity_id,brand_id,document_type,template_key,display_name,version_number,template_config,effective_from,effective_until,is_active,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
   [id,input.legalEntityId,input.brandId||null,input.documentType,input.templateKey,input.displayName,version,JSON.stringify(input.templateConfig),
    input.effectiveFrom,input.effectiveUntil||null,input.activate?1:0,actor.userId]);
  const snapshot={schemaVersion:1,templateId:id,legalEntityId:input.legalEntityId,brandId:input.brandId||null,documentType:input.documentType,
   templateKey:input.templateKey,displayName:input.displayName,versionNumber:version,templateConfig:input.templateConfig,
   effectiveFrom:input.effectiveFrom,effectiveUntil:input.effectiveUntil||null,isActive:input.activate};
  await recordAudit(conn,actor.userId,input.activate?"template.activated":"template.created","invoice_document_template",id,input.changeReason,null,
   {legalEntityId:input.legalEntityId,brandId:input.brandId||null,documentType:input.documentType,templateKey:input.templateKey,versionNumber:version,isActive:input.activate});
  await conn.commit();return jsonNoStore({data:snapshot},201);
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
