import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission, requirePermissionForEntity } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { numberingCreateSchema } from "@/lib/validation/configuration";
import { recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
 try{
  const actor=await requirePermission("settings:manage");
  const scopes=[...new Set(actor.legalEntityIds)];
  if(!scopes.length)return jsonNoStore({data:[]});
  const entityId=request.nextUrl.searchParams.get("legalEntityId");
  if(entityId&&!scopes.includes(entityId))return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found in your assigned scope."}},404);
  const target=entityId?[entityId]:scopes;
  const [rows]=await pool.query<(RowDataPacket & {id:string;legal_entity_id:string;document_type:string;series_code:string;prefix:string;suffix:string;sequence_width:number;include_financial_year:number;sequence_scope:string;financial_year_start_month:number;financial_year_start_day:number;time_zone:string;version_number:number;effective_from:Date;effective_until:Date|null;approval_reference:string|null;is_active:number;created_at:Date})[]>(
   `SELECT id,legal_entity_id,document_type,series_code,prefix,suffix,sequence_width,include_financial_year,sequence_scope,
    financial_year_start_month,financial_year_start_day,time_zone,version_number,effective_from,effective_until,approval_reference,is_active,created_at
    FROM invoice_numbering_configs WHERE legal_entity_id IN (${target.map(()=>"?").join(",")})
    ORDER BY legal_entity_id,document_type,version_number DESC`,target);
  return jsonNoStore({data:rows.map(r=>({id:r.id,legalEntityId:r.legal_entity_id,documentType:r.document_type,seriesCode:r.series_code,
   prefix:r.prefix,suffix:r.suffix,sequenceWidth:Number(r.sequence_width),includeFinancialYear:Boolean(r.include_financial_year),
   sequenceScope:r.sequence_scope,financialYearStartMonth:Number(r.financial_year_start_month),financialYearStartDay:Number(r.financial_year_start_day),
   timeZone:r.time_zone,versionNumber:Number(r.version_number),effectiveFrom:r.effective_from,effectiveUntil:r.effective_until,
   approvalReference:r.approval_reference,isActive:Boolean(r.is_active),createdAt:r.created_at}))});
 }catch(error){return apiError(error)}
}

export async function POST(request:NextRequest){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const input=numberingCreateSchema.parse(await request.json());
  const actor=await requirePermissionForEntity("settings:manage",input.legalEntityId);
  conn=await pool.getConnection();await conn.beginTransaction();
  const [entities]=await conn.execute<(RowDataPacket & {is_active:number})[]>("SELECT is_active FROM legal_entities WHERE id=? FOR UPDATE",[input.legalEntityId]);
  if(!entities.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found"}},404)}
  if(!entities[0].is_active){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"An inactive legal entity cannot have an active numbering series."}},409)}
  const [versions]=await conn.execute<(RowDataPacket & {version_number:number})[]>(
   "SELECT version_number FROM invoice_numbering_configs WHERE legal_entity_id=? AND document_type=? ORDER BY version_number DESC LIMIT 1 FOR UPDATE",
   [input.legalEntityId,input.documentType]);
  const version=Number(versions[0]?.version_number??0)+1;
  if(input.activate){
   const [overlaps]=await conn.execute<(RowDataPacket & {id:string})[]>(
    `SELECT id FROM invoice_numbering_configs WHERE legal_entity_id=? AND document_type=? AND is_active=TRUE
     AND effective_from<=COALESCE(?,'9999-12-31') AND COALESCE(effective_until,'9999-12-31')>=?
     FOR UPDATE`,[input.legalEntityId,input.documentType,input.effectiveUntil||"9999-12-31",input.effectiveFrom]);
   if(overlaps.length){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"An active numbering series overlaps this effective period. Deactivate or end-date the prior series before activation."}},409)}
  }
  const id=randomUUID();
  await conn.execute(
   `INSERT INTO invoice_numbering_configs
    (id,legal_entity_id,document_type,series_code,prefix,suffix,sequence_width,include_financial_year,sequence_scope,
     financial_year_start_month,financial_year_start_day,time_zone,version_number,effective_from,effective_until,approval_reference,is_active,created_by)
    VALUES (?,?,?,?,?,?,?,?, 'ENTITY_FINANCIAL_YEAR_DOCUMENT_TYPE',?,?,?,?,?,?,?,?,?)`,
   [id,input.legalEntityId,input.documentType,input.seriesCode,input.prefix,input.suffix,input.sequenceWidth,input.includeFinancialYear?1:0,
    input.financialYearStartMonth,input.financialYearStartDay,input.timeZone,version,input.effectiveFrom,input.effectiveUntil||null,input.approvalReference,input.activate?1:0,actor.userId]);
  await recordAudit(conn,actor.userId,input.activate?"numbering.activated":"numbering.created","invoice_numbering_config",id,input.changeReason,null,
   {legalEntityId:input.legalEntityId,documentType:input.documentType,seriesCode:input.seriesCode,versionNumber:version,isActive:input.activate,effectiveFrom:input.effectiveFrom,effectiveUntil:input.effectiveUntil||null});
  await conn.commit();
  return jsonNoStore({data:{id,legalEntityId:input.legalEntityId,documentType:input.documentType,seriesCode:input.seriesCode,prefix:input.prefix,
   suffix:input.suffix,sequenceWidth:input.sequenceWidth,includeFinancialYear:input.includeFinancialYear,sequenceScope:"ENTITY_FINANCIAL_YEAR_DOCUMENT_TYPE",
   financialYearStartMonth:input.financialYearStartMonth,financialYearStartDay:input.financialYearStartDay,timeZone:input.timeZone,
   versionNumber:version,effectiveFrom:input.effectiveFrom,effectiveUntil:input.effectiveUntil||null,approvalReference:input.approvalReference,isActive:input.activate}},201);
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
