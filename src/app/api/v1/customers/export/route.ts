import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { buildCsv } from "@/lib/master-data/csv";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const MAX_EXPORT_ROWS=10_000;

export async function GET(request:NextRequest){
 try{
  const actor=await requirePermission("customers:read");
  const status=request.nextUrl.searchParams.get("status")??"active";
  if(!["active","archived","all"].includes(status))return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"status must be active, archived, or all"}},400);
  const clauses:string[]=[];const params:unknown[]=[];
  if(status!=="all"){clauses.push("c.is_active=?");params.push(status==="active"?1:0)}
  const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
  const [rows]=await pool.query<(RowDataPacket & {
   customer_code:string|null;name:string;email:string|null;phone:string|null;billing_address_json:unknown;shipping_address_json:unknown;
   purchase_order_reference:string|null;payment_terms_days:number;tax_identifier:string|null;notes:string|null;is_active:number;
   contacts_json:unknown;tax_identifiers_json:unknown;created_at:Date;updated_at:Date;
  })[]>(
   `SELECT c.customer_code,c.name,c.email,c.phone,c.billing_address_json,c.shipping_address_json,c.purchase_order_reference,
     c.payment_terms_days,c.tax_identifier,c.notes,c.is_active,c.created_at,c.updated_at,
     (SELECT JSON_ARRAYAGG(JSON_OBJECT('fullName',cc.full_name,'jobTitle',cc.job_title,'email',cc.email,'phone',cc.phone,'isPrimary',cc.is_primary))
       FROM customer_contacts cc WHERE cc.customer_id=c.id) AS contacts_json,
     (SELECT JSON_ARRAYAGG(JSON_OBJECT('identifierType',ti.identifier_type,'countryCode',ti.country_code,'jurisdiction',ti.jurisdiction,'identifierValue',ti.identifier_value))
       FROM customer_tax_identifiers ti WHERE ti.customer_id=c.id) AS tax_identifiers_json
    FROM customers c ${where} ORDER BY c.name,c.id LIMIT ?`,
   [...params,MAX_EXPORT_ROWS+1]);
  if(rows.length>MAX_EXPORT_ROWS)return jsonNoStore({error:{code:"EXPORT_LIMIT_EXCEEDED",message:`Export contains more than ${MAX_EXPORT_ROWS} rows. Narrow the status filter or use paginated views.`}},413);
  const sensitive=actor.permissions.includes("settings:manage");
  const headers=[
   "customerCode","name","email","phone","billingAddressJson","shippingAddressJson","purchaseOrderReference","paymentTermsDays",
   ...(sensitive?["taxIdentifier","taxIdentifiersJson","contactsJson","internalNotes"]:[]),"isActive","createdAt","updatedAt",
  ];
  const data=rows.map(row=>({
   customerCode:row.customer_code,name:row.name,email:row.email,phone:row.phone,
   billingAddressJson:row.billing_address_json===null||row.billing_address_json===undefined?"":typeof row.billing_address_json==="string"?row.billing_address_json:JSON.stringify(row.billing_address_json),
   shippingAddressJson:row.shipping_address_json===null||row.shipping_address_json===undefined?"":typeof row.shipping_address_json==="string"?row.shipping_address_json:JSON.stringify(row.shipping_address_json),
   purchaseOrderReference:row.purchase_order_reference,paymentTermsDays:Number(row.payment_terms_days),
   ...(sensitive?{
     taxIdentifier:row.tax_identifier,
     taxIdentifiersJson:row.tax_identifiers_json===null||row.tax_identifiers_json===undefined?"":typeof row.tax_identifiers_json==="string"?row.tax_identifiers_json:JSON.stringify(row.tax_identifiers_json),
     contactsJson:row.contacts_json===null||row.contacts_json===undefined?"":typeof row.contacts_json==="string"?row.contacts_json:JSON.stringify(row.contacts_json),
     internalNotes:row.notes,
   }:{}),
   isActive:Boolean(row.is_active),createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),
  }));
  const csv=buildCsv(headers,data);
  return new Response(csv,{status:200,headers:{
   "Content-Type":"text/csv; charset=utf-8",
   "Content-Disposition":'attachment; filename="falchion-customers.csv"',
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Request-Id":randomUUID(),
  }});
 }catch(error){return apiError(error)}
}
