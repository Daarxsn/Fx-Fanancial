import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { archiveSchema, uuidSchema } from "@/lib/validation/master-data";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{customerId:string}>};

export async function POST(request:NextRequest,context:Context){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const actor=await requirePermission("customers:archive");
  const {customerId}=await context.params;const id=uuidSchema.parse(customerId);
  const {expectedVersion,reason}=archiveSchema.parse(await request.json());
  conn=await pool.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute<(RowDataPacket & {record_version:number;is_active:number;name:string})[]>(
   "SELECT record_version,is_active,name FROM customers WHERE id=? FOR UPDATE",[id]);
  if(!rows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Customer not found"}},404)}
  const row=rows[0];
  if(Number(row.record_version)!==expectedVersion){await conn.rollback();return jsonNoStore({error:{code:"VERSION_CONFLICT",message:"This customer changed. Reload it before archiving."}},409)}
  if(!row.is_active){await conn.rollback();return jsonNoStore({error:{code:"ALREADY_ARCHIVED",message:"This customer is already archived."}},409)}
  const [[invoiceRef]] = await conn.query<(RowDataPacket & {total:number})[]>("SELECT COUNT(*) AS total FROM invoices WHERE customer_id=?",[id]);
  const [[quotationRef]] = await conn.query<(RowDataPacket & {total:number})[]>("SELECT COUNT(*) AS total FROM quotations WHERE customer_id=?",[id]);
  const [[paymentRef]] = await conn.query<(RowDataPacket & {total:number})[]>("SELECT COUNT(*) AS total FROM payments WHERE customer_id=?",[id]);
  const referenceCounts={invoices:Number(invoiceRef.total),quotations:Number(quotationRef.total),payments:Number(paymentRef.total)};
  await conn.execute("UPDATE customers SET is_active=FALSE,archived_at=NOW(3),archived_by=?,archive_reason=?,record_version=record_version+1,updated_by=? WHERE id=? AND record_version=?",
   [actor.userId,reason,actor.userId,id,expectedVersion]);
  await conn.execute("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,outcome,before_json,after_json) VALUES (?,?,'customer.archived','customer',?,'SUCCESS',?,?)",
   [randomUUID(),actor.userId,id,JSON.stringify({recordVersion:expectedVersion,isActive:true}),JSON.stringify({recordVersion:expectedVersion+1,isActive:false,reason,referenceCounts})]);
  await conn.commit();
  return jsonNoStore({data:{id,isActive:false,recordVersion:expectedVersion+1,archivedAt:new Date().toISOString(),referenceCounts,
   message:Object.values(referenceCounts).some(n=>n>0)?"Archived safely. Existing quotations, invoices and payments remain linked for historical access.":"Archived. The record remains recoverable for audit/history."}});
 }catch(error){return apiError(error)}finally{conn?.release()}
}
