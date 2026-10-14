import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { requireFinanceConfigurationApprover } from "@/lib/configuration/authorization";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { taxRuleCreateSchema } from "@/lib/validation/configuration";
import { recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
 try{
  const actor=await requirePermission("settings:manage");
  const scopes=[...new Set(actor.legalEntityIds)];
  if(!scopes.length)return jsonNoStore({data:[]});
  const entityId=request.nextUrl.searchParams.get("legalEntityId");
  if(entityId){
   if(!scopes.includes(entityId))return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found in your assigned scope."}},404);
   await requirePermissionForEntity("settings:manage",entityId);
  }
  const target=entityId?[entityId]:scopes;
  const [rows]=await pool.query<(RowDataPacket & {id:string;legal_entity_id:string;tax_code:string;display_name:string;jurisdiction:string;rate:string;calculation_mode:string;effective_from:Date;effective_until:Date|null;is_active:number;approved_at:Date|null;approval_reference:string|null;deactivated_at:Date|null;created_at:Date})[]>(
   `SELECT id,legal_entity_id,tax_code,display_name,jurisdiction,rate,calculation_mode,effective_from,effective_until,is_active,approved_at,approval_reference,deactivated_at,created_at
    FROM tax_rules WHERE legal_entity_id IN (${target.map(()=>"?").join(",")}) ORDER BY legal_entity_id,tax_code,effective_from DESC`,target);
  return jsonNoStore({data:rows.map(r=>({id:r.id,legalEntityId:r.legal_entity_id,taxCode:r.tax_code,displayName:r.display_name,jurisdiction:r.jurisdiction,
    ratePercent:String(r.rate),calculationMode:r.calculation_mode,effectiveFrom:r.effective_from,effectiveUntil:r.effective_until,isActive:Boolean(r.is_active),
    approved:Boolean(r.approved_at&&r.approval_reference),approvalReference:r.approval_reference,approvedAt:r.approved_at,deactivatedAt:r.deactivated_at,createdAt:r.created_at}))});
 }catch(error){return apiError(error)}
}

export async function POST(request:NextRequest){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);
  const input=taxRuleCreateSchema.parse(await request.json());
  const actor=requireFinanceConfigurationApprover(await requirePermissionForEntity("settings:manage",input.legalEntityId));
  conn=await pool.getConnection();await conn.beginTransaction();
  const [entities]=await conn.execute<(RowDataPacket & {is_active:number;tax_setup_status:string})[]>(
   "SELECT is_active,tax_setup_status FROM legal_entities WHERE id=? FOR UPDATE",[input.legalEntityId]);
  if(!entities.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found"}},404)}
  if(!entities[0].is_active||entities[0].tax_setup_status!=="APPROVED_CONFIGURED"){
   await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_NOT_APPROVED",message:"Activate tax setup and record finance/tax approval on the legal entity before adding tax rules."}},409)
  }
  const [overlap]=await conn.execute<(RowDataPacket & {id:string})[]>(
   `SELECT id FROM tax_rules WHERE legal_entity_id=? AND tax_code=? AND is_active=TRUE
    AND effective_from <= COALESCE(NULLIF(?,''),'9999-12-31')
    AND COALESCE(effective_until,'9999-12-31') >= ?
    FOR UPDATE`,
   [input.legalEntityId,input.taxCode,input.effectiveUntil||"9999-12-31",input.effectiveFrom]);
  if(overlap.length){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"An active tax rule with this code overlaps the requested effective period. Deactivate or end-date the earlier rule first."}},409)}
  const id=randomUUID();
  await conn.execute(
   `INSERT INTO tax_rules (id,legal_entity_id,tax_code,display_name,jurisdiction,rate,calculation_mode,effective_from,effective_until,is_active,approved_by,approved_at,approval_reference,deactivated_at)
    VALUES (?,?,?,?,?,?,?,?,?,TRUE,?,NOW(3),?,NULL)`,
   [id,input.legalEntityId,input.taxCode,input.displayName,input.jurisdiction,input.ratePercent,input.calculationMode,input.effectiveFrom,input.effectiveUntil||null,actor.userId,input.approvalReference]);
  await recordAudit(conn,actor.userId,"tax_rule.created","tax_rule",id,input.changeReason,null,
   {legalEntityId:input.legalEntityId,taxCode:input.taxCode,effectiveFrom:input.effectiveFrom,effectiveUntil:input.effectiveUntil||null,approvalReference:input.approvalReference});
  await conn.commit();
  return jsonNoStore({data:{id,legalEntityId:input.legalEntityId,taxCode:input.taxCode,displayName:input.displayName,jurisdiction:input.jurisdiction,
    ratePercent:input.ratePercent,calculationMode:input.calculationMode,effectiveFrom:input.effectiveFrom,effectiveUntil:input.effectiveUntil||null,
    isActive:true,approved:true,approvalReference:input.approvalReference}},201);
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
