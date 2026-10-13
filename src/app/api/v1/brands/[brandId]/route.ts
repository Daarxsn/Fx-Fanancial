import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { brandUpdateSchema } from "@/lib/validation/configuration";
import { canonicalJson, recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{brandId:string}>};
function jsonVal(v:unknown){if(typeof v!=="string")return v;try{return JSON.parse(v)}catch{return null}}

export async function GET(_request:NextRequest,context:Context){
 try{
  const {brandId}=await context.params;const actor=await requirePermission("settings:manage");
  const [mappings]=await pool.execute<(RowDataPacket & {legal_entity_id:string})[]>("SELECT legal_entity_id FROM brand_legal_entities WHERE brand_id=? ORDER BY legal_entity_id",[brandId]);
  if(!mappings.length||mappings.some(m=>!actor.legalEntityIds.includes(m.legal_entity_id)))return jsonNoStore({error:{code:"NOT_FOUND",message:"Brand not found in your assigned scope."}},404);
  const [rows]=await pool.execute<(RowDataPacket & {id:string;name:string;code:string;description:string|null;logo_reference:string|null;theme_json:unknown;default_template_key:string|null;is_active:number;created_at:Date;updated_at:Date})[]>(
   "SELECT id,name,code,description,logo_reference,theme_json,default_template_key,is_active,created_at,updated_at FROM brands WHERE id=? LIMIT 1",[brandId]);
  if(!rows.length)return jsonNoStore({error:{code:"NOT_FOUND",message:"Brand not found"}},404);
  const [versions]=await pool.execute<(RowDataPacket & {version_number:number;effective_from:Date;change_reason:string;created_at:Date})[]>(
   "SELECT version_number,effective_from,change_reason,created_at FROM brand_config_versions WHERE brand_id=? ORDER BY version_number DESC LIMIT 50",[brandId]);
  return jsonNoStore({data:{...rows[0],theme:jsonVal(rows[0].theme_json),isActive:Boolean(rows[0].is_active),legalEntityIds:mappings.map(m=>m.legal_entity_id),
   versions:versions.map(v=>({versionNumber:Number(v.version_number),effectiveFrom:v.effective_from,changeReason:v.change_reason,createdAt:v.created_at}))}});
 }catch(error){return apiError(error)}
}

export async function PATCH(request:NextRequest,context:Context){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const {brandId}=await context.params;const actor=await requirePermission("settings:manage");
  const input=brandUpdateSchema.parse(await request.json());const {changeReason,legalEntityIds:incomingIds,...patch}=input;
  conn=await pool.getConnection();await conn.beginTransaction();
  const [currentRows]=await conn.execute<(RowDataPacket & {id:string;name:string;code:string;description:string|null;logo_reference:string|null;theme_json:unknown;default_template_key:string|null;is_active:number})[]>(
   "SELECT id,name,code,description,logo_reference,theme_json,default_template_key,is_active FROM brands WHERE id=? FOR UPDATE",[brandId]);
  if(!currentRows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Brand not found"}},404)}
  const [currentMappings]=await conn.execute<(RowDataPacket & {legal_entity_id:string;is_default:number})[]>(
   "SELECT legal_entity_id,is_default FROM brand_legal_entities WHERE brand_id=? ORDER BY is_default DESC,legal_entity_id FOR UPDATE",[brandId]);
  if(!currentMappings.length||currentMappings.some(m=>!actor.legalEntityIds.includes(m.legal_entity_id))){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Brand not found in your assigned scope."}},404)}
  const desiredIds=incomingIds?[...new Set(incomingIds)]:currentMappings.map(m=>m.legal_entity_id);
  if(incomingIds&&desiredIds.length!==incomingIds.length){await conn.rollback();return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"Duplicate legal entity mappings are not allowed"}},400)}
  if(desiredIds.some(id=>!actor.legalEntityIds.includes(id))){await conn.rollback();return jsonNoStore({error:{code:"FORBIDDEN",message:"Every brand mapping must be within your assigned legal-entity scope."}},403)}
  if(incomingIds){
   const [entities]=await conn.query<(RowDataPacket & {id:string;is_active:number})[]>(
    `SELECT id,is_active FROM legal_entities WHERE id IN (${desiredIds.map(()=>"?").join(",")}) FOR UPDATE`,desiredIds);
   if(entities.length!==desiredIds.length||entities.some(e=>!e.is_active)){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Each brand mapping must reference an existing active legal entity."}},409)}
  }
  const assigns:string[]=[];const vals:unknown[]=[];const add=(col:string,val:unknown)=>{assigns.push(`${col}=?`);vals.push(val)};
  if(patch.name!==undefined)add("name",patch.name);
  if(patch.description!==undefined)add("description",patch.description||null);
  if(patch.logoReference!==undefined)add("logo_reference",patch.logoReference||null);
  if(patch.theme!==undefined)add("theme_json",JSON.stringify(patch.theme));
  if(patch.defaultTemplateKey!==undefined)add("default_template_key",patch.defaultTemplateKey||null);
  if(patch.isActive!==undefined)add("is_active",patch.isActive?1:0);
  if(assigns.length)await conn.execute(`UPDATE brands SET ${assigns.join(",")} WHERE id=?`,[...vals,brandId]);
  if(incomingIds){
   await conn.execute("DELETE FROM brand_legal_entities WHERE brand_id=?",[brandId]);
   for(let i=0;i<desiredIds.length;i++)await conn.execute(
    "INSERT INTO brand_legal_entities (brand_id,legal_entity_id,is_default,effective_from) VALUES (?,?,?,CURRENT_DATE())",
    [brandId,desiredIds[i],i===0?1:0]);
  }
  const [fresh]=await conn.execute<(RowDataPacket & {name:string;code:string;description:string|null;logo_reference:string|null;theme_json:unknown;default_template_key:string|null;is_active:number})[]>(
   "SELECT name,code,description,logo_reference,theme_json,default_template_key,is_active FROM brands WHERE id=?",[brandId]);
  const versionRow=await conn.execute<(RowDataPacket & {version_number:number})[]>(
   "SELECT version_number FROM brand_config_versions WHERE brand_id=? ORDER BY version_number DESC LIMIT 1 FOR UPDATE",[brandId]);
  const version=Number(versionRow[0][0]?.version_number??0)+1;const row=fresh[0];
  const snapshot={schemaVersion:1,brandId,...row,theme:jsonVal(row.theme_json),isActive:Boolean(row.is_active),legalEntityIds:desiredIds};
  await conn.execute("INSERT INTO brand_config_versions (id,brand_id,version_number,effective_from,config_snapshot,change_reason,changed_by) VALUES (?,?,?,NOW(3),?,?,?)",
   [randomUUID(),brandId,version,canonicalJson(snapshot),changeReason,actor.userId]);
  await recordAudit(conn,actor.userId,"brand.configuration_changed","brand",brandId,changeReason,
   {configVersion:version-1,legalEntityIds:currentMappings.map(m=>m.legal_entity_id)},
   {configVersion:version,legalEntityIds:desiredIds,changedFields:[...Object.keys(patch),...(incomingIds?["legalEntityIds"]:[])]});
  await conn.commit();
  return jsonNoStore({data:{...snapshot,configVersion:version}});
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
