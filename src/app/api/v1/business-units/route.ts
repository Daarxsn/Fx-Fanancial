import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { businessUnitCreateSchema } from "@/lib/validation/configuration";
import { canonicalJson, recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:NextRequest){
 try{
  const actor=await requirePermission("settings:manage");const scopes=[...new Set(actor.legalEntityIds)];
  if(!scopes.length)return jsonNoStore({data:[]});
  const query=(request.nextUrl.searchParams.get("query")??"").trim().slice(0,100);
  const status=request.nextUrl.searchParams.get("status")??"active";
  if(!["active","inactive","all"].includes(status))return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"status must be active, inactive, or all"}},400);
  const clauses=[`EXISTS (SELECT 1 FROM business_unit_legal_entities own WHERE own.business_unit_id=u.id AND own.legal_entity_id IN (${scopes.map(()=>"?").join(",")}) AND own.effective_from<=NOW(3) AND (own.effective_until IS NULL OR own.effective_until>NOW(3)))`];
  const params:unknown[]=[...scopes];
  if(status!=="all"){clauses.push("u.is_active=?");params.push(status==="active"?1:0)}
  if(query){clauses.push("(u.name LIKE ? OR u.code LIKE ?)");const safe=query.replace(/[\\\\%_]/g,"\\\\$&");params.push(`%${safe}%`,`%${safe}%`)}
  const [rows]=await pool.query<(RowDataPacket & {id:string;code:string;name:string;description:string|null;is_active:number;created_at:Date;updated_at:Date})[]>(
   `SELECT u.id,u.code,u.name,u.description,u.is_active,u.created_at,u.updated_at FROM business_units u WHERE ${clauses.join(" AND ")} ORDER BY u.name,u.id LIMIT 100`,params);
  const ids=rows.map(r=>r.id);const entitiesByUnit=new Map<string,{id:string;isPrimary:boolean}[]>();const brandsByUnit=new Map<string,string[]>();
  if(ids.length){
   const [entityRows]=await pool.query<(RowDataPacket & {business_unit_id:string;legal_entity_id:string;is_primary:number})[]>(
    `SELECT business_unit_id,legal_entity_id,is_primary FROM business_unit_legal_entities
     WHERE business_unit_id IN (${ids.map(()=>"?").join(",")}) AND legal_entity_id IN (${scopes.map(()=>"?").join(",")})
      AND effective_from<=NOW(3) AND (effective_until IS NULL OR effective_until>NOW(3))
     ORDER BY is_primary DESC,legal_entity_id`,[...ids,...scopes]);
   for(const row of entityRows){const current=entitiesByUnit.get(row.business_unit_id)??[];current.push({id:row.legal_entity_id,isPrimary:Boolean(row.is_primary)});entitiesByUnit.set(row.business_unit_id,current)}
   const [brandRows]=await pool.query<(RowDataPacket & {business_unit_id:string;brand_id:string})[]>(
    `SELECT bu.business_unit_id,bu.brand_id FROM brand_business_units bu
     JOIN brands b ON b.id=bu.brand_id
     JOIN business_unit_legal_entities ue ON ue.business_unit_id=bu.business_unit_id
     JOIN brand_legal_entities be ON be.brand_id=b.id AND be.legal_entity_id=ue.legal_entity_id
      AND be.effective_from<=NOW(3) AND (be.effective_until IS NULL OR be.effective_until>NOW(3))
     WHERE bu.business_unit_id IN (${ids.map(()=>"?").join(",")}) AND ue.legal_entity_id IN (${scopes.map(()=>"?").join(",")})
      AND bu.effective_from<=NOW(3) AND (bu.effective_until IS NULL OR bu.effective_until>NOW(3))
      AND ue.effective_from<=NOW(3) AND (ue.effective_until IS NULL OR ue.effective_until>NOW(3))
      AND b.is_active=TRUE
     GROUP BY bu.business_unit_id,bu.brand_id ORDER BY bu.brand_id`,[...ids,...scopes]);
   for(const row of brandRows){const current=brandsByUnit.get(row.business_unit_id)??[];current.push(row.brand_id);brandsByUnit.set(row.business_unit_id,current)}
  }
  return jsonNoStore({data:rows.map(r=>({id:r.id,code:r.code,name:r.name,description:r.description,isActive:Boolean(r.is_active),
   legalEntities:entitiesByUnit.get(r.id)??[],brandIds:brandsByUnit.get(r.id)??[],createdAt:r.created_at,updatedAt:r.updated_at}))});
 }catch(error){return apiError(error)}
}

