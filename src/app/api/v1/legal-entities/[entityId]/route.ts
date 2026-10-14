import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { requireFinanceConfigurationApprover } from "@/lib/configuration/authorization";
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
    const conn=await pool.getConnection();
    let row;
    try { row=await loadEntity(conn,entityId); } finally { conn.release(); }
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
    const nextTaxStatus = patch.taxSetupStatus ?? current.tax_setup_status;
    const requestedApprovalReference = patch.taxSetupApprovalReference !== undefined
      ? (patch.taxSetupApprovalReference || null)
      : current.tax_setup_approval_reference;
    const taxStatusChanged = nextTaxStatus !== current.tax_setup_status;
    const approvalRefChanged = requestedApprovalReference !== current.tax_setup_approval_reference;
    if (taxStatusChanged || approvalRefChanged) requireFinanceConfigurationApprover(actor);
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
    if (taxStatusChanged || approvalRefChanged) {
      const newStatus = patch.taxSetupStatus ?? current.tax_setup_status;
      const newReference = newStatus === "UNCONFIGURED" ? null :
        (patch.taxSetupApprovalReference !== undefined ? (patch.taxSetupApprovalReference || null) : current.tax_setup_approval_reference);
      if (newStatus !== "UNCONFIGURED" && !newReference) {
        await conn.rollback();
        return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"An approval reference is required for approved tax setup."}},400);
      }
      set("taxSetupStatus","tax_setup_status",newStatus);
      set("taxSetupApprovalReference","tax_setup_approval_reference",newReference);
      set("taxSetupApprovedBy","tax_setup_approved_by",newStatus === "UNCONFIGURED" ? null : actor.userId);
      set("taxSetupApprovedAt","tax_setup_approved_at",newStatus === "UNCONFIGURED" ? null : new Date());
    }
    if(patch.isActive!==undefined){
      set("isActive","is_active",patch.isActive?1:0);
    }
    if(!assignments.length){await conn.rollback();return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"No supported fields were supplied"}},400);}
    await conn.execute(`UPDATE legal_entities SET ${assignments.join(",")} WHERE id=?`,[...values,entityId]);
    const updated=await loadEntity(conn,entityId);
    if(!updated)throw new Error("Legal entity update failed");
    const version=await captureLegalEntityConfigVersion(conn,updated,actor.userId,changeReason);
    // Audit values are public-safe representations: bank account details are masked to last four digits.
    await recordAudit(conn,actor.userId,"legal_entity.configuration_changed","legal_entity",entityId,changeReason,
      { ...publicLegalEntity(current), changedFields: changed },
      { ...publicLegalEntity(updated), configVersion: version.versionNumber, changedFields: changed });
    await conn.commit();
    return jsonNoStore({data:{...publicLegalEntity(updated),configVersion:version.versionNumber}});
  }catch(error){if(conn)try{await conn.rollback();}catch{} return apiError(error);}
  finally{conn?.release();}
}
