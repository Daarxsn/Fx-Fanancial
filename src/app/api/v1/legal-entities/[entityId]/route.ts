import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { legalEntityUpdateSchema } from "@/lib/validation/configuration";
import { captureLegalEntityConfigVersion, jsonValue, loadEntity, publicLegalEntity, recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{entityId:string}>};

export async function GET(_request:NextRequest,context:Context){
  try{
    const {entityId}=await context.params;
    await requirePermissionForEntity("settings:manage",entityId);
    const row=await loadEntity(await pool.getConnection().then(async c=>{c.release();return pool.getConnection();}),entityId);
    // Query again with an owned connection so no borrowed connection survives this request.
    if(!row)return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found"}},404);
    const [versions]=await pool.execute<(RowDataPacket & {version_number:number;effective_from:Date;change_reason:string;created_at:Date})[]>(
      "SELECT version_number,effective_from,change_reason,created_at FROM legal_entity_config_versions WHERE legal_entity_id=? ORDER BY version_number DESC LIMIT 50",[entityId]);
    return jsonNoStore({data:{...publicLegalEntity(row),versions:versions.map(v=>({versionNumber:Number(v.version_number),effectiveFrom:v.effective_from,changeReason:v.change_reason,createdAt:v.created_at}))}});
  }catch(error){return apiError(error);}
}

export async function PATCH(request:NextRequest,context:Context){
  let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
  try{
    await assertCsrf(request);
    const {entityId}=await context.params;
    const actor=await requirePermissionForEntity("settings:manage",entityId);
    const input=legalEntityUpdateSchema.parse(await request.json());
    const {changeReason,...patch}=input;
    if(!Object.keys(patch).length)return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"At least one configuration field is required"}},400);
    conn=await pool.getConnection();
    await conn.beginTransaction();
    const current=await loadEntity(conn,entityId);
    if(!current){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found"}},404);}
    const assignments:string[]=[];const values:unknown[]=[];const changed:string[]=[];
    const set=(key:string,column:string,value:unknown)=>{assignments.push(`${column}=?`);values.push(value);changed.push(key);};
    if(patch.legalName!==undefined)set("legalName","legal_name",patch.legalName);
    if(patch.displayName!==undefined)set("displayName","display_name",patch.displayName);
    if(patch.registrationNumber!==undefined)set("registrationNumber","registration_number",patch.registrationNumber||null);
    if(patch.taxIdentifier!==undefined)set("taxIdentifier","tax_identifier",patch.taxIdentifier||null);
    if(patch.address!==undefined)set("address","address_json",JSON.stringify(patch.address));
    if(patch.countryCode!==undefined)set("countryCode","country_code",patch.countryCode);
    if(patch.invoiceEmail!==undefined)set("invoiceEmail","invoice_email",patch.invoiceEmail||null);
    if(patch.invoicePhone!==undefined)set("invoicePhone","invoice_phone",patch.invoicePhone||null);
    if(patch.website!==undefined)set("website","website",patch.website||null);
    if(patch.currency!==undefined)set("currency","currency",patch.currency);
    if(patch.locale!==undefined)set("locale","locale",patch.locale||null);
    if(patch.timeZone!==undefined)set("timeZone","time_zone",patch.timeZone||null);
    if(patch.logoReference!==undefined)set("logoReference","logo_reference",patch.logoReference||null);
    if(patch.bankDetails!==undefined)set("bankDetails","bank_details_json",JSON.stringify(patch.bankDetails));
    if(patch.invoiceTerms!==undefined)set("invoiceTerms","invoice_terms",patch.invoiceTerms);
    if(patch.invoiceFooter!==undefined)set("invoiceFooter","invoice_footer",patch.invoiceFooter);
    if(patch.defaultTaxCode!==undefined)set("defaultTaxCode","default_tax_code",patch.defaultTaxCode||null);
    if(patch.taxSetupStatus!==undefined){
      set("taxSetupStatus","tax_setup_status",patch.taxSetupStatus);
      set("taxSetupApprovalReference","tax_setup_approval_reference",patch.taxSetupStatus==="UNCONFIGURED"?null:patch.taxSetupApprovalReference||current.tax_setup_approval_reference);
      set("taxSetupApprovedBy","tax_setup_approved_by",patch.taxSetupStatus==="UNCONFIGURED"?null:actor.userId);
      set("taxSetupApprovedAt","tax_setup_approved_at",patch.taxSetupStatus==="UNCONFIGURED"?null:new Date());
    }else if(patch.taxSetupApprovalReference!==undefined){
      set("taxSetupApprovalReference","tax_setup_approval_reference",patch.taxSetupApprovalReference||null);
      set("taxSetupApprovedBy","tax_setup_approved_by",patch.taxSetupApprovalReference?actor.userId:null);
      set("taxSetupApprovedAt","tax_setup_approved_at",patch.taxSetupApprovalReference?new Date():null);
    }
    if(patch.isActive!==undefined){
      if(!patch.isActive){
        const [issued]=await conn.execute<(RowDataPacket & {n:number})[]>(
          "SELECT COUNT(*) AS n FROM invoices WHERE legal_entity_id=? AND status NOT IN ('DRAFT')",[entityId]);
        // Deactivation is permitted for historical records; issue services must always reject inactive entities.
        void issued;
      }
      set("isActive","is_active",patch.isActive?1:0);
    }
    if(!assignments.length){await conn.rollback();return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"No supported fields were supplied"}},400);}
    await conn.execute(`UPDATE legal_entities SET ${assignments.join(",")} WHERE id=?`,[...values,entityId]);
    const updated=await loadEntity(conn,entityId);
    if(!updated)throw new Error("Legal entity update failed");
    const version=await captureLegalEntityConfigVersion(conn,updated,actor.userId,changeReason);
    await recordAudit(conn,actor.userId,"legal_entity.configuration_changed","legal_entity",entityId,changeReason,
      {configVersion:"previous",changedFields:changed.filter(k=>k!=="bankDetails"&&k!=="taxIdentifier")},
      {configVersion:version.versionNumber,changedFields:changed.filter(k=>k!=="bankDetails"&&k!=="taxIdentifier")});
    await conn.commit();
    return jsonNoStore({data:{...publicLegalEntity(updated),configVersion:version.versionNumber}});
  }catch(error){if(conn)try{await conn.rollback();}catch{} return apiError(error);}
  finally{conn?.release();}
}