export async function POST(request:NextRequest){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
  await assertCsrf(request);const actor=await requirePermission("settings:manage");const input=businessUnitCreateSchema.parse(await request.json());
  const entityIds=[...input.legalEntityIds],brandIds=[...input.brandIds];
  if([...entityIds,...brandIds].length===0)return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"Map the business unit to at least one legal entity."}},400);
  if(entityIds.some(id=>!actor.legalEntityIds.includes(id)))return jsonNoStore({error:{code:"FORBIDDEN",message:"Every business-unit legal-entity mapping must be within your assigned scope."}},403);
  conn=await pool.getConnection();await conn.beginTransaction();
  const [entities]=await conn.query<(RowDataPacket & {id:string;is_active:number})[]>(
   `SELECT id,is_active FROM legal_entities WHERE id IN (${entityIds.map(()=>"?").join(",")}) FOR UPDATE`,entityIds);
  if(entities.length!==entityIds.length||entities.some(e=>!e.is_active)){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"All mapped legal entities must exist and be active."}},409)}
  if(brandIds.length){
   const [mappings]=await conn.query<(RowDataPacket & {brand_id:string;legal_entity_id:string})[]>(
    `SELECT m.brand_id,m.legal_entity_id FROM brand_legal_entities m JOIN brands b ON b.id=m.brand_id
     WHERE m.brand_id IN (${brandIds.map(()=>"?").join(",")}) AND m.legal_entity_id IN (${entityIds.map(()=>"?").join(",")})
      AND b.is_active=TRUE AND m.effective_from<=NOW(3) AND (m.effective_until IS NULL OR m.effective_until>NOW(3))`,[...brandIds,...entityIds]);
   const valid=new Set(mappings.map(m=>m.brand_id));
   if(brandIds.some(id=>!valid.has(id))){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Every brand must be active and explicitly mapped to at least one of the selected legal entities."}},409)}
  }
  const id=randomUUID();
  await conn.execute("INSERT INTO business_units (id,code,name,description,is_active,created_by) VALUES (?,?,?,?,TRUE,?)",
   [id,input.code,input.name,input.description||null,actor.userId]);
  for(let i=0;i<entityIds.length;i++)await conn.execute(
   "INSERT INTO business_unit_legal_entities (business_unit_id,legal_entity_id,is_primary,effective_from) VALUES (?,?,?,NOW(3))",
   [id,entityIds[i],i===0?1:0]);
  for(const brandId of brandIds)await conn.execute(
   "INSERT INTO brand_business_units (brand_id,business_unit_id,effective_from) VALUES (?,?,NOW(3))",[brandId,id]);
  const snapshot={schemaVersion:1,businessUnitId:id,code:input.code,name:input.name,description:input.description||null,isActive:true,legalEntityIds:entityIds,brandIds};
  await conn.execute("INSERT INTO business_unit_config_versions (id,business_unit_id,version_number,effective_from,config_snapshot,change_reason,changed_by) VALUES (?,?,1,NOW(3),?,?,?)",
   [randomUUID(),id,canonicalJson(snapshot),input.changeReason,actor.userId]);
  await recordAudit(conn,actor.userId,"business_unit.created","business_unit",id,input.changeReason,null,
   {...snapshot,configVersion:1});
  await conn.commit();
  return jsonNoStore({data:{id,...snapshot,configVersion:1}},201);
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
