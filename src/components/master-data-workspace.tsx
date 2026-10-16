"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, InlineAlert, StatusBadge } from "@/components/ui";

type Resource = "customers" | "catalog";
type Row = Record<string, unknown> & { id: string; recordVersion?: number; isActive?: boolean };
type Permissions = string[];
type ApiPayload = { data?: unknown; error?: { code?: string; message?: string; fields?: Record<string,string> }; duplicateWarnings?: Array<{id:string;name:string;itemCode?:string|null;customerCode?:string|null;matchOn?:string[]}>; meta?: { pagination?: { limit:number; offset:number; total:number; hasMore:boolean } } };
type FieldConfig = { key:string; label:string; type?:"text"|"email"|"number"|"textarea"; required?:boolean; placeholder?:string; help?:string };
const customerFields: FieldConfig[] = [
  {key:"customerCode",label:"Customer code",help:"Optional. Must be unique when supplied."},
  {key:"name",label:"Customer / legal name",required:true},
  {key:"email",label:"Billing email",type:"email"},
  {key:"phone",label:"Phone"},
  {key:"purchaseOrderReference",label:"Default PO / reference"},
  {key:"paymentTermsDays",label:"Payment terms (days)",type:"number",help:"A default for new drafts, not a payment guarantee."},
  {key:"taxIdentifier",label:"Primary tax identifier",help:"Legacy primary identifier; registration validity is not inferred."},
];
const catalogFields: FieldConfig[] = [
  {key:"itemCode",label:"SKU / service code",help:"Optional, but unique when supplied."},
  {key:"name",label:"Item / service name",required:true},
  {key:"unitCode",label:"Unit of measure",required:true,placeholder:"unit, hour, month…"},
  {key:"defaultUnitPrice",label:"Default unit price",required:true,help:"Exact decimal, up to four fractional digits."},
  {key:"currency",label:"Currency (ISO 4217)",required:true,placeholder:"INR"},
  {key:"defaultTaxCode",label:"Default tax code",help:"A code from approved configuration only; no rate is inferred."},
];
const emptyForm = (resource:Resource):Record<string,string> => resource==="customers"
  ? {customerCode:"",name:"",email:"",phone:"",purchaseOrderReference:"",paymentTermsDays:"0",taxIdentifier:"",
     billLine1:"",billLine2:"",billCity:"",billState:"",billPostalCode:"",billCountryCode:"",
     shipLine1:"",shipLine2:"",shipCity:"",shipState:"",shipPostalCode:"",shipCountryCode:"",
     contactName:"",contactTitle:"",contactEmail:"",contactPhone:"",taxType:"",taxCountryCode:"",taxJurisdiction:"",taxValue:""}
  : {itemCode:"",itemType:"SERVICE",name:"",customerDescription:"",internalDescription:"",unitCode:"unit",
     defaultUnitPrice:"0.0000",currency:"INR",defaultTaxCode:""};
