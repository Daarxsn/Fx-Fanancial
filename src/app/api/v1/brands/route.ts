import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db/pool";
import { requirePermission } from "@/lib/auth/authorize";
import { assertCsrf } from "@/lib/auth/csrf";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { brandCreateSchema } from "@/lib/validation/configuration";
import { canonicalJson, recordAudit } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function parseJson(value:unknown):unknown{
 if(typeof value!=="string")return value;
 try{return JSON.parse(value)}catch{return null}
}

export async function GET(request:NextRequest){
 try{
   const actor=await requirePermission("settings:manage");
   const scopes=[...new Set(actor.legalEntityIds)];
   if(!scopes.length)return jsonNoStore({data:[],pagination:{limit:100,offset:0,hasMore:false}});
   const query=(request.nextUrl.searchParams.get("query")??"").trim().slice(0,100);
   const status=request.nextUrl.searchParams.get("status")??"active";
   if(!["active","inactive","all"].includes(status))return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"status must be active, inactive, or all"}},400);
   const clauses=[`ble.legal_entity_id IN (${scopes.map(()=>"?").join(",")})`];
   const params:unknown[]=[...scopes];
   if(status!=="all"){clauses.push("b.is_active = ?");params.push(status==="active"?1:0)}
   if(query){clauses.push("(b.name LIKE ? OR b.code LIKE ?)");const safe=query.replace(/[\\\\%_]/g,"\\\\$&");params.push(`%${safe}%`,`%${safe}%`)}
   const [rows]=await pool.query<(RowDataPacket & {id:string;name:string;code:string;description:string|null;logo_reference:string|null;theme_json:unknown;default_template_key:string|null;is_active:number;created_at:Date;updated_at:Date})[]>(
     `SELECT DISTINCT b.id,b.name,b.code,b.description,b.logo_reference,b.theme_json,b.default_template_key,b.is_active,b.created_at,b.updated_at
      FROM brands b JOIN brand_legal_entities ble ON ble.brand_id=b.id WHERE ${clauses.join(" AND ")}
      ORDER BY b.name,b.id LIMIT 100`,params);
   const ids=rows.map(r=>r.id);
   const mappingByBrand=new Map<string,{legalEntityId:string;isDefault:boolean}[]>();
   if(ids.length){
     const [mappings]=await pool.query<(RowDataPacket & {brand_id:string;legal_entity_id:string;is_default:number})[]>(
       `SELECT brand_id,legal_entity_id,is_default FROM brand_legal_entities
        WHERE brand_id IN (${ids.map(()=>"?").join(",")}) AND legal_entity_id IN (${scopes.map(()=>"?").join(",")})
        ORDER BY is_default DESC,legal_entity_id`,[...ids,...scopes]);
     for(const m of mappings){const arr=mappingByBrand.get(m.brand_id)??[];arr.push({legalEntityId:m.legal_entity_id,isDefault:Boolean(m.is_default)});mappingByBrand.set(m.brand_id,arr)}
   }
   return jsonNoStore({data:rows.map(r=>({id:r.id,name:r.name,code:r.code,description:r.description,logoReference:r.logo_reference,
     theme:parseJson(r.theme_json),defaultTemplateKey:r.default_template_key,isActive:Boolean(r.is_active),createdAt:r.created_at,updatedAt:r.updated_at,
     legalEntityMappings:mappingByBrand.get(r.id)??[]})),pagination:{limit:100,offset:0,hasMore:false}});
 }catch(error){return apiError(error)}
}

export async function POST(request:NextRequest){
 let conn:Awaited<ReturnType<typeof pool.getConnection>>|undefined;
 try{
   await assertCsrf(request);
   const actor=await requirePermission("settings:manage");
   const input=brandCreateSchema.parse(await request.json());
   const legalEntityIds=[...new Set(input.legalEntityIds)];
   if(legalEntityIds.length!==input.legalEntityIds.length)return jsonNoStore({error:{code:"VALIDATION_ERROR",message:"Duplicate legal entity mappings are not allowed"}},400);
   if(legalEntityIds.some(id=>!actor.legalEntityIds.includes(id)))return jsonNoStore({error:{code:"FORBIDDEN",message:"Every brand mapping must be within your assigned legal-entity scope."}},403);
   const id=randomUUID();conn=await pool.getConnection();await conn.beginTransaction();
   const [entities]=await conn.query<(RowDataPacket & {id:string;is_active:number})[]>(
     `SELECT id,is_active FROM legal_entities WHERE id IN (${legalEntityIds.map(()=>"?").join(",")}) FOR UPDATE`,legalEntityIds);
   if(entities.length!==legalEntityIds.length||entities.some(e=>!e.is_active)){await conn.rollback();return jsonNoStore({error:{code:"CONFIGURATION_CONFLICT",message:"Each mapping must reference an existing active legal entity in your scope."}},409)}
   await conn.execute(
    `INSERT INTO brands (id,name,code,description,logo_reference,theme_json,default_template_key,is_active)
     VALUES (?,?,?,?,?,?,?,TRUE)`,
    [id,input.name,input.code,input.description||null,input.logoReference||null,input.theme?JSON.stringify(input.theme):null,input.defaultTemplateKey||null]);
   for(let i=0;i<legalEntityIds.length;i++){
     await conn.execute(
       "INSERT INTO brand_legal_entities (brand_id,legal_entity_id,is_default,effective_from) VALUES (?,?,?,CURRENT_DATE())",
       [id,legalEntityIds[i],i===0?1:0]);
   }
   const snapshot={schemaVersion:1,brandId:id,name:input.name,code:input.code,description:input.description||null,logoReference:input.logoReference||null,
    theme:input.theme??null,defaultTemplateKey:input.defaultTemplateKey||null,legalEntityIds};
   const serialized=canonicalJson(snapshot);
   await conn.execute(
    `INSERT INTO brand_config_versions (id,brand_id,version_number,effective_from,config_snapshot,change_reason,changed_by)
     VALUES (?,?,1,NOW(3),?,?,?)`,[randomUUID(),id,serialized,input.changeReason,actor.userId]);
   await recordAudit(conn,actor.userId,"brand.created","brand",id,input.changeReason,null,
    {configVersion:1,code:input.code,legalEntityCount:legalEntityIds.length});
   await conn.commit();
   return jsonNoStore({data:{id,...snapshot,isActive:true,configVersion:1}},201);
 }catch(error){if(conn)try{await conn.rollback()}catch{}return apiError(error)}
 finally{conn?.release()}
}
