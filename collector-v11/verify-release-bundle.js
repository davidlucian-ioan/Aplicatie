'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'www'));
const FORBIDDEN_NAMES=new Set(['.env','.env.local','.env.production','server.js','openai-provider-server.js','test-engine.js','test-openai-server-integration.js']);
const SECRET_PATTERNS=[/OPENAI_API_KEY\s*[:=]/i,/SUPABASE_SERVICE_ROLE_KEY\s*[:=]/i,/REVENUECAT_WEBHOOK_AUTHORIZATION\s*[:=]/i,/sk-[A-Za-z0-9]{24,}/,/service-role-test|server-only-secret/i];
function scan(root){
 const files=[];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else files.push(full)}}
 walk(root);
 const violations=[];
 for(const file of files){
  const relative=path.relative(root,file).split(path.sep).join('/');
  if(FORBIDDEN_NAMES.has(path.basename(file))||relative.split('/').some(part=>part.startsWith('.')))violations.push('Forbidden file: '+relative);
  const content=fs.readFileSync(file);
  if(content.includes(Buffer.from('OPENAI_API_KEY'))||content.includes(Buffer.from('SUPABASE_SERVICE_ROLE_KEY'))||content.includes(Buffer.from('REVENUECAT_WEBHOOK_AUTHORIZATION'))){
   const text=content.toString('utf8');
   if(SECRET_PATTERNS.some(pattern=>pattern.test(text)))violations.push('Server-secret marker: '+relative);
  }else{
   const text=content.toString('utf8');
   if(SECRET_PATTERNS.some(pattern=>pattern.test(text)))violations.push('Secret-looking value: '+relative);
  }
 }
 return {files:files.length,violations};
}
if(require.main===module){
 if(!fs.existsSync(ROOT)||!fs.statSync(ROOT).isDirectory()){process.stderr.write('Release bundle not found: '+ROOT+'\n');process.exitCode=1}
 else{const result=scan(ROOT);if(result.violations.length){process.stderr.write('Release bundle audit failed:\n'+result.violations.join('\n')+'\n');process.exitCode=1}else process.stdout.write('Release bundle audit passed ('+result.files+' files).\n')}
}
module.exports={scan,FORBIDDEN_NAMES,SECRET_PATTERNS};