function str(value:unknown):string { return typeof value==="string"||typeof value==="number" ? String(value) : ""; }
function obj(value:unknown):Record<string,unknown> { return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}; }
function rowData(payload:ApiPayload):Row[] { return Array.isArray(payload.data)?payload.data.filter((v):v is Row=>Boolean(v)&&typeof v==="object"&&"id" in v) as Row[]:[]; }
function valueOf(row:Row,key:string):string { return str(row[key]); }
function addressValue(record:Row,key:string,field:string):string { return str(obj(record[key])[field]); }
function recordToForm(resource:Resource,record:Row):Record<string,string>{
  const form={...emptyForm(resource)};
  if(resource==="catalog"){
    for(const f of catalogFields)form[f.key]=valueOf(record,f.key);
    form.itemType=valueOf(record,"itemType")||"SERVICE";
    form.customerDescription=valueOf(record,"customerDescription");
    form.internalDescription=valueOf(record,"internalDescription");
    return form;
  }
  for(const f of customerFields)form[f.key]=valueOf(record,f.key);
  for(const [prefix,key] of [["bill","billingAddress"],["ship","shippingAddress"]] as const){
    for(const [from,to] of [["line1","Line1"],["line2","Line2"],["city","City"],["state","State"],["postalCode","PostalCode"],["countryCode","CountryCode"]] as const)
      form[prefix+to]=addressValue(record,key,from);
  }
  const contact=Array.isArray(record.contacts)?obj(record.contacts.find(x=>Boolean(obj(x).isPrimary))??record.contacts[0]):{};
  form.contactName=str(contact.fullName);form.contactTitle=str(contact.jobTitle);form.contactEmail=str(contact.email);form.contactPhone=str(contact.phone);
  const tax=Array.isArray(record.taxIdentifiers)?obj(record.taxIdentifiers[0]):{};
  form.taxType=str(tax.identifierType);form.taxCountryCode=str(tax.countryCode);form.taxJurisdiction=str(tax.jurisdiction);form.taxValue=str(tax.identifierValue);
  return form;
}
function fieldControl(field:FieldConfig,value:string,onChange:(value:string)=>void){
  if(field.type==="textarea")return <textarea className="form-control form-control--textarea" id={field.key} value={value} onChange={e=>onChange(e.target.value)} required={field.required}/>;
  return <input className="form-control" id={field.key} type={field.type==="number"?"number":field.type??"text"} min={field.type==="number"?0:undefined} max={field.type==="number"?365:undefined} step={field.type==="number"?1:undefined} value={value} onChange={e=>onChange(e.target.value)} required={field.required} placeholder={field.placeholder}/>;
}
function fieldValue(form:Record<string,string>,key:string){return form[key]??"";}
function makeAddress(form:Record<string,string>,prefix:"bill"|"ship"){
 const pairs=[["line1","Line1"],["line2","Line2"],["city","City"],["state","State"],["postalCode","PostalCode"],["countryCode","CountryCode"]] as const;
 const address:Record<string,string>={};
 for(const [target,source] of pairs){const value=form[prefix+source]?.trim();if(value)address[target]=source==="CountryCode"?value.toUpperCase():value;}
 return Object.keys(address).length?address:undefined;
}

