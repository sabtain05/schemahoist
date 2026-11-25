"use strict";
const isArr=Array.isArray,keys=Object.keys,hasOwn=Object.prototype.hasOwnProperty;
const CK=["type","description","title","properties","required","items","anyOf","enum"];
const NK=["minimum","maximum","exclusiveMinimum","exclusiveMaximum","multipleOf"];
const BF=["date-time","time","date","duration","email","hostname","ipv4","ipv6","uuid"];
const mkP=(t,kw,fm,ro,fa,sa,ra,ns,ce,mm)=>({target:t,allowedKeywords:new Set(kw),supportedFormats:new Set(fm),requireRootObject:ro,forceAdditionalPropertiesFalse:fa,stripAdditionalProperties:sa,requireAllProperties:ra,nullableStrategy:ns,convertConstToEnum:ce,convertOneOfToAnyOf:true,...(mm!==undefined?{maxMinItems:mm}:{})});
const PROVIDER_PROFILES={
"openai-strict":mkP("openai-strict",[...CK,"additionalProperties","const","pattern","format",...NK,"minItems","maxItems"],BF,true,true,false,true,"type-array",false),
anthropic:mkP("anthropic",[...CK,"additionalProperties","const","format","minItems"],[...BF,"uri"],true,true,false,false,"type-array",false,1),
gemini:mkP("gemini",[...CK,"nullable","format","propertyOrdering","minimum","maximum","minItems","maxItems","minLength","maxLength","minProperties","maxProperties","pattern"],["enum","date-time","float","double","int32","int64"],false,false,true,false,"nullable-flag",true),
mcp:mkP("mcp",[...CK,"additionalProperties","const","format","minLength","maxLength","pattern",...NK,"minItems","maxItems","uniqueItems","default"],[...BF,"uri"],true,false,false,false,"type-array",false)
};
function getProviderProfile(t){const p=PROVIDER_PROFILES[t];if(!p)throw new Error(`Unsupported target provider: ${String(t)}`);return p;}
const FL={uuid:"Must be a valid UUID",uri:"Must be a valid URI","uri-reference":"Must be a valid URI reference",iri:"Must be a valid IRI",email:"Must be a valid email address","idn-email":"Must be a valid email address",hostname:"Must be a valid hostname",ipv4:"Must be a valid IPv4 address",ipv6:"Must be a valid IPv6 address","date-time":"Must be a valid ISO 8601 date-time",date:"Must be a valid ISO 8601 date",time:"Must be a valid ISO 8601 time",duration:"Must be a valid ISO 8601 duration",regex:"Must be a valid regular expression","json-pointer":"Must be a valid JSON Pointer",password:"Must be a password string",byte:"Must be base64-encoded",binary:"Must be binary-encoded",int32:"Must be a 32-bit integer",int64:"Must be a 64-bit integer",float:"Must be a 32-bit float",double:"Must be a 64-bit float"};
const NP={minLength:"min length",maxLength:"max length",minimum:"minimum",maximum:"maximum",exclusiveMinimum:"must be >",exclusiveMaximum:"must be <",multipleOf:"multiple of",minItems:"min items",maxItems:"max items",minProperties:"min properties",maxProperties:"max properties"};
const BL={uniqueItems:"items must be unique",readOnly:"read-only",writeOnly:"write-only",deprecated:"deprecated"};
const SK=new Set(["$schema","$id","$defs","definitions","$comment","$vocabulary","$anchor","$dynamicRef","$dynamicAnchor"]);
const sc=(v)=>{try{return JSON.stringify(v);}catch{return String(v);}};
function formatConstraint(k,v,cf){
if(SK.has(k))return null;
if(cf){const c=cf(k,v);if(c!==undefined)return c;}
if(k in NP)return typeof v==="number"?`${NP[k]} ${v}`:null;
if(k in BL)return v===true?BL[k]:null;
if(k==="format")return typeof v==="string"&&v?FL[v]??`format: ${v}`:null;
if(k==="pattern")return typeof v==="string"?`matches pattern /${v}/`:null;
if(k==="default")return v!==undefined?`default: ${sc(v)}`:null;
if(k==="const")return v!==undefined?`must equal ${sc(v)}`:null;
if(k==="examples")return isArr(v)&&v.length?`examples: ${v.slice(0,3).map(sc).join(", ")}`:null;
if(k==="patternProperties"&&po(v)){const p=keys(v).sort();return p.length?`keys matching /${p.join("/, /")}/`:null;}
if(k==="dependentRequired"&&po(v)){const r=keys(v).sort().map((x)=>isArr(v[x])?`${x} requires [${v[x].join(", ")}]`:null).filter(Boolean);return r.length?`dependencies: ${r.join("; ")}`:null;}
if(k==="contentEncoding")return typeof v==="string"?`content encoding: ${v}`:null;
if(k==="contentMediaType")return typeof v==="string"?`media type: ${v}`:null;
if(k==="not")return v&&typeof v==="object"?`must not match ${sc(v)}`:null;
return null;
}
function appendHoistedConstraints(b,cs){
const u=[];
for(const x of cs){const t=x.trim();if(t&&!u.includes(t))u.push(t);}
if(!u.length)return b;
const s=`(${u.join(", ")})`;
if(!b||!b.trim())return s;
const c=b.trim();
return c.includes(s)?c:`${c} ${s}`;
}
const up=(s)=>s.replace(/~1/g,"/").replace(/~0/g,"~");
function resolveJsonPointer(root,ref){
if(ref==="#")return root;
if(!ref.startsWith("#/"))return null;
let cur=root;
for(const seg of ref.slice(2).split("/").map(up)){
if(cur===null||typeof cur!=="object")return null;
if(isArr(cur)){const i=Number(seg);if(!Number.isInteger(i)||i<0||i>=cur.length)return null;cur=cur[i];}
else{if(!hasOwn.call(cur,seg))return null;cur=cur[seg];}
}
return po(cur)?cur:null;
}
const rn=(r)=>r==="#"?"root":r.includes("/")?up(r.slice(r.lastIndexOf("/")+1)):r;
const MX=new Set(["minimum","minLength","minItems"]);
const MN=new Set(["maximum","maxLength","maxItems"]);
function it(a,b){
if(a===undefined)return b;
if(b===undefined)return a;
const la=isArr(a)?a:[a],lb=isArr(b)?b:[b],c=la.filter((t)=>lb.includes(t));
return !c.length?b:c.length===1?c[0]:c;
}
function mergeSchemas(ss){
const m={},ds=[],rq=new Set(),pr={};let hp=false;
for(const p of ss){
for(const k of keys(p)){
const v=p[k];if(v===undefined)continue;
if(k==="description"&&typeof v==="string"&&v.trim()){const t=v.trim();if(!ds.includes(t))ds.push(t);}
else if(k==="required"&&isArr(v)){for(const x of v)if(typeof x==="string")rq.add(x);}
else if(k==="properties"&&po(v)){hp=true;for(const n of keys(v))pr[n]=pr[n]?mergeSchemas([pr[n],v[n]]):v[n];}
else if(k==="type")m.type=it(m.type,v);
else if(MX.has(k)&&typeof v==="number")m[k]=typeof m[k]==="number"?Math.max(m[k],v):v;
else if(MN.has(k)&&typeof v==="number")m[k]=typeof m[k]==="number"?Math.min(m[k],v):v;
else m[k]=v;
}
}
if(ds.length)m.description=ds.join(" ");
if(hp)m.properties=pr;
if(rq.size)m.required=Array.from(rq).sort();
return m;
}
const VT=new Set(["string","number","integer","boolean","object","array","null"]);
const HK=new Set(["type","nullable","description","title","properties","required","additionalProperties","propertyOrdering","items","prefixItems","additionalItems","anyOf","oneOf","allOf","$ref","const","enum"]);
const po=(v)=>v!==null&&typeof v==="object"&&!isArr(v);
const cv=(v)=>{if(v===null||typeof v!=="object")return v??null;if(isArr(v))return v.map(cv);const o={};for(const k of keys(v).sort())o[k]=cv(v[k]);return o;};
const sk=(s)=>{const o={};for(const k of keys(s).sort())if(s[k]!==undefined)o[k]=s[k];return o;};
const sn=(s)=>s.nullable===true||s.type==="null"||(isArr(s.type)&&s.type.includes("null"))||(isArr(s.anyOf)&&s.anyOf.some((b)=>b.type==="null"));
const wn=(s)=>{const{description,title,...b}=s;const w={anyOf:[b,{type:"null"}]};if(description!==undefined)w.description=description;if(title!==undefined)w.title=title;return w;};
function mn(s,p){
if(sn(s))return s;
const c={...s};
if(p.nullableStrategy==="nullable-flag"){c.nullable=true;return c;}
if(c.const!==undefined)return wn(c);
if((typeof c.type==="string"&&c.type!=="null")||isArr(c.type)){
c.type=isArr(c.type)?[...c.type,"null"]:[c.type,"null"];
if(isArr(c.enum)&&!c.enum.includes(null))c.enum=[...c.enum,null];
return c;
}
if(isArr(c.anyOf)){c.anyOf=[...c.anyOf,{type:"null"}];return c;}
return wn(c);
}
const ip=(v)=>typeof v==="string"?"string":typeof v==="number"?(Number.isInteger(v)?"integer":"number"):typeof v==="boolean"?"boolean":v===null?"null":undefined;
const inf=(s)=>s.properties!==undefined||s.additionalProperties!==undefined||s.required!==undefined?"object":s.items!==undefined||s.prefixItems!==undefined?"array":isArr(s.enum)&&s.enum.length?ip(s.enum[0]):s.const!==undefined?ip(s.const):undefined;
function bc(ref,d,ctx){
const n=`recursive reference to ${rn(ref)} truncated at max depth ${ctx.md}`;
const b={type:"object",properties:{}};
if(ctx.p.forceAdditionalPropertiesFalse)b.additionalProperties=false;
if(ctx.p.requireAllProperties)b.required=[];
b.description=ctx.h?appendHoistedConstraints(d,[n]):d;
return ctx.dk?sk(b):b;
}
function ex(node,ctx,rs){
const ns=new Map(rs);let cur={...node};
while(typeof cur.$ref==="string"){
const r=cur.$ref,cnt=ns.get(r)??0;
if(cnt>=ctx.md)return{res:cur,ns,cr:r};
const t=resolveJsonPointer(ctx.r,r),{$ref:_,...sib}=cur;
if(!t){cur=sib;break;}
ns.set(r,cnt+1);cur=mergeSchemas([t,sib]);
}
if(isArr(cur.allOf)&&cur.allOf.length){
const ps=[];
for(const x of cur.allOf){if(po(x)){const sub=ex(x,ctx,ns);ps.push(sub.cr?bc(sub.cr,x.description,ctx):sub.res);}}
const{allOf:_,...rest}=cur;ps.push(rest);cur=mergeSchemas(ps);
}
return{res:cur,ns};
}
function nn(raw,ctx,rs,isRoot){
const{res,ns,cr}=ex(raw,ctx,rs);
if(cr)return bc(cr,typeof res.description==="string"?res.description:undefined,ctx);
const p=ctx.p,hs=[],out={},bd=typeof res.description==="string"?res.description:undefined;
if(ctx.pt&&typeof res.title==="string"&&p.allowedKeywords.has("title"))out.title=res.title;
let nul=res.nullable===true;const ts=[];
for(const t of typeof res.type==="string"?[res.type]:isArr(res.type)?res.type:[]){
if(t==="null")nul=true;else if(typeof t==="string"&&VT.has(t)&&!ts.includes(t))ts.push(t);
}
const us=isArr(res.anyOf)?res.anyOf:isArr(res.oneOf)?res.oneOf:undefined;
if(!ts.length&&!nul&&!us){const f=inf(res)??(isRoot&&p.requireRootObject?"object":undefined);if(f)ts.push(f);}
if(us&&us.length){
if(isRoot&&p.requireRootObject){const m=mergeSchemas(us.filter(po)),{anyOf:_a,oneOf:_o,...rest}=res;return nn({...rest,...m,type:"object"},ctx,ns,true);}
const br=[];
for(const b of us){if(!po(b))continue;if(b.type==="null"&&p.nullableStrategy==="nullable-flag"){nul=true;continue;}br.push(nn(b,ctx,ns,false));}
if(p.nullableStrategy==="nullable-flag"&&nul&&br.length===1){const s={...br[0],nullable:true};if(bd!==undefined)s.description=appendHoistedConstraints(bd,hs);return ctx.dk?sk(s):s;}
if(br.length){out.anyOf=br;if(p.nullableStrategy==="nullable-flag"&&nul)out.nullable=true;}
}else if(ts.length>1){
if(p.nullableStrategy==="nullable-flag"){
const{nullable:_n,description:_d,title:_t,...sb}=res;
out.anyOf=ts.map((t)=>nn({...sb,type:t},ctx,ns,false));
if(nul)out.nullable=true;if(bd!==undefined)out.description=bd;
return ctx.dk?sk(out):out;
}
out.type=nul?[...ts,"null"]:[...ts];
}else if(ts.length===1){
if(nul&&p.nullableStrategy==="type-array")out.type=[ts[0],"null"];
else{out.type=ts[0];if(nul)out.nullable=true;}
}else if(nul){
if(p.nullableStrategy==="nullable-flag"){out.type="string";out.nullable=true;}else out.type="null";
}
const pt=typeof out.type==="string"?out.type:isArr(out.type)?out.type.find((t)=>t!=="null"):undefined;
if(pt==="object"){
const rp=po(res.properties)?res.properties:{},rr=new Set(isArr(res.required)?res.required.filter((k)=>typeof k==="string"):[]);
const pk=ctx.dk?keys(rp).sort():keys(rp),op={};
for(const k of pk){if(!po(rp[k]))continue;let n=nn(rp[k],ctx,ns,false);if(p.requireAllProperties&&!rr.has(k))n=mn(n,p);op[k]=ctx.dk?sk(n):n;}
out.properties=op;
if(p.requireAllProperties)out.required=[...pk];else{const vr=pk.filter((k)=>rr.has(k));if(vr.length)out.required=vr;}
if(p.forceAdditionalPropertiesFalse||p.stripAdditionalProperties){
if(p.forceAdditionalPropertiesFalse)out.additionalProperties=false;
if(ctx.h&&po(res.additionalProperties))hs.push(`dynamic values of type ${typeof res.additionalProperties.type==="string"?res.additionalProperties.type:"any"}`);
}else if(res.additionalProperties!==undefined){
if(typeof res.additionalProperties==="boolean")out.additionalProperties=res.additionalProperties;
else if(po(res.additionalProperties))out.additionalProperties=nn(res.additionalProperties,ctx,ns,false);
}
if(p.allowedKeywords.has("propertyOrdering")&&isArr(res.propertyOrdering)){
const ord=res.propertyOrdering.filter((k)=>typeof k==="string"&&hasOwn.call(op,k));
if(ord.length)out.propertyOrdering=ord;
}
}
if(pt==="array"){
const tup=isArr(res.prefixItems)&&res.prefixItems.length?res.prefixItems:isArr(res.items)&&res.items.length?res.items:undefined;
if(tup){const ti=tup.filter(po).map((x)=>nn(x,ctx,ns,false));out.items=ti.length===1?ti[0]:{anyOf:ti};if(ctx.h)hs.push(`tuple of length ${ti.length}`);}
else if(po(res.items))out.items=nn(res.items,ctx,ns,false);
else out.items={type:"string"};
}
if(res.const!==undefined){
if(p.allowedKeywords.has("const")&&!p.convertConstToEnum)out.const=cv(res.const);
else if(p.convertConstToEnum&&p.allowedKeywords.has("enum")&&typeof res.const==="string")out.enum=[res.const];
else if(ctx.h){const m=formatConstraint("const",res.const,ctx.cf);if(m)hs.push(m);}
}
if(isArr(res.enum)&&res.enum.length){
if(p.allowedKeywords.has("enum"))out.enum=p.target==="gemini"?res.enum.map(String):res.enum.map(cv);
else if(ctx.h)hs.push(`allowed values: ${res.enum.map((v)=>JSON.stringify(v)).join(", ")}`);
}
const d4n=res.exclusiveMinimum===true&&typeof res.minimum==="number",d4x=res.exclusiveMaximum===true&&typeof res.maximum==="number";
for(const k of keys(res).sort()){
if(HK.has(k))continue;
let v=res[k];if(v===undefined)continue;
if(k==="exclusiveMinimum"&&d4n)v=res.minimum;
else if(k==="exclusiveMaximum"&&d4x)v=res.maximum;
else if((k==="minimum"&&d4n)||(k==="maximum"&&d4x))continue;
if(k==="format"&&typeof v==="string"&&p.allowedKeywords.has("format")&&p.supportedFormats.has(v))out.format=v;
else if(k==="minItems"&&typeof v==="number"&&p.allowedKeywords.has("minItems")&&(p.maxMinItems===undefined||v<=p.maxMinItems))out.minItems=v;
else if(k!=="format"&&k!=="minItems"&&p.allowedKeywords.has(k))out[k]=cv(v);
else if(ctx.h){const m=formatConstraint(k,v,ctx.cf);if(m)hs.push(m);}
}
const fd=ctx.h?appendHoistedConstraints(bd,hs):bd;
if(fd!==undefined)out.description=fd;
return ctx.dk?sk(out):out;
}
function normalizeSchema(schema,options){
if(!po(schema))throw new TypeError("Input schema must be a non-null plain object");
const p=getProviderProfile(options.target),md=options.maxDepth??5;
if(!Number.isInteger(md)||md<1)throw new RangeError("maxDepth must be a positive integer");
return nn(schema,{r:schema,p,h:options.hoistUnsupportedConstraints??true,md,dk:options.deterministicKeys??true,pt:options.preserveTitle??true,cf:options.customHoistFormatter},new Map(),true);
}
function createNormalizer(options){const o={...options};return(s)=>normalizeSchema(s,o);}
module.exports={PROVIDER_PROFILES,getProviderProfile,formatConstraint,appendHoistedConstraints,resolveJsonPointer,mergeSchemas,normalizeSchema,createNormalizer};
