import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { requireFinanceConfigurationApprover } from "@/lib/configuration/authorization";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { taxRegistrationDeactivationSchema } from "@/lib/validation/configuration";
import { recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{entityId:string;registrationId:string}>};

export async function PATCH(request:NextRequest,context:Context){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const {entityId,registrationId}=await context.params;
  const actor=requireFinanceConfigurationApprover(await requirePermissionForEntity("settings:manage",entityId));
  const input=taxRegistrationDeactivationSchema.parse(await request.json());
  conn=await pool.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute<(RowDataPacket & {id:string;is_active:number;registration_key:string;version_number:number;registration_type:string})[]>(
   "SELECT id,is_active,registration_key,version_number,registration_type FROM legal_entity_tax_registrations WHERE id=? AND legal_entity_id=? FOR UPDATE",
   [registrationId,entityId]);
  if(!rows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Tax registration not found"}},404)}
  const row=rows[0];
  if(input.isActive){await conn.rollback();return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"Tax registration versions cannot be reactivated. Create a new version with a new effective period and approval reference."}},400)}
  if(!row.is_active){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Tax registration is already inactive."}},409)}
  await conn.execute("UPDATE legal_entity_tax_registrations SET is_active=FALSE WHERE id=?",[registrationId]);
  await recordAudit(conn,actor.userId,"tax_registration.deactivated","legal_entity_tax_registration",registrationId,input.changeReason,
   {isActive:true,registrationKey:row.registration_key,versionNumber:Number(row.version_number)},
   {isActive:false,registrationKey:row.registration_key,versionNumber:Number(row.version_number),registrationType:row.registration_type});
  await conn.commit();return jsonNoStore({data:{id:registrationId,isActive:false}});
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
