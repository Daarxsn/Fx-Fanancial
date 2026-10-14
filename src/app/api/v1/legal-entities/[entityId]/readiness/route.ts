import { NextRequest } from "next/server";
import { pool } from "@/lib/db/pool";
import { requirePermissionForEntity } from "@/lib/auth/authorize";
import { apiError, jsonNoStore } from "@/lib/http/api-response";
import { readinessForEntity } from "@/lib/configuration/service";
import { loadEntity } from "@/lib/configuration/service";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:NextRequest,context:{params:Promise<{entityId:string}>}){
  try{
    const {entityId}=await context.params;
    await requirePermissionForEntity("settings:manage",entityId);
    const conn=await pool.getConnection();
    let entity;
    try{entity=await loadEntity(conn,entityId);}finally{conn.release();}
    if(!entity)return jsonNoStore({error:{code:"NOT_FOUND",message:"Legal entity not found"}},404);
    const readiness=await readinessForEntity(entityId);
    return jsonNoStore({data:readiness});
  }catch(error){return apiError(error);}
}
