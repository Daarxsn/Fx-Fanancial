import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { requireFinanceConfigurationApprover } from "@/lib/configuration/authorization";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { taxRegistrationCreateSchema } from "@/lib/validation/configuration";
import { recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{entityId:string}>};

export async function GET(_request:NextRequest,context:Context){
 try{
  const {entityId}=await context.params;await requirePermissionForEntity("settings:manage",entityId);
  const [rows]=await pool.execute<(RowDataPacket & {id:string;registration_key:string;version_number:number;registration_type:string;jurisdiction:string;registration_number:string;display_label:string;is_primary:number;effective_from:Date;effective_until:Date|null;approval_reference:string;approved_at:Date;approved_by:string;is_active:number;created_at:Date})[]>(
   `SELECT id,registration_key,version_number,registration_type,jurisdiction,registration_number,display_label,is_primary,effective_from,effective_until,
     approval_reference,approved_at,approved_by,is_active,created_at FROM legal_entity_tax_registrations
    WHERE legal_entity_id=? ORDER BY registration_key,version_number DESC`,[entityId]);
  return jsonNoStore({data:rows.map(r=>({id:r.id,registrationKey:r.registration_key,versionNumber:Number(r.version_number),registrationType:r.registration_type,
   jurisdiction:r.jurisdiction,registrationNumber:r.registration_number,displayLabel:r.display_label,isPrimary:Boolean(r.is_primary),
   effectiveFrom:r.effective_from,effectiveUntil:r.effective_until,approvalReference:r.approval_reference,approvedAt:r.approved_at,
   approvedBy:r.approved_by,isActive:Boolean(r.is_active),createdAt:r.created_at}))});
 }catch(error){return apiError(error)}
}

export async function POST(request:NextRequest,context:Context){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const {entityId}=await context.params;
  const actor=requireFinanceConfigurationApprover(await requirePermissionForEntity("settings:manage",entityId));
  const input=taxRegistrationCreateSchema.parse(await request.json());
  conn=await pool.getConnection();await conn.beginTransaction();
  const [entities]=await conn.execute<(RowDataPacket & {is_active:number})[]>("SELECT is_active FROM legal_entities WHERE id=? FOR UPDATE",[entityId]);
  if(!entities.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found"}},404)}
  if(!entities[0].is_active){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Tax registrations cannot be added to an inactive legal entity."}},409)}
  const [priorRows]=await conn.execute<(RowDataPacket & {id:string;version_number:number;effective_from_date:string;effective_until_date:string|null;is_active:number})[]>(
   `SELECT id,version_number,DATE_FORMAT(effective_from,'%Y-%m-%d') AS effective_from_date,
      DATE_FORMAT(effective_until,'%Y-%m-%d') AS effective_until_date,is_active
    FROM legal_entity_tax_registrations
    WHERE legal_entity_id=? AND registration_key=? ORDER BY version_number DESC LIMIT 1 FOR UPDATE`,[entityId,input.registrationKey]);
  const prior=priorRows[0];
  // MySQL DATE columns are returned as JavaScript Date objects by default. Query formatted
  // calendar-date strings explicitly so version comparisons are timezone-independent.
  if(prior&&input.effectiveFrom<=prior.effective_from_date){
   await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"A revision must start after the previous version's effective start date. Add a new registration key for a distinct registration."}},409)
  }
  if(prior&&prior.is_active&&(!prior.effective_until_date||prior.effective_until_date>=input.effectiveFrom)){
   const priorEndDate=new Date(input.effectiveFrom+"T00:00:00.000Z");priorEndDate.setUTCDate(priorEndDate.getUTCDate()-1);
   const end=priorEndDate.toISOString().slice(0,10);
   if(end<prior.effective_from_date){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Registration revision would create an invalid effective period."}},409)}
   await conn.execute("UPDATE legal_entity_tax_registrations SET effective_until=? WHERE id=?",[end,prior.id]);
  }
  if(input.isPrimary){
   const [overlap]=await conn.execute<(RowDataPacket & {id:string})[]>(
    `SELECT id FROM legal_entity_tax_registrations WHERE legal_entity_id=? AND registration_type=? AND is_primary=TRUE AND is_active=TRUE
      AND LOWER(TRIM(jurisdiction))=LOWER(?)
      AND effective_from<=COALESCE(?,'9999-12-31') AND COALESCE(effective_until,'9999-12-31')>=?
      AND registration_key<>? FOR UPDATE`,
    [entityId,input.registrationType,input.jurisdiction,input.effectiveUntil||"9999-12-31",input.effectiveFrom,input.registrationKey]);
   if(overlap.length){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Another primary registration of this type overlaps the requested effective period."}},409)}
  }
  const id=randomUUID();const version=Number(prior?.version_number??0)+1;
  await conn.execute(
   `INSERT INTO legal_entity_tax_registrations
    (id,legal_entity_id,registration_key,version_number,registration_type,jurisdiction,registration_number,display_label,is_primary,
     effective_from,effective_until,approval_reference,approved_by,approved_at,is_active,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3),TRUE,?)`,
   [id,entityId,input.registrationKey,version,input.registrationType,input.jurisdiction,input.registrationNumber,input.displayLabel,
    input.isPrimary?1:0,input.effectiveFrom,input.effectiveUntil||null,input.approvalReference,actor.userId,actor.userId]);
  await recordAudit(conn,actor.userId,"tax_registration.version_created","legal_entity_tax_registration",id,input.changeReason,
   prior?{registrationKey:input.registrationKey,versionNumber:Number(prior.version_number),previousRegistrationId:prior.id}:null,
   {legalEntityId:entityId,registrationKey:input.registrationKey,versionNumber:version,registrationType:input.registrationType,
    jurisdiction:input.jurisdiction,displayLabel:input.displayLabel,isPrimary:input.isPrimary,effectiveFrom:input.effectiveFrom,
    effectiveUntil:input.effectiveUntil||null,approvalReference:input.approvalReference});
  await conn.commit();
  return jsonNoStore({data:{id,legalEntityId:entityId,registrationKey:input.registrationKey,versionNumber:version,registrationType:input.registrationType,
    jurisdiction:input.jurisdiction,registrationNumber:input.registrationNumber,displayLabel:input.displayLabel,isPrimary:input.isPrimary,
    effectiveFrom:input.effectiveFrom,effectiveUntil:input.effectiveUntil||null,approvalReference:input.approvalReference,isActive:true}},201);
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
