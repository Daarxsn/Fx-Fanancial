import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { customerUpdateSchema, uuidSchema } from "@/lib/validation/master-data";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{customerId:string}>};
function jsonValue(value:unknown):unknown { if(typeof value!=="string")return value;try{return JSON.parse(value)}catch{return null} }
function normalizeIdentifier(value:string):string{return value.trim().toUpperCase().replace(/[\s-]/g,"")}
function duplicateEntry(error:unknown):boolean{return typeof error==="object"&&error!==null&&"code" in error&&(error as {code?:string}).code==="ER_DUP_ENTRY"}

export async function GET(_request:NextRequest,context:Context){
 try{
  const actor=await requirePermission("customers:read");
  const {customerId}=await context.params;const id=uuidSchema.parse(customerId);
  const [rows]=await pool.execute<(RowDataPacket & {
   id:string;customer_code:string|null;name:string;email:string|null;phone:string|null;
   billing_address_json:unknown;shipping_address_json:unknown;purchase_order_reference:string|null;
   payment_terms_days:number;tax_identifier:string|null;notes:string|null;is_active:number;record_version:number;
   archived_at:Date|null;archive_reason:string|null;created_at:Date;updated_at:Date;
  })[]>(
   `SELECT id,customer_code,name,email,phone,billing_address_json,shipping_address_json,purchase_order_reference,
           payment_terms_days,tax_identifier,notes,is_active,record_version,archived_at,archive_reason,created_at,updated_at
    FROM customers WHERE id=? LIMIT 1`,[id]);
  if(!rows.length)return jsonNoStore({error:{code:"NOT_FOUND",message:"Customer not found"}},404);
  const [contacts]=await pool.execute<(RowDataPacket & {id:string;full_name:string;job_title:string|null;email:string|null;phone:string|null;is_primary:number})[]>(
   "SELECT id,full_name,job_title,email,phone,is_primary FROM customer_contacts WHERE customer_id=? ORDER BY is_primary DESC,full_name,id",[id]);
  const [taxIdentifiers]=await pool.execute<(RowDataPacket & {id:string;identifier_type:string;country_code:string|null;jurisdiction:string|null;identifier_value:string})[]>(
   "SELECT id,identifier_type,country_code,jurisdiction,identifier_value FROM customer_tax_identifiers WHERE customer_id=? ORDER BY identifier_type,country_code,id",[id]);
  const row=rows[0];
  return jsonNoStore({data:{
   id:row.id,customerCode:row.customer_code,name:row.name,email:row.email,phone:row.phone,
   billingAddress:jsonValue(row.billing_address_json),shippingAddress:jsonValue(row.shipping_address_json),
   purchaseOrderReference:row.purchase_order_reference,paymentTermsDays:Number(row.payment_terms_days),
   taxIdentifier:row.tax_identifier,contacts:contacts.map(c=>({id:c.id,fullName:c.full_name,jobTitle:c.job_title,email:c.email,phone:c.phone,isPrimary:Boolean(c.is_primary)})),
   taxIdentifiers:taxIdentifiers.map(t=>({id:t.id,identifierType:t.identifier_type,countryCode:t.country_code,jurisdiction:t.jurisdiction,identifierValue:t.identifier_value})),
   ...(actor.permissions.includes("settings:manage")?{notes:row.notes}:{}),
   isActive:Boolean(row.is_active),recordVersion:Number(row.record_version),archivedAt:row.archived_at,archiveReason:row.archive_reason,
   createdAt:row.created_at,updatedAt:row.updated_at,
  }});
 }catch(error){return apiError(error)}
}

