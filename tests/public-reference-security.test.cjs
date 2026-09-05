const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Response,Headers,Uint8Array,console:{error(){}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'}}});return exports;}
const codeLib=load('src/lib/publicReferenceCode.ts',()=>({}));
const json=(body,options)=>Response.json(body,options);const NextResponse=class extends Response {};NextResponse.json=json;
const access=load('src/lib/publicReferenceAccess.ts',name=>name==='node:crypto'?require(name):name==='next/server'?{NextResponse}:name==='./publicReferenceCode'?codeLib:{});
const code='12345678-abcd-4abc-8abc-123456789abc';
function route(file,{record={id:1,archive_drive_file_id:'test'},rpc=true,rpcError=null,downloadError=false}={}){const calls=[];const query={select(){return this},eq(key,value){calls.push({key,value});return this},async maybeSingle(){return {data:record,error:null}}};const client={from(){return query},rpc:async()=>({data:rpc,error:rpcError})};return {calls,...load(file,name=>name==='next/server'?{NextResponse}:name==='@supabase/supabase-js'?{createClient:()=>client}:name==='@/lib/publicReferenceCode'?codeLib:name==='@/lib/publicReferenceAccess'?access:name==='@/lib/googleSheetReferences'?{getGoogleSheetReferences:async()=>[{ref_number:'NM/1995/25',subject:'Heshiis',issue_date:'2025-01-01',surveys:{serial_no:42,survey_no:null,owner_name:'Milkiile',neighborhood:'Waaberi',land_type:'Dhul Banaan',gps_location:'3.12,43.65',polygon_boundary:'3.12,43.65;3.13,43.65;3.13,43.66'}}]}:name==='@/lib/archiveDriveConfig'?{getArchiveDriveConfig:async()=>({})}:name==='@/lib/driveArchive'?{downloadArchivePdf:async()=>{if(downloadError)throw Error('secret');return Buffer.from('%PDF-1.7')}}:{})};}
for(const file of ['src/app/api/public/references/[id]/route.ts','src/app/api/public/references/[id]/document/route.ts']){
 test(file+' rejects numeric, old signed, reference and malformed codes before DB',async()=>{for(const id of ['1','1-0123456789abcdef','MNP-2026-04141','bad']){const r=route(file);assert.equal((await r.GET({}, {params:Promise.resolve({id})})).status,404);assert.equal(r.calls.length,0)}});
 test(file+' only queries exact token',async()=>{const r=route(file);const response=await r.GET({}, {params:Promise.resolve({id:code})});assert.equal(response.status,200);assert.deepEqual(r.calls,[{key:'verification_token',value:code}]);assert.match(response.headers.get('cache-control'),/no-store/)});
 test(file+' fails closed when limiter missing and honors limit',async()=>{for(const [opts,status] of [[{rpc:null,rpcError:{}},503],[{rpc:false},429]]){const r=route(file,opts);assert.equal((await r.GET({}, {params:Promise.resolve({id:code})})).status,status);assert.equal(r.calls.length,0)}});
 test(file+' missing record is 404',async()=>{const r=route(file,{record:null});assert.equal((await r.GET({}, {params:Promise.resolve({id:code})})).status,404)});
}
test('archive failures do not disclose internal details',async()=>{const r=route('src/app/api/public/references/[id]/document/route.ts',{downloadError:true});const response=await r.GET({}, {params:Promise.resolve({id:code})});assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret/)});
test('rate-limit keys are hashed and shared, not raw capabilities',async()=>{let args;await access.authorizePublicReference({rpc:async(name,params)=>{args=params;return {data:true,error:null}}},code);assert.match(args.token_hash,/^[a-f0-9]{64}$/);assert.notEqual(args.token_hash,code)});

for(const path of ['/verify/private-code','/api/public/references/private-code/document']) {
 test('private resource bypasses offline cache: '+path,async()=>{
  let handler;let cacheUsed=false;let options;
  vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{self:{location:{origin:'https://app.test'},addEventListener:(name,fn)=>{if(name==='fetch')handler=fn}},URL,Response,fetch:async(req,opts)=>{options=opts;throw Error('offline')},caches:{open:async()=>{cacheUsed=true;throw Error('cache must not open')}}});
  let result;handler({request:new Request('https://app.test'+path),respondWith:p=>{result=p}});
  await assert.rejects(result,/offline/);assert.equal(cacheUsed,false);assert.equal(options.cache,'no-store');
 });
}

test('normalizes and verifies historical sheet references without exposing a PDF',async()=>{
 assert.equal(codeLib.normalizeSheetReference(' nm/1995/2025 '),'NM/1995/25');
 assert.equal(codeLib.normalizeSheetReference('1995'),null);
 const r=route('src/app/api/public/references/[id]/route.ts');
 const response=await r.GET({}, {params:Promise.resolve({id:'NM/1995/2025'})});
 assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.reference.ref_number,'NM/1995/25');assert.equal(body.reference.source,'sheet');assert.equal(body.reference.archive_drive_file_id,null);assert.equal(body.reference.surveys.gps_location,'3.12,43.65');assert.match(body.reference.surveys.polygon_boundary,/;/);assert.equal(r.calls.length,0);
});
