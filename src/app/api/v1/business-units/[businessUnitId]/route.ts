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

export async function GET(_request:NextRequest,context:Context){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  const {businessUnitId}=await context.params;const actor=await requirePermission("settings:manage");
  conn=await pool.getConnection();
  const [units]=await conn.execute<(RowDataPacket & {id:string;code:string;name:string;description:string|null;is_active:number;created_at:Date;updated_at:Date})[]>(
   "SELECT id,code,name,description,is_active,created_at,updated_at FROM business_units WHERE id=? LIMIT 1",[businessUnitId]);
  if(!units.length)return jsonNoStore({error:{code:"NOT_FOUND",message:"Business unit not found"}},404);
  const [entities]=await conn.execute<(RowDataPacket & {legal_entity_id:string;is_primary:number})[]>(
   `SELECT legal_entity_id,is_primary FROM business_unit_legal_entities
    WHERE business_unit_id=? AND effective_from<=NOW(3) AND (effective_until IS NULL OR effective_until>NOW(3))
    ORDER BY is_primary DESC,legal_entity_id`,[businessUnitId]);
  const scopedEntities=entities.filter(row=>actor.legalEntityIds.includes(row.legal_entity_id));
  if(!scopedEntities.length)return jsonNoStore({error:{code:"NOT_FOUND",message:"Business unit not found in your assigned scope."}},404);
  const [brands]=await conn.execute<(RowDataPacket & {brand_id:string})[]>(
   `SELECT DISTINCT bu.brand_id FROM brand_business_units bu
    JOIN brands b ON b.id=bu.brand_id
    JOIN brand_legal_entities le ON le.brand_id=b.id
    WHERE bu.business_unit_id=? AND bu.effective_from<=NOW(3) AND (bu.effective_until IS NULL OR bu.effective_until>NOW(3))
      AND le.legal_entity_id IN (${scopedEntities.map(()=>"?").join(",")})
      AND le.effective_from<=NOW(3) AND (le.effective_until IS NULL OR le.effective_until>NOW(3))
      AND b.is_active=TRUE ORDER BY bu.brand_id`,[businessUnitId,...scopedEntities.map(row=>row.legal_entity_id)]);
  const [versions]=await conn.execute<(RowDataPacket & {version_number:number;effective_from:Date;change_reason:string;created_at:Date})[]>(
   "SELECT version_number,effective_from,change_reason,created_at FROM business_unit_config_versions WHERE business_unit_id=? ORDER BY version_number DESC LIMIT 50",[businessUnitId]);
  const unit=units[0];
  return jsonNoStore({data:{id:unit.id,code:unit.code,name:unit.name,description:unit.description,isActive:Boolean(unit.is_active),
   legalEntities:scopedEntities.map(row=>({id:row.legal_entity_id,isPrimary:Boolean(row.is_primary)})),brandIds:brands.map(row=>row.brand_id),
   createdAt:unit.created_at,updatedAt:unit.updated_at,
   versions:versions.map(row=>({versionNumber:Number(row.version_number),effectiveFrom:row.effective_from,changeReason:row.change_reason,createdAt:row.created_at}))}});
 }catch(error){return apiError(error)}
 finally{conn?.release()}
}