export async function PATCH(request:NextRequest,context:Context){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);
  const actor=await requirePermission("customers:write");
  const {customerId}=await context.params;const id=uuidSchema.parse(customerId);
  const input=customerUpdateSchema.parse(await request.json());
  const {expectedVersion,contacts,taxIdentifiers,...patch}=input;
  conn=await pool.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute<(RowDataPacket & {
   id:string;customer_code:string|null;name:string;email:string|null;phone:string|null;tax_identifier:string|null;
   is_active:number;record_version:number;notes:string|null;
  })[]>("SELECT id,customer_code,name,email,phone,tax_identifier,is_active,record_version,notes FROM customers WHERE id=? FOR UPDATE",[id]);
  if(!rows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Customer not found"}},404)}
  const row=rows[0];
  if(Number(row.record_version)!==expectedVersion){await conn.rollback();return jsonNoStore({error:{code:"VERSION_CONFLICT",message:"This customer changed since you opened it. Reload the record and review the latest values."}},409)}
  if(!row.is_active){await conn.rollback();return jsonNoStore({error:{code:"ARCHIVED_RECORD",message:"Archived customers cannot be edited."}},409)}
  const next={customerCode:patch.customerCode!==undefined?(patch.customerCode.trim()||null):row.customer_code,
   name:patch.name??row.name,email:patch.email!==undefined?(patch.email.trim().toLowerCase()||null):row.email,
   phone:patch.phone!==undefined?(patch.phone.trim()||null):row.phone,
   taxIdentifier:patch.taxIdentifier!==undefined?(patch.taxIdentifier.trim()||null):row.tax_identifier};
  const duplicates:unknown[]=[];
  const duplicateConditions:string[]=[];const duplicateParams:unknown[]=[];
  if(next.name){duplicateConditions.push("LOWER(name)=LOWER(?)");duplicateParams.push(next.name)}
  if(next.email){duplicateConditions.push("LOWER(email)=LOWER(?)");duplicateParams.push(next.email)}
  if(next.phone){duplicateConditions.push("phone=?");duplicateParams.push(next.phone)}
  if(next.taxIdentifier){duplicateConditions.push("UPPER(REPLACE(REPLACE(tax_identifier,' ',''),'-',''))=?");duplicateParams.push(normalizeIdentifier(next.taxIdentifier))}
  if(next.customerCode){duplicateConditions.push("LOWER(customer_code)=LOWER(?)");duplicateParams.push(next.customerCode)}
  if(duplicateConditions.length){
   const [matches]=await conn.query<(RowDataPacket & {id:string;name:string;customer_code:string|null})[]>(
    `SELECT id,name,customer_code FROM customers WHERE id<>? AND (${duplicateConditions.join(" OR ")}) ORDER BY name,id LIMIT 8`,[id,...duplicateParams]);
   for(const match of matches){
    const matchOn=[
     next.name.toLowerCase()===match.name.toLowerCase()?"name":null,
     next.customerCode&&match.customer_code?.toLowerCase()===next.customerCode.toLowerCase()?"customerCode":null,
    ].filter(Boolean);
    duplicates.push({id:match.id,name:match.name,customerCode:match.customer_code,matchOn:matchOn.length?matchOn:["otherField"]});
   }
  }
  const assignments:string[]=[];const values:(string|number|null)[]=[];const changed:string[]=[];
  const set=(field:string,column:string,value:string|number|null)=>{assignments.push(`${column}=?`);values.push(value);changed.push(field)};
  if(patch.customerCode!==undefined)set("customerCode","customer_code",next.customerCode);
  if(patch.name!==undefined)set("name","name",next.name);
  if(patch.email!==undefined)set("email","email",next.email);
  if(patch.phone!==undefined)set("phone","phone",next.phone);
  if(patch.billingAddress!==undefined)set("billingAddress","billing_address_json",JSON.stringify(patch.billingAddress));
  if(patch.shippingAddress!==undefined)set("shippingAddress","shipping_address_json",JSON.stringify(patch.shippingAddress));
  if(patch.purchaseOrderReference!==undefined)set("purchaseOrderReference","purchase_order_reference",patch.purchaseOrderReference.trim()||null);
  if(patch.paymentTermsDays!==undefined)set("paymentTermsDays","payment_terms_days",patch.paymentTermsDays);
  if(patch.taxIdentifier!==undefined)set("taxIdentifier","tax_identifier",next.taxIdentifier);
  if(patch.notes!==undefined){
   if(!actor.permissions.includes("settings:manage")){await conn.rollback();return jsonNoStore({error:{code:"FORBIDDEN",message:"Internal notes are restricted to finance/settings administrators."}},403)}
   set("notes","notes",patch.notes);
  }
  if(assignments.length){
   await conn.execute(`UPDATE customers SET ${assignments.join(",")},record_version=record_version+1,updated_by=? WHERE id=? AND record_version=?`,
    [...values,actor.userId,id,expectedVersion]);
  }else{
   // A contact/tax-only edit still advances the master-data version so concurrent updates conflict safely.
   await conn.execute("UPDATE customers SET record_version=record_version+1,updated_by=? WHERE id=? AND record_version=?",[actor.userId,id,expectedVersion]);
  }
  if(contacts!==undefined){
   if(contacts.filter(c=>c.isPrimary).length>1){await conn.rollback();return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"Only one primary contact can be selected."}},400)}
   await conn.execute("DELETE FROM customer_contacts WHERE customer_id=?",[id]);
   for(const c of contacts)await conn.execute(
    "INSERT INTO customer_contacts (id,customer_id,full_name,job_title,email,phone,is_primary) VALUES (?,?,?,?,?,?,?)",
    [randomUUID(),id,c.fullName,c.jobTitle?.trim()||null,c.email?.trim().toLowerCase()||null,c.phone?.trim()||null,c.isPrimary?1:0]);
   changed.push("contacts");
  }
  if(taxIdentifiers!==undefined){
   await conn.execute("DELETE FROM customer_tax_identifiers WHERE customer_id=?",[id]);
   for(const t of taxIdentifiers){
    const val=t.identifierValue.trim();
    await conn.execute("INSERT INTO customer_tax_identifiers (id,customer_id,identifier_type,country_code,jurisdiction,identifier_value,normalized_identifier,created_by) VALUES (?,?,?,?,?,?,?,?)",
    [randomUUID(),id,t.identifierType.trim().toUpperCase(),t.countryCode?.trim().toUpperCase()||null,t.jurisdiction?.trim()||null,val,normalizeIdentifier(val),actor.userId]);
   }
   changed.push("taxIdentifiers");
  }
  await conn.execute(
   "INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,outcome,before_json,after_json) VALUES (?,?,'customer.updated','customer',?,'SUCCESS',?,?)",
   [randomUUID(),actor.userId,id,JSON.stringify({recordVersion:expectedVersion}),JSON.stringify({recordVersion:expectedVersion+1,changedFields:changed})]);
  await conn.commit();
  return jsonNoStore({data:{id, ...next,
   ...(patch.billingAddress!==undefined?{billingAddress:patch.billingAddress}:{}),
   ...(patch.shippingAddress!==undefined?{shippingAddress:patch.shippingAddress}:{}),
   ...(patch.purchaseOrderReference!==undefined?{purchaseOrderReference:patch.purchaseOrderReference}:{}),
   ...(patch.paymentTermsDays!==undefined?{paymentTermsDays:patch.paymentTermsDays}:{}),
   ...(contacts!==undefined?{contacts}:{}),...(taxIdentifiers!==undefined?{taxIdentifiers}:{}),
   ...(actor.permissions.includes("settings:manage")&&patch.notes!==undefined?{notes:patch.notes}:{}),
   isActive:true,recordVersion:expectedVersion+1},duplicateWarnings:duplicates});
 }catch(error){
  if(duplicateEntry(error))return jsonNoStore({error:{code:"DUPLICATE_RECORD",message:"A customer code is already in use. Review existing records before retrying."}},409);
  return apiError(error);
 }finally{conn?.release()}
}
