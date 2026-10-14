import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { recordAudit } from "@/lib/configuration/service";
import { z } from "zod";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.object({isActive:z.boolean(),changeReason:z.string().trim().min(3).max(1000)}).strict();
export async function PATCH(request:NextRequest,context:{params:Promise<{templateId:string}>}){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const {templateId}=await context.params;const input=schema.parse(await request.json());
  conn=await pool.getConnection();await conn.beginTransaction();
  const [lookup]=await conn.execute<(RowDataPacket & {legal_entity_id:string})[]>(
   "SELECT legal_entity_id FROM invoice_document_templates WHERE id=? LIMIT 1",[templateId]);
  if(!lookup.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Template not found"}},404)}
  await conn.execute("SELECT id FROM legal_entities WHERE id=? FOR UPDATE",[lookup[0].legal_entity_id]);
  const [rows]=await conn.execute<(RowDataPacket & {id:string;legal_entity_id:string;brand_id:string|null;document_type:string;template_key:string;is_active:number;effective_from:Date;effective_until:Date|null})[]>(
   "SELECT id,legal_entity_id,brand_id,document_type,template_key,is_active,effective_from,effective_until FROM invoice_document_templates WHERE id=? FOR UPDATE",[templateId]);
  if(!rows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Template not found"}},404)}
  const row=rows[0];const actor=await requirePermissionForEntity("settings:manage",row.legal_entity_id);
  if(input.isActive){
   const [entity]=await conn.execute<(RowDataPacket & {is_active:number})[]>("SELECT is_active FROM legal_entities WHERE id=?",[row.legal_entity_id]);
   if(!entity.length||!entity[0].is_active){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"An inactive legal entity cannot activate a template."}},409)}
   if(row.brand_id){
    const [brand]=await conn.execute<(RowDataPacket & {is_active:number})[]>(
     "SELECT b.is_active FROM brands b JOIN brand_legal_entities m ON m.brand_id=b.id WHERE b.id=? AND m.legal_entity_id=? AND m.effective_from<=NOW(3) AND (m.effective_until IS NULL OR m.effective_until>NOW(3))",[row.brand_id,row.legal_entity_id]);
    if(!brand.length||!brand[0].is_active){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Template brand must be active and explicitly mapped to the legal entity."}},409)}
   }
   const [overlaps]=await conn.execute<(RowDataPacket & {id:string})[]>(
    `SELECT id FROM invoice_document_templates WHERE legal_entity_id=? AND brand_id <=> ? AND document_type=? AND id<>? AND is_active=TRUE
     AND effective_from<=COALESCE(?,'9999-12-31') AND COALESCE(effective_until,'9999-12-31')>=? FOR UPDATE`,
    [row.legal_entity_id,row.brand_id,row.document_type,templateId,row.effective_until,row.effective_from]);
   if(overlaps.length){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Another active template for this entity, brand and document type overlaps this effective period."}},409)}
  }
  await conn.execute("UPDATE invoice_document_templates SET is_active=? WHERE id=?",[input.isActive?1:0,templateId]);
  await recordAudit(conn,actor.userId,input.isActive?"template.activated":"template.deactivated","invoice_document_template",templateId,input.changeReason,
   {isActive:Boolean(row.is_active)},{isActive:input.isActive,documentType:row.document_type,templateKey:row.template_key});
  await conn.commit();return jsonNoStore({data:{id:templateId,isActive:input.isActive}});
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
