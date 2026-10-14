import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { requireFinanceConfigurationApprover } from "@/lib/configuration/authorization";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { recordAudit } from "@/lib/configuration/service";
import { z } from "zod";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.object({isActive:z.boolean(),changeReason:z.string().trim().min(3).max(1000)}).strict();
export async function PATCH(request:NextRequest,context:{params:Promise<{configId:string}>}){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const {configId}=await context.params;const input=schema.parse(await request.json());
  conn=await pool.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute<(RowDataPacket & {id:string;legal_entity_id:string;document_type:string;series_code:string;is_active:number;effective_from:Date;effective_until:Date|null;approval_reference:string|null})[]>(
   "SELECT id,legal_entity_id,document_type,series_code,is_active,effective_from,effective_until,approval_reference FROM invoice_numbering_configs WHERE id=? FOR UPDATE",[configId]);
  if(!rows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Numbering configuration not found"}},404)}
  const row=rows[0];const scopedActor=await requirePermissionForEntity("settings:manage",row.legal_entity_id);
  const actor=input.isActive?requireFinanceConfigurationApprover(scopedActor):scopedActor;
  if(input.isActive){
   if(!row.approval_reference){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_NOT_APPROVED",message:"An approved numbering configuration must include an approval reference."}},409)}
   const [entity]=await conn.execute<(RowDataPacket & {is_active:number})[]>("SELECT is_active FROM legal_entities WHERE id=?",[row.legal_entity_id]);
   if(!entity.length||!entity[0].is_active){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Inactive legal entity cannot activate numbering."}},409)}
   const [overlaps]=await conn.execute<(RowDataPacket & {id:string})[]>(
    `SELECT id FROM invoice_numbering_configs WHERE legal_entity_id=? AND document_type=? AND id<>? AND is_active=TRUE
     AND effective_from<=COALESCE(?,'9999-12-31') AND COALESCE(effective_until,'9999-12-31')>=?
     FOR UPDATE`,[row.legal_entity_id,row.document_type,configId,row.effective_until,row.effective_from]);
   if(overlaps.length){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Another active series overlaps this series. End-date or deactivate it first."}},409)}
  }
  await conn.execute("UPDATE invoice_numbering_configs SET is_active=? WHERE id=?",[input.isActive?1:0,configId]);
  await recordAudit(conn,actor.userId,input.isActive?"numbering.activated":"numbering.deactivated","invoice_numbering_config",configId,input.changeReason,
   {isActive:Boolean(row.is_active)},{isActive:input.isActive,seriesCode:row.series_code,documentType:row.document_type});
  await conn.commit();return jsonNoStore({data:{id:configId,isActive:input.isActive}});
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
