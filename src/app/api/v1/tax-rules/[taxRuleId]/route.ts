import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { recordAudit } from "@/lib/configuration/service";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const updateSchema=z.object({isActive:z.boolean(),changeReason:z.string().trim().min(3).max(1000)}).strict();

export async function PATCH(request:NextRequest,context:{params:Promise<{taxRuleId:string}>}){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const {taxRuleId}=await context.params;
  const input=updateSchema.parse(await request.json());
  conn=await pool.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute<(RowDataPacket & {id:string;legal_entity_id:string;tax_code:string;is_active:number;effective_from:Date;effective_until:Date|null})[]>(
   "SELECT id,legal_entity_id,tax_code,is_active,effective_from,effective_until FROM tax_rules WHERE id=? FOR UPDATE",[taxRuleId]);
  if(!rows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Tax rule not found"}},404)}
  const old=rows[0];const actor=await requirePermissionForEntity("settings:manage",old.legal_entity_id);
  if(input.isActive){
   const [entity]=await conn.execute<(RowDataPacket & {tax_setup_status:string;is_active:number})[]>(
    "SELECT tax_setup_status,is_active FROM legal_entities WHERE id=?",[old.legal_entity_id]);
   if(!entity.length||!entity[0].is_active||entity[0].tax_setup_status!=="APPROVED_CONFIGURED"){
    await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_NOT_APPROVED",message:"The legal entity tax setup is not approved and active."}},409)
   }
   const [conflict]=await conn.execute<(RowDataPacket & {id:string})[]>(
    `SELECT id FROM tax_rules WHERE legal_entity_id=? AND tax_code=? AND id<>? AND is_active=TRUE
     AND effective_from<=COALESCE(?,'9999-12-31') AND COALESCE(effective_until,'9999-12-31')>=?
     FOR UPDATE`,[old.legal_entity_id,old.tax_code,taxRuleId,old.effective_until,old.effective_from]);
   if(conflict.length){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Another active rule with this code overlaps this effective period."}},409)}
  }
  await conn.execute("UPDATE tax_rules SET is_active=?,deactivated_at=? WHERE id=?",[input.isActive?1:0,input.isActive?null:new Date(),taxRuleId]);
  await recordAudit(conn,actor.userId,input.isActive?"tax_rule.activated":"tax_rule.deactivated","tax_rule",taxRuleId,input.changeReason,
   {isActive:Boolean(old.is_active)},{isActive:input.isActive,taxCode:old.tax_code});
  await conn.commit();return jsonNoStore({data:{id:taxRuleId,isActive:input.isActive}});
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
