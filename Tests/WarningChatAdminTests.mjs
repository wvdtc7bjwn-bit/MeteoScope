import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reserveWarningChatQuota,recordWarningChatInferenceUsage,readWarningChatOperationalMetrics} from '../functions/_shared/warningChatQuota.js';
import {onRequest as adminRequest} from '../functions/api/admin/[[path]].js';
import {renderWarningChatUsage} from '../src/ui/adminWarningChatUsage.js';
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE app_records(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
const db={prepare(query){const statement=sql.prepare(query);let values=[];return{bind(...next){values=next;return this;},async first(){return statement.get(...values)??null;},async run(){return statement.run(...values);}};}};
const env={NOTIFICATIONS_DB:db,WARNING_CHAT_ENABLED:'true',WARNING_CHAT_DAILY_LIMIT:'40',AI:{async run(){}},ADMIN_PASSWORD:'local-test-only-password'};
const now=Date.now();
const empty=await readWarningChatOperationalMetrics(env,{now});
assert.equal(empty.requestCount,0);assert.equal(empty.reportedNeurons,0);assert.equal(empty.accountTotalNeurons,null);
const reservations=await Promise.all(Array.from({length:3},(_,i)=>reserveWarningChatQuota(db,`test-${i}`,{now})));
await recordWarningChatInferenceUsage(db,reservations[0].day,{usage:{neurons:10.25}});
await recordWarningChatInferenceUsage(db,reservations[1].day,{usage:{neurons:0}});
for(const value of [null,undefined,'',NaN,-5])await recordWarningChatInferenceUsage(db,reservations[2].day,{usage:{neurons:value}});
const metrics=await readWarningChatOperationalMetrics(env,{now});
assert.equal(metrics.requestCount,3);assert.equal(metrics.remainingRequests,37);assert.equal(metrics.reportedNeurons,10.25);
assert.equal(metrics.usageReports,2);assert.equal(metrics.unconfirmedRequests,1);assert.equal(metrics.reservedNeurons,600);
assert.equal(metrics.budgetNeurons,8000);assert.equal(metrics.freeDailyNeurons,10000);
assert.equal(metrics.accountTotalNeurons,null);
assert.doesNotMatch(JSON.stringify(metrics),/test-0|test-1|accounts/);
const nextDay=await readWarningChatOperationalMetrics(env,{now:now+86400_000});assert.equal(nextDay.requestCount,0);
assert.equal((await readWarningChatOperationalMetrics({...env,WARNING_CHAT_DAILY_LIMIT:'999'})).dailyLimit,40);
const unavailable=await readWarningChatOperationalMetrics({...env,NOTIFICATIONS_DB:null});assert.equal(unavailable.available,false);assert.equal(unavailable.requestCount,null);
const url='https://meteoscope.pages.dev/api/admin/';
assert.equal((await adminRequest({request:new Request(url+'quota'),env})).status,401);
const login=await adminRequest({request:new Request(url+'login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:env.ADMIN_PASSWORD})}),env});
const cookie=login.headers.get('set-cookie').split(';')[0];
const response=await adminRequest({request:new Request(url+'quota',{headers:{Cookie:cookie}}),env});
assert.equal(response.status,200);
const payload=await response.json();assert.equal(payload.warningChat.reportedNeurons,10.25);assert.equal(payload.usage.configured,false,'chat counters work without Analytics tokens');
assert.doesNotMatch(JSON.stringify(payload),/local-test-only-password|test-0/);
// Render using the public DOM contract: unavailable usage stays unknown and all
// values are text nodes. No HTML interpolation or personal identifier is used.
const originalDocument=globalThis.document;
function element(){return{children:[],textContent:'',append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}};}
try{globalThis.document={createElement:element};const root=element();renderWarningChatUsage(root,metrics);assert.equal(root.children.length,11);assert.match(root.children.map(x=>x.children.map(n=>n.textContent).join(':')).join('\n'),/10.25 Neurons/);renderWarningChatUsage(root,unavailable);assert.match(root.children[1].children[1].textContent,/取得不可/);assert.doesNotMatch(root.children.map(x=>x.children.map(n=>n.textContent).join(':')).join('\n'),/NaN/);}finally{globalThis.document=originalDocument;sql.close();}
console.log('Warning chat admin tests passed: atomic usage sums, missing values, daily rollover, admin-only access, metrics without Analytics and safe rendering.');
