'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = process.env.KJ_REPO || execFileSync('git', ['rev-parse','--show-toplevel'], {encoding:'utf8'}).trim();
const { chromium } = require(require.resolve('playwright', { paths: [path.join(root,'project/tests/browser')] }));
const origin='https://korea-jogan.com';
const publicDir=path.join(root,'frontend-vanilla-js');
const tag='https://www.googletagmanager.com/gtag/js?id=G-RNLCEWH9M6';
const sentinel='kjqa_private_761935';
const clientId='314159265.1710000000';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const wait=n=>new Promise(r=>setTimeout(r,n));
function streams(request){
 const lines = (request.postData() || '').trim().split(/\r?\n/);
 return lines.map(line => {
  const params=new URLSearchParams(new URL(request.url()).search);
  for(const [k,v] of new URLSearchParams(line))params.set(k,v);
  return params;
 });
}
async function check(browser,googleScript,routePath,expectedTitle,input){
 const context=await browser.newContext({serviceWorkers:'block',bypassCSP:false});
 const diagnostics=[], allExternal=[], seen=[], framing=[];
 const sid=String(Math.floor(Date.now()/1000)-45);
 await context.addCookies([
  {name:'_ga',value:'GA1.1.'+clientId,url:origin},
  {name:'_ga_RNLCEWH9M6',value:'GS2.1.s'+sid+'$o5$g1$t'+sid+'$j60$l0$h0',url:origin},
 ]);
 try{
  await context.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>false});});
  await context.route('**/*', async route=>{
   const req=route.request(); const url=new URL(req.url());
   if(url.origin===origin){
    const relative=url.pathname.endsWith('/') ? url.pathname+'index.html' : url.pathname;
    const file=path.resolve(publicDir,'.'+relative);
    if(!file.startsWith(publicDir+path.sep)) return route.abort('blockedbyclient');
    try{ return await route.fulfill({body:await fsp.readFile(file),contentType:types[path.extname(file)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,contentType:'text/plain',body:''});}
   }
   const raw = [req.url(),req.postData()||'',JSON.stringify(req.headers())].join('\n');
   const leaked=raw.toLowerCase().includes(sentinel);
   allExternal.push({origin:url.origin,pathname:url.pathname,leaked});
   if(url.href===tag&&req.method()==='GET')return route.fulfill({body:googleScript,contentType:'text/javascript; charset=utf-8',headers:{'Access-Control-Allow-Origin':'*'}});
   if(/(^|\.)google-analytics\.com$|(^|\.)analytics\.google\.com$/.test(url.hostname)&&/\/collect$/.test(url.pathname)){
    for(const p of streams(req))if(p.get('en'))seen.push({event:p.get('en'),location:p.get('dl'),title:p.get('dt'),referrer:p.get('dr'),id:p.get('tid'),cid:p.get('cid'),sid:p.get('sid')});
   }
   // All telemetry and third-party dependencies end here. The browser has no outbound DNS.
   return route.fulfill({status:204,body:'',headers:{'Access-Control-Allow-Origin':'*'}});
  });
  const page=await context.newPage();
  page.on('console',m=>{if(['error','warning'].includes(m.type()))diagnostics.push(m.type()+': '+m.text().slice(0,240));});
  page.on('pageerror',e=>diagnostics.push(e.name+': '+e.message.slice(0,220)));
  await page.goto(origin+routePath+'?q='+sentinel+'&utm_campaign='+sentinel+'#'+sentinel,{referer:'https://www.google.com/search?q='+sentinel});
  await page.locator(input).fill(sentinel+'_form');
  await page.locator(input).press('Enter');
  await page.evaluate(marker=>{
   window.scrollTo(0,document.body.scrollHeight);
   const link=document.createElement('a');
   link.href='https://example.invalid/official-ruling?q='+marker;
   link.textContent=marker+'_link'; document.body.append(link);
   link.addEventListener('click',event=>event.preventDefault(),{once:true});
   link.click();
   link.remove();
   history.replaceState({},'',location.pathname+'?q='+marker+'_history#'+marker);
  },sentinel);
  for(let i=0;i<60&&!seen.some(x=>x.event==='page_view');i++)await wait(250);
  for(const frame of page.frames().slice(1)){
   framing.push(await frame.evaluate(()=>{let parentReadable=false;try{parentReadable=Boolean(parent.document.body);}catch{} let cookieReadable=true;try{void document.cookie;}catch{cookieReadable=false;}return {parentReadable,cookieReadable,origin:self.origin,referrer:document.referrer};}));
  }
  await wait(1300);
  assert.ok(!allExternal.some(x=>x.leaked),'a URL, request body or header contained a synthetic sensitive marker');
  assert.ok(!seen.some(x=>['form_start','form_submit','view_search_results','click'].includes(x.event)),'automatic law interaction event appeared');
  const views=seen.filter(x=>x.event==='page_view');
  if(views.length!==1)console.error(JSON.stringify({routePath,framing,diagnostics,external:allExternal,events:seen.map(x=>x.event)}));
  assert.equal(views.length,1,'expected exactly one real-Google-tag page_view intercepted');
  const view=views[0];
  assert.equal(view.id,'G-RNLCEWH9M6');assert.equal(view.location,origin+routePath);assert.equal(view.title,expectedTitle);
  assert.equal(new URL(view.referrer).origin,'https://www.google.com');
  assert.ok(['https://www.google.com','https://www.google.com/'].includes(view.referrer));
  assert.equal(view.cid,clientId,'law view starts a new GA client despite existing first-party GA cookie');
  assert.equal(view.sid,sid,'law view starts a new GA session despite existing first-party session');
  assert.ok(framing.length===1 && framing[0].origin===origin && framing[0].cookieReadable && framing[0].referrer==='','tracker must use empty-referrer clean child document with first-party measurement');
  assert.ok(allExternal.some(x=>x.origin==='https://www.googletagmanager.com'&&x.pathname==='/gtag/js'));
  assert.ok(allExternal.every(x=>x.origin!== 'https://example.invalid'));
  console.log(JSON.stringify({routePath,event:view.event,title:view.title,referrer:view.referrer,frame:framing[0],existingClientAndSession:true,collection:'local interception',privateMarkers:0}));
 }finally{await context.close();}
}
(async()=>{
 // The only allowed live request obtains the production-configured Google tag itself.
 const googleScript=process.env.KJ_GTAG_FILE?fs.readFileSync(process.env.KJ_GTAG_FILE):Buffer.from(execFileSync('curl',['--fail','--silent','--show-error','--max-time','25',tag],{maxBuffer:4*1024*1024}));
 assert.ok(googleScript.length>20000);
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 try{
  await check(browser,googleScript,'/law/','판례 자료실 | 대한민국 조간','#lawQuery');
  await check(browser,googleScript,'/law/calendar/','입법 캘린더 · 법률면 | 대한민국 조간','#cal-q');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
