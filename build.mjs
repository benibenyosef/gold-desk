import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
mkdirSync('dist/server',{recursive:true});
const client=readFileSync('src/client.js','utf8');
const html=readFileSync('src/page.html','utf8').replace('<!-- CLIENT_SCRIPT -->','<script>'+client+'</script>');
writeFileSync('dist/index.html',html);
writeFileSync('dist/server/index.js','const INITIAL_DATA='+readFileSync('src/cache-seed.json','utf8')+';\nconst PAGE_HTML='+JSON.stringify(html)+';\n'+readFileSync('src/worker.mjs','utf8'));
if(existsSync('.openai/hosting.json')){mkdirSync('dist/.openai',{recursive:true});copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');}
console.log('Worker and page built');