export async function PATCH(request:NextRequest,context:Context){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const {businessUnitId}=await context.params;const actor=await requirePermission("settings:manage");
  const input=businessUnitUpdateSchema.parse(await request.json());const {changeReason,legalEntityIds:incomingEntityIds,brandIds:incomingBrandIds,...patch}=input;
  conn=await pool.getConnection();await conn.beginTransaction();
  const [rows]=await conn.execute<(RowDataPacket & {id:string;code:string;name:string;description:string|null;is_active:number})[]>(
   "SELECT id,code,name,description,is_active FROM business_units WHERE id=? FOR UPDATE",[businessUnitId]);
  if(!rows.length){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Business unit not found"}},404)}
  const [oldEntities]=await conn.execute<(RowDataPacket & {legal_entity_id:string;is_primary:number;effective_from:Date})[]>(
   "SELECT legal_entity_id,is_primary,effective_from FROM business_unit_legal_entities WHERE business_unit_id=? AND effective_from<=NOW(3) AND (effective_until IS NULL OR effective_until>NOW(3)) ORDER BY is_primary DESC,legal_entity_id FOR UPDATE",[businessUnitId]);
  if(!oldEntities.length||oldEntities.some(e=>!actor.legalEntityIds.includes(e.legal_entity_id))){await conn.rollback();return jsonNoStore({error:{code:"NOT_FOUND",message:"Business unit not found in your assigned scope."}},404)}
  const [oldBrands]=await conn.execute<(RowDataPacket & {brand_id:string;effective_from:Date})[]>(
   "SELECT brand_id,effective_from FROM brand_business_units WHERE business_unit_id=? AND effective_from<=NOW(3) AND (effective_until IS NULL OR effective_until>NOW(3)) ORDER BY brand_id FOR UPDATE",[businessUnitId]);
  const entityIds=incomingEntityIds?[...incomingEntityIds]:oldEntities.map(e=>e.legal_entity_id);
  const brandIds=incomingBrandIds?[...incomingBrandIds]:oldBrands.map(e=>e.brand_id);
  if(entityIds.some(id=>!actor.legalEntityIds.includes(id))){await conn.rollback();return jsonNoStore({error:{code:"FORBIDDEN",message:"Every mapping must be within your assigned legal-entity scope."}},403)}
  const [entities]=await conn.query<(RowDataPacket & {id:string;is_active:number})[]>(
   `SELECT id,is_active FROM legal_entities WHERE id IN (${entityIds.map(()=>"?").join(",")}) FOR UPDATE`,entityIds);
  if(entities.length!==entityIds.length||entities.some(e=>!e.is_active)){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"All mapped legal entities must exist and be active."}},409)}
  if(brandIds.length){
   const [mappings]=await conn.query<(RowDataPacket & {brand_id:string})[]>(
    `SELECT DISTINCT m.brand_id FROM brand_legal_entities m JOIN brands b ON b.id=m.brand_id
     WHERE m.brand_id IN (${brandIds.map(()=>"?").join(",")}) AND m.legal_entity_id IN (${entityIds.map(()=>"?").join(",")}) AND b.is_active=TRUE
      AND m.effective_from<=NOW(3) AND (m.effective_until IS NULL OR m.effective_until>NOW(3))`,
    [...brandIds,...entityIds]);
   const valid=new Set(mappings.map(x=>x.brand_id));
   if(brandIds.some(id=>!valid.has(id))){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Each brand must be active and explicitly mapped to a selected legal entity."}},409)}
  }
  const assignments:string[]=[];const values:(string|number|boolean|Date|null)[]=[];
  if(patch.name!==undefined){assignments.push("name=?");values.push(patch.name)}
  if(patch.description!==undefined){assignments.push("description=?");values.push(patch.description||null)}
  if(patch.isActive!==undefined){assignments.push("is_active=?");values.push(patch.isActive?1:0)}
  if(assignments.length)await conn.execute(`UPDATE business_units SET ${assignments.join(",")} WHERE id=?`,[...values,businessUnitId]);
  if(incomingEntityIds){
   const currentOrder=oldEntities.map(e=>e.legal_entity_id);
   const mappingChanged=currentOrder.length!==entityIds.length||entityIds.some((id,index)=>id!==currentOrder[index]);
   if(mappingChanged){
    for(const mapping of oldEntities)await conn.execute(`UPDATE business_unit_legal_entities SET effective_until=NOW(3)
      WHERE business_unit_id=? AND legal_entity_id=? AND effective_from=? AND (effective_until IS NULL OR effective_until>NOW(3))`,
      [businessUnitId,mapping.legal_entity_id,mapping.effective_from]);
    for(let i=0;i<entityIds.length;i++)await conn.execute(
      "INSERT INTO business_unit_legal_entities (business_unit_id,legal_entity_id,is_primary,effective_from) VALUES (?,?,?,NOW(3))",
      [businessUnitId,entityIds[i],i===0?1:0]);
   }
  }
  if(incomingBrandIds){
   const currentOrder=oldBrands.map(b=>b.brand_id);
   const mappingChanged=currentOrder.length!==brandIds.length||brandIds.some((id,index)=>id!==currentOrder[index]);
   if(mappingChanged){
    for(const mapping of oldBrands)await conn.execute(`UPDATE brand_business_units SET effective_until=NOW(3)
      WHERE brand_id=? AND business_unit_id=? AND effective_from=? AND (effective_until IS NULL OR effective_until>NOW(3))`,
      [mapping.brand_id,businessUnitId,mapping.effective_from]);
    for(const brandId of brandIds)await conn.execute(
      "INSERT INTO brand_business_units (brand_id,business_unit_id,effective_from) VALUES (?,?,NOW(3))",
      [brandId,businessUnitId]);
   }
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
   {businessUnitId,code:rows[0].code,name:rows[0].name,description:rows[0].description,isActive:Boolean(rows[0].is_active),
    legalEntityIds:oldEntities.map(e=>e.legal_entity_id),brandIds:oldBrands.map(b=>b.brand_id),configVersion:version-1},
   {...snapshot,configVersion:version,changedFields:[...Object.keys(patch),...(incomingEntityIds?["legalEntityIds"]:[]),...(incomingBrandIds?["brandIds"]:[])]});
  await conn.commit();return jsonNoStore({data:{...snapshot,configVersion:version}});
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
