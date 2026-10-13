import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { businessUnitUpdateSchema } from "@/lib/validation/configuration";
import { canonicalJson, recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{businessUnitId:string}>};

export async function PATCH(request:NextRequest,context:Context){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const {businessUnitId}=await context.params;const actor=await requirePermission("settings:manage");
  const input=businessUnitUpdateSchema.parse(await request.json());const {changeReason,legalEntityIds:incomingEntityIds,brandIds:incomingBrandIds,...patch}=input;
  conn=await pool.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute<(RowDataPacket & {id:string;code:string;name:string;description:string|null;is_active:number})[]>(
   "SELECT id,code,name,description,is_active FROM business_units WHERE id=? FOR UPDATE",[businessUnitId]);
  if(!rows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Business unit not found"}},404)}
  const [oldEntities]=await conn.execute<(RowDataPacket & {legal_entity_id:string;is_primary:number})[]>(
   "SELECT legal_entity_id,is_primary FROM business_unit_legal_entities WHERE business_unit_id=? AND effective_from<=CURRENT_DATE() AND (effective_until IS NULL OR effective_until>=CURRENT_DATE()) FOR UPDATE",[businessUnitId]);
  if(!oldEntities.length||oldEntities.some(e=>!actor.legalEntityIds.includes(e.legal_entity_id))){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Business unit not found in your assigned scope."}},404)}
  const [oldBrands]=await conn.execute<(RowDataPacket & {brand_id:string})[]>(
   "SELECT brand_id FROM brand_business_units WHERE business_unit_id=? AND effective_from<=CURRENT_DATE() AND (effective_until IS NULL OR effective_until>=CURRENT_DATE()) FOR UPDATE",[businessUnitId]);
  const entityIds=incomingEntityIds?[...incomingEntityIds]:oldEntities.map(e=>e.legal_entity_id);
  const brandIds=incomingBrandIds?[...incomingBrandIds]:oldBrands.map(e=>e.brand_id);
  if(entityIds.some(id=>!actor.legalEntityIds.includes(id))){await conn.rollback();return jsonNoStore({error:{code:"FORBIDDEN",message:"Every mapping must be within your assigned legal-entity scope."}},403)}
  const [entities]=await conn.query<(RowDataPacket & {id:string;is_active:number})[]>(
   `SELECT id,is_active FROM legal_entities WHERE id IN (${entityIds.map(()=>"?").join(",")}) FOR UPDATE`,entityIds);
  if(entities.length!==entityIds.length||entities.some(e=>!e.is_active)){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"All mapped legal entities must exist and be active."}},409)}
  if(brandIds.length){
   const [mappings]=await conn.query<(RowDataPacket & {brand_id:string})[]>(
    `SELECT DISTINCT m.brand_id FROM brand_legal_entities m JOIN brands b ON b.id=m.brand_id
     WHERE m.brand_id IN (${brandIds.map(()=>"?").join(",")}) AND m.legal_entity_id IN (${entityIds.map(()=>"?").join(",")}) AND b.is_active=TRUE`,
    [...brandIds,...entityIds]);
   const valid=new Set(mappings.map(x=>x.brand_id));
   if(brandIds.some(id=>!valid.has(id))){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Each brand must be active and explicitly mapped to a selected legal entity."}},409)}
  }
  const assignments:string[]=[];const values:unknown[]=[];
  if(patch.name!==undefined){assignments.push("name=?");values.push(patch.name)}
  if(patch.description!==undefined){assignments.push("description=?");values.push(patch.description||null)}
  if(patch.isActive!==undefined){assignments.push("is_active=?");values.push(patch.isActive?1:0)}
  if(assignments.length)await conn.execute(`UPDATE business_units SET ${assignments.join(",")} WHERE id=?`,[...values,businessUnitId]);
  if(incomingEntityIds){
   await conn.execute("DELETE FROM business_unit_legal_entities WHERE business_unit_id=?",[businessUnitId]);
   for(let i=0;i<entityIds.length;i++)await conn.execute(
    "INSERT INTO business_unit_legal_entities (business_unit_id,legal_entity_id,is_primary,effective_from) VALUES (?,?,?,CURRENT_DATE())",
    [businessUnitId,entityIds[i],i===0?1:0]);
  }
  if(incomingBrandIds){
   await conn.execute("DELETE FROM brand_business_units WHERE business_unit_id=?",[businessUnitId]);
   for(const brandId of brandIds)await conn.execute("INSERT INTO brand_business_units (brand_id,business_unit_id,effective_from) VALUES (?,?,CURRENT_DATE())",[brandId,businessUnitId]);
  }
  const [fresh]=await conn.execute<(RowDataPacket & {code:string;name:string;description:string|null;is_active:number;updated_at:Date})[]>(
   "SELECT code,name,description,is_active,updated_at FROM business_units WHERE id=?",[businessUnitId]);
  const [latest]=await conn.execute<(RowDataPacket & {version_number:number})[]>(
   "SELECT version_number FROM business_unit_config_versions WHERE business_unit_id=? ORDER BY version_number DESC LIMIT 1 FOR UPDATE",[businessUnitId]);
  const version=Number(latest[0]?.version_number??0)+1;
  const snapshot={schemaVersion:1,businessUnitId,...fresh[0],isActive:Boolean(fresh[0].is_active),legalEntityIds:entityIds,brandIds};
  await conn.execute("INSERT INTO business_unit_config_versions (id,business_unit_id,version_number,effective_from,config_snapshot,change_reason,changed_by) VALUES (?,?,?,NOW(3),?,?,?)",
   [randomUUID(),businessUnitId,version,canonicalJson(snapshot),changeReason,actor.userId]);
  await recordAudit(conn,actor.userId,"business_unit.configuration_changed","business_unit",businessUnitId,changeReason,
   {legalEntityIds:oldEntities.map(e=>e.legal_entity_id),brandIds:oldBrands.map(b=>b.brand_id)},
   {configVersion:version,legalEntityIds:entityIds,brandIds,changedFields:[...Object.keys(patch),...(incomingEntityIds?["legalEntityIds"]:[]),...(incomingBrandIds?["brandIds"]:[])]});
  await conn.commit();return jsonNoStore({data:{...snapshot,configVersion:version}});
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