export function MasterDataWorkspace({resource}:{resource:Resource}){
 const [query,setQuery]=useState("");const deferredQuery=useDeferredValue(query);
 const [status,setStatus]=useState("active");const [offset,setOffset]=useState(0);const limit=25;
 const [records,setRecords]=useState<Row[]>([]);const [pagination,setPagination]=useState({total:0,hasMore:false});
 const [permissions,setPermissions]=useState<Permissions>([]);
 const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
 const [success,setSuccess]=useState("");const [warnings,setWarnings]=useState<ApiPayload["duplicateWarnings"]>([]);
 const [form,setForm]=useState<Record<string,string>>(emptyForm(resource));
 const [editorOpen,setEditorOpen]=useState(false);const [editing,setEditing]=useState<Row|null>(null);
 const [detail,setDetail]=useState<Row|null>(null);const [detailLoading,setDetailLoading]=useState(false);
 const [archiveTarget,setArchiveTarget]=useState<Row|null>(null);const [archiveReason,setArchiveReason]=useState("");

 const title=resource==="customers"?"Customers":"Items & services";
 const canWrite=permissions.includes(resource==="customers"?"customers:write":"catalog:write");
 const canArchive=permissions.includes(resource==="customers"?"customers:archive":"catalog:archive");
 const basePath=resource==="customers"?"/api/v1/customers":"/api/v1/catalog/items";
 const fields=resource==="customers"?customerFields:catalogFields;

 const request=useCallback(async(url:string,init:RequestInit={}):Promise<{response:Response;body:ApiPayload}>=>{
  const response=await fetch(url,{...init,cache:"no-store",headers:{"Accept":"application/json",...(init.body?{"Content-Type":"application/json"}:{}),...(init.headers??{})}});
  let body:ApiPayload={};try{body=await response.json() as ApiPayload;}catch{/* safe fallback handled below */}
  return {response,body};
 },[]);

 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [list,profile]=await Promise.all([
    request(`${basePath}?query=${encodeURIComponent(deferredQuery)}&status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`),
    fetch("/api/v1/auth/me",{cache:"no-store"}).then(async r=>({ok:r.ok,body:await r.json() as {data?:{user?:{permissions?:string[]}}}})),
   ]);
   if(!list.response.ok)throw new Error(list.body.error?.message??"Could not load records.");
   setRecords(rowData(list.body));const p=list.body.meta?.pagination??{total:0,hasMore:false};
   setPagination({total:Number(p.total??0),hasMore:Boolean(p.hasMore)});
   setPermissions(profile.ok?profile.body.data?.user?.permissions??[]:[]);
  }catch(e){setError(e instanceof Error?e.message:"Could not load records.");}
  finally{setLoading(false);}
 },[basePath,deferredQuery,status,offset,request]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{setOffset(0);},[deferredQuery,status]);

 const openCreate=()=>{setEditing(null);setForm(emptyForm(resource));setWarnings([]);setError("");setSuccess("");setDetail(null);setEditorOpen(true);};
 const openDetails=async(id:string)=>{
  setDetailLoading(true);setError("");
  try{const r=await request(basePath+"/"+id);if(!r.response.ok)throw new Error(r.body.error?.message??"Could not load record.");setDetail(obj(r.body.data) as Row);}
  catch(e){setError(e instanceof Error?e.message:"Could not load record.");}
  finally{setDetailLoading(false);}
 };
 const openEdit=async(row:Row)=>{
  setSaving(true);setError("");setWarnings([]);
  try{const r=await request(basePath+"/"+row.id);if(!r.response.ok)throw new Error(r.body.error?.message??"Could not load record to edit.");
   const full=obj(r.body.data) as Row;setDetail(full);setEditing(full);setForm(recordToForm(resource,full));setEditorOpen(true);setSuccess("");
  }catch(e){setError(e instanceof Error?e.message:"Could not load record.");}
  finally{setSaving(false);}
 };

 const getCsrf=async()=>{
  const r=await fetch("/api/v1/auth/csrf",{cache:"no-store"});const body=await r.json() as {data?:{csrfToken?:string}};
  if(!r.ok||!body.data?.csrfToken)throw new Error("Could not validate this request. Refresh and try again.");
  return body.data.csrfToken;
 };
 const mutate=async(url:string,method:string,payload:unknown)=>{
  const csrf=await getCsrf();
  return request(url,{method,headers:{"X-CSRF-Token":csrf},body:JSON.stringify(payload)});
 };
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();setSaving(true);setError("");setSuccess("");setWarnings([]);
  try{
   let payload:Record<string,unknown>;
   if(resource==="customers"){
    const contacts=form.contactName.trim()?[{fullName:form.contactName.trim(),jobTitle:form.contactTitle.trim(),email:form.contactEmail.trim(),phone:form.contactPhone.trim(),isPrimary:true}]:[];
    const taxIdentifiers=form.taxValue.trim()?[{identifierType:form.taxType.trim()||"OTHER",countryCode:form.taxCountryCode.trim().toUpperCase(),jurisdiction:form.taxJurisdiction.trim(),identifierValue:form.taxValue.trim()}]:[];
    payload={customerCode:form.customerCode.trim(),name:form.name.trim(),email:form.email.trim(),phone:form.phone.trim(),
      purchaseOrderReference:form.purchaseOrderReference.trim(),paymentTermsDays:Number(form.paymentTermsDays||0),
      taxIdentifier:form.taxIdentifier.trim(),contacts,taxIdentifiers};
    const billingAddress=makeAddress(form,"bill");const shippingAddress=makeAddress(form,"ship");
    if(billingAddress)payload.billingAddress=billingAddress;else if(editing)payload.billingAddress=null;
    if(shippingAddress)payload.shippingAddress=shippingAddress;else if(editing)payload.shippingAddress=null;
   }else{
    payload={itemCode:form.itemCode.trim(),itemType:form.itemType,name:form.name.trim(),
      customerDescription:form.customerDescription.trim(),internalDescription:form.internalDescription,
      unitCode:form.unitCode.trim(),defaultUnitPrice:form.defaultUnitPrice.trim(),currency:form.currency.trim().toUpperCase(),
      defaultTaxCode:form.defaultTaxCode.trim()};
   }
   if(editing)payload.expectedVersion=Number(editing.recordVersion);
   const url=editing?basePath+"/"+editing.id:basePath;
   const result=await mutate(url,editing?"PATCH":"POST",payload);
   if(!result.response.ok)throw new Error(result.body.error?.message??"The record could not be saved.");
   setWarnings(result.body.duplicateWarnings??[]);
   setEditorOpen(false);setSuccess(editing?"Record updated. Any prior invoice/quotation snapshots remain unchanged.":"Record created.");
   setDetail(obj(result.body.data) as Row);await refresh();
  }catch(e){setError(e instanceof Error?e.message:"The record could not be saved.");}
  finally{setSaving(false);}
 };
 const archive=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!archiveTarget)return;
  setSaving(true);setError("");setSuccess("");
  try{
   const result=await mutate(basePath+"/"+archiveTarget.id+"/archive","POST",{expectedVersion:Number(archiveTarget.recordVersion),reason:archiveReason.trim()});
   if(!result.response.ok)throw new Error(result.body.error?.message??"The record could not be archived.");
   const data=obj(result.body.data);setSuccess(str(data.message)||"Record archived safely. Historical records remain linked.");
   setArchiveTarget(null);setArchiveReason("");setDetail(null);await refresh();
  }catch(e){setError(e instanceof Error?e.message:"The record could not be archived.");}
  finally{setSaving(false);}
 };
 const displayName=(row:Row)=>valueOf(row,"name")||"Unnamed record";
 const tableColumns=useMemo(()=>resource==="customers"?[
  {key:"customerCode",label:"Code"},{key:"name",label:"Customer"},{key:"email",label:"Email"},{key:"phone",label:"Phone"},
  {key:"paymentTermsDays",label:"Terms",render:(r:Row)=>`${valueOf(r,"paymentTermsDays")||"0"} days`},
 ]:[
  {key:"itemCode",label:"Code"},{key:"name",label:"Item / service"},{key:"itemType",label:"Type"},
  {key:"unitCode",label:"Unit"},{key:"defaultUnitPrice",label:"Default price",render:(r:Row)=>`${valueOf(r,"currency")} ${valueOf(r,"defaultUnitPrice")}`},
 ],[resource]);

 return <div className="master-data-workspace">
  <div className="master-data-toolbar">
   <div className="master-data-search"><label className="form-label" htmlFor={resource+"-search"}>Search records</label>
    <input className="form-control" id={resource+"-search"} value={query} onChange={e=>setQuery(e.target.value)} placeholder={resource==="customers"?"Name, code, email, phone or tax ID":"Name or item/service code"} />
   </div>
   <div className="master-data-filter"><label className="form-label" htmlFor={resource+"-status"}>Status</label>
    <select id={resource+"-status"} className="form-control" value={status} onChange={e=>setStatus(e.target.value)}>
     <option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option>
    </select>
   </div>
   {canWrite?<Button onClick={openCreate}>+ New {resource==="customers"?"customer":"item / service"}</Button>:null}
  </div>
  {error?<InlineAlert tone="danger" title="Action needs attention">{error}</InlineAlert>:null}
  {success?<InlineAlert tone="success" title="Saved">{success}</InlineAlert>:null}
  {warnings?.length?<InlineAlert tone="warning" title="Possible duplicates found">No records were merged. Review these possible matches before creating more records: {warnings.map(w=>w.name+(w.customerCode||w.itemCode?" ("+(w.customerCode||w.itemCode)+")":"")).join("; ")}.</InlineAlert>:null}
  <div className="master-data-summary"><span>{loading?"Loading records…":`${pagination.total} ${pagination.total===1?"record":"records"}`}</span><span>Changes apply to future drafts only; historical document snapshots are preserved.</span></div>
  <div className="data-table-scroll">
   <table className="data-table"><thead><tr>{tableColumns.map(c=><th key={c.key}>{c.label}</th>)}<th>Status</th><th>Actions</th></tr></thead>
    <tbody>{!loading&&!records.length?<tr><td colSpan={tableColumns.length+2}><div className="master-data-empty"><strong>No {status==="active"?"active ":""}{resource==="customers"?"customers":"items or services"} found</strong><p>Try another search or create a record with approved business data.</p></div></td></tr>:null}
    {records.map(row=><tr key={row.id}>{tableColumns.map(c=><td key={c.key}>{c.render?c.render(row):valueOf(row,c.key)||"—"}</td>)}
     <td><StatusBadge tone={row.isActive?"success":"neutral"}>{row.isActive?"Active":"Archived"}</StatusBadge></td>
     <td><div className="master-data-actions"><Button size="sm" variant="ghost" onClick={()=>void openDetails(row.id)}>Details</Button>
      {canWrite&&row.isActive?<Button size="sm" variant="secondary" disabled={saving} onClick={()=>void openEdit(row)}>Edit</Button>:null}
      {canArchive&&row.isActive?<Button size="sm" variant="danger" disabled={saving} onClick={()=>{setArchiveTarget(row);setArchiveReason("");setError("");}}>Archive</Button>:null}
     </div></td>
    </tr>)}</tbody>
   </table>
  </div>
  <div className="master-data-pagination"><span>Showing {pagination.total===0?0:offset+1}–{Math.min(offset+records.length,pagination.total)} of {pagination.total}</span><div>
   <Button variant="secondary" size="sm" disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-limit))}>Previous</Button>
   <Button variant="secondary" size="sm" disabled={!pagination.hasMore||loading} onClick={()=>setOffset(offset+limit)}>Next</Button>
  </div></div>

  {editorOpen?<div className="master-data-panel" role="dialog" aria-modal="true" aria-labelledby="master-data-form-title">
   <div className="master-data-panel__heading"><div><p className="page-eyebrow">{editing?"EDIT MASTER DATA":"NEW MASTER DATA"}</p><h2 id="master-data-form-title">{editing?"Edit "+title.slice(0,-1):"Create "+(resource==="customers"?"customer":"item / service")}</h2><p>Only approved information belongs in this record. Fields marked * are required.</p></div><Button variant="ghost" onClick={()=>setEditorOpen(false)}>Close</Button></div>
   <form onSubmit={save}>
    {resource==="catalog"?<div className="master-data-form-grid">
     <div className="form-field"><label className="form-label" htmlFor="itemType">Record type *</label><select className="form-control" id="itemType" required value={form.itemType} onChange={e=>setForm(p=>({...p,itemType:e.target.value}))}><option value="PRODUCT">Product</option><option value="SERVICE">Service</option></select></div>
     {catalogFields.map(f=><div className="form-field" key={f.key}><label className="form-label" htmlFor={f.key}>{f.label}{f.required?<span className="form-required"> *</span>:null}</label>{fieldControl(f,fieldValue(form,f.key),v=>setForm(p=>({...p,[f.key]:v})))}{f.help?<p className="form-hint">{f.help}</p>:null}</div>)}
     <div className="form-field form-field--wide"><label className="form-label" htmlFor="customerDescription">Customer-facing description *</label><textarea id="customerDescription" className="form-control form-control--textarea" required value={form.customerDescription} onChange={e=>setForm(p=>({...p,customerDescription:e.target.value}))} maxLength={1000}/></div>
     <div className="form-field form-field--wide"><label className="form-label" htmlFor="internalDescription">Internal description</label><textarea id="internalDescription" className="form-control form-control--textarea" value={form.internalDescription} onChange={e=>setForm(p=>({...p,internalDescription:e.target.value}))} maxLength={1000}/><p className="form-hint">Internal description is not included on customer-facing documents by default.</p></div>
    </div>:<div className="master-data-form-grid">
     {customerFields.map(f=><div className="form-field" key={f.key}><label className="form-label" htmlFor={f.key}>{f.label}{f.required?<span className="form-required"> *</span>:null}</label>{fieldControl(f,fieldValue(form,f.key),v=>setForm(p=>({...p,[f.key]:v})))}{f.help?<p className="form-hint">{f.help}</p>:null}</div>)}
     <fieldset className="master-data-fieldset"><legend>Billing address</legend><div className="master-data-form-grid">
      {([["billLine1","Address line 1"],["billLine2","Address line 2"],["billCity","City"],["billState","State / province"],["billPostalCode","Postal code"],["billCountryCode","Country code"]] as const).map(([key,label])=><div className="form-field" key={key}><label className="form-label" htmlFor={key}>{label}</label><input className="form-control" id={key} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} maxLength={255}/></div>)}
     </div></fieldset>
     <fieldset className="master-data-fieldset"><legend>Shipping / service address (optional)</legend><div className="master-data-form-grid">
      {([["shipLine1","Address line 1"],["shipLine2","Address line 2"],["shipCity","City"],["shipState","State / province"],["shipPostalCode","Postal code"],["shipCountryCode","Country code"]] as const).map(([key,label])=><div className="form-field" key={key}><label className="form-label" htmlFor={key}>{label}</label><input className="form-control" id={key} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} maxLength={255}/></div>)}
     </div></fieldset>
     <fieldset className="master-data-fieldset"><legend>Primary contact (optional)</legend><div className="master-data-form-grid">
      {([["contactName","Full name"],["contactTitle","Job title"],["contactEmail","Email"],["contactPhone","Phone"]] as const).map(([key,label])=><div className="form-field" key={key}><label className="form-label" htmlFor={key}>{label}</label><input className="form-control" id={key} type={key==="contactEmail"?"email":"text"} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} maxLength={320}/></div>)}
     </div><p className="form-hint">Additional contacts and tax identifiers are supported by the protected API; this form currently edits one primary contact and one supplemental tax identifier at a time.</p></fieldset>
     <fieldset className="master-data-fieldset"><legend>Additional tax identifier (optional)</legend><div className="master-data-form-grid">
      {([["taxType","Identifier type"],["taxCountryCode","Country code"],["taxJurisdiction","Jurisdiction"],["taxValue","Identifier value"]] as const).map(([key,label])=><div className="form-field" key={key}><label className="form-label" htmlFor={key}>{label}</label><input className="form-control" id={key} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/></div>)}
     </div></fieldset>
    </div>}
    <div className="master-data-form-actions"><Button variant="secondary" type="button" disabled={saving} onClick={()=>setEditorOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving?"Saving…":editing?"Save changes":"Create record"}</Button></div>
   </form>
  </div>:null}

  {detail?<div className="master-data-detail" aria-labelledby="master-data-detail-title">
   <div className="master-data-detail__heading"><div><p className="page-eyebrow">RECORD DETAILS</p><h2 id="master-data-detail-title">{displayName(detail)}</h2></div><Button variant="ghost" onClick={()=>setDetail(null)}>Close details</Button></div>
   <div className="master-data-detail__grid">
    {resource==="customers"?<>
     <div><span>Customer code</span><strong>{valueOf(detail,"customerCode")||"Not assigned"}</strong></div><div><span>Email</span><strong>{valueOf(detail,"email")||"Not supplied"}</strong></div>
     <div><span>Phone</span><strong>{valueOf(detail,"phone")||"Not supplied"}</strong></div><div><span>Payment terms</span><strong>{valueOf(detail,"paymentTermsDays")||"0"} days</strong></div>
     <div><span>Billing address</span><strong>{Object.values(obj(detail.billingAddress)).map(str).filter(Boolean).join(", ")||"Not supplied"}</strong></div>
     <div><span>Shipping / service address</span><strong>{Object.values(obj(detail.shippingAddress)).map(str).filter(Boolean).join(", ")||"Same / not supplied"}</strong></div>
     <div><span>Legacy primary tax identifier</span><strong>{valueOf(detail,"taxIdentifier")||"Not supplied"}</strong></div>
     <div><span>Primary contact</span><strong>{Array.isArray(detail.contacts)?str(obj(detail.contacts.find(x=>Boolean(obj(x).isPrimary))??detail.contacts[0]).fullName)||"Not supplied":"Not supplied"}</strong></div>
     {Array.isArray(detail.taxIdentifiers)&&detail.taxIdentifiers.length?<div className="master-data-detail__wide"><span>Tax identifiers</span><strong>{detail.taxIdentifiers.map(t=>{const x=obj(t);return [str(x.identifierType),str(x.countryCode),str(x.jurisdiction),str(x.identifierValue)].filter(Boolean).join(" · ")}).join("; ")}</strong></div>:null}
     {detail.referenceCounts?<div className="master-data-detail__wide"><span>Historical references</span><strong>Invoices: {str(obj(detail.referenceCounts).invoices) || "0"} · Quotations: {str(obj(detail.referenceCounts).quotations)||"0"} · Payments: {str(obj(detail.referenceCounts).payments)||"0"}</strong></div>:null}
    </>:<>
     <div><span>Code</span><strong>{valueOf(detail,"itemCode")||"Not assigned"}</strong></div><div><span>Type</span><strong>{valueOf(detail,"itemType")}</strong></div>
     <div><span>Unit</span><strong>{valueOf(detail,"unitCode")}</strong></div><div><span>Default unit price</span><strong>{valueOf(detail,"currency")} {valueOf(detail,"defaultUnitPrice")}</strong></div>
     <div className="master-data-detail__wide"><span>Customer-facing description</span><strong>{valueOf(detail,"customerDescription")}</strong></div>
     {detail.internalDescription?<div className="master-data-detail__wide"><span>Internal description</span><strong>{valueOf(detail,"internalDescription")}</strong></div>:null}
     <div><span>Default tax code</span><strong>{valueOf(detail,"defaultTaxCode")||"Not configured"}</strong></div>
     {detail.referenceCounts?<div className="master-data-detail__wide"><span>Historical references</span><strong>{JSON.stringify(detail.referenceCounts)}</strong></div>:null}
    </>}
    <div><span>Record version</span><strong>{valueOf(detail,"recordVersion")}</strong></div>
    <div><span>Created</span><strong>{valueOf(detail,"createdAt")||"—"}</strong></div>
   </div>
   {detail.isActive&&canWrite?<div className="master-data-form-actions"><Button variant="secondary" onClick={()=>void openEdit(detail)}>Edit record</Button>{canArchive?<Button variant="danger" onClick={()=>{setArchiveTarget(detail);setArchiveReason("");}}>Archive record</Button>:null}</div>:null}
  </div>:detailLoading?<p className="master-data-summary">Loading details…</p>:null}

  {archiveTarget?<div className="master-data-panel master-data-panel--narrow" role="dialog" aria-modal="true" aria-labelledby="archive-title"><div className="master-data-panel__heading"><div><p className="page-eyebrow">ARCHIVE MASTER DATA</p><h2 id="archive-title">Archive {displayName(archiveTarget)}?</h2><p>This hides the record from new selection but preserves linked invoices, quotations and audit history. It is not a delete.</p></div></div>
   <form onSubmit={archive}><div className="form-field"><label className="form-label" htmlFor="archiveReason">Reason (required)</label><textarea id="archiveReason" className="form-control form-control--textarea" value={archiveReason} onChange={e=>setArchiveReason(e.target.value)} minLength={3} maxLength={500} required/></div>
    <div className="master-data-form-actions"><Button variant="secondary" type="button" onClick={()=>setArchiveTarget(null)} disabled={saving}>Cancel</Button><Button variant="danger" type="submit" disabled={saving||archiveReason.trim().length<3}>{saving?"Archiving…":"Confirm archive"}</Button></div></form>
  </div>:null}
 </div>;
}
