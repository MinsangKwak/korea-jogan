const { chromium } = require(require.resolve('playwright',{paths:[require('path').resolve('project/tests/browser')]}));
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const [phase,dir,device,iteration] = process.argv.slice(2);
const noLocal = process.env.QA_NO_CJK === '1';
const output = path.join(process.env.QA_OUTPUT||'/tmp',(noLocal?'no-local-font-':'')+phase+'-'+device+'-'+iteration);
const mime = {'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.avif':'image/avif'};
const server = http.createServer((req,res) => {
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const clean = path.resolve(dir,'.'+pathname);
  let name = clean;
  if (!fs.existsSync(name) && fs.existsSync(name+'.html')) name+='.html';
  if (fs.existsSync(name) && fs.statSync(name).isDirectory()) name=path.join(name,'index.html');
  if (!name.startsWith(dir+'/') || !fs.existsSync(name)) {res.writeHead(404).end();return;}
  let content = fs.readFileSync(name);
  const headers={'Content-Type':mime[path.extname(name)]||'application/octet-stream'};
  if (/text\/|json|svg/.test(headers['Content-Type'])) { content=zlib.gzipSync(content); headers['Content-Encoding']='gzip';}
  headers['Content-Length']=content.length;
  res.writeHead(200,headers).end(content);
});
(async () => {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const isMobile=device==='mobile';
  const context = await browser.newContext({viewport:isMobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:1,isMobile,hasTouch:isMobile,locale:'ko-KR',timezoneId:'Asia/Seoul',reducedMotion:'no-preference'});
  await context.addInitScript(() => {
    window.qaShifts=[];window.qaLcp=[];
    new PerformanceObserver(list=>{for(const e of list.getEntries()){if (!e.hadRecentInput)window.qaShifts.push({start:e.startTime,value:e.value,src:e.sources.map(v=>v.node?.id||v.node?.className||'').map(String).slice(0,3)});}}).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(list=>{for(const e of list.getEntries())window.qaLcp.push({start:e.startTime,tag:e.element?.tagName,id:e.element?.id});}).observe({type:'largest-contentful-paint',buffered:true});
    let obs=new MutationObserver(()=>{
      let state=document.documentElement?.dataset.loadState;
      if(state && !window.qaReady){window.qaReady={state,time:performance.now()};obs.disconnect();}
    });obs.observe(document,{subtree:true,attributes:true,attributeFilter:['data-load-state']});
  });
  const pg=await context.newPage(); const cdp=await context.newCDPSession(pg);
  const reqs=new Map(),errors=[];
  const port=server.address().port;
  cdp.on('Network.requestWillBeSent',e=>reqs.set(e.requestId,{url:e.request.url,type:e.type}));
  cdp.on('Network.responseReceived',e=>Object.assign(reqs.get(e.requestId)||{},{type:e.type,status:e.response.status}));
  cdp.on('Network.loadingFinished',e=>Object.assign(reqs.get(e.requestId)||{},{bytes:e.encodedDataLength,complete:true}));
  cdp.on('Network.loadingFailed',e=>Object.assign(reqs.get(e.requestId)||{},{failure:e.errorText}));
  pg.on('pageerror',e=>errors.push(e.message));
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.setBlockedURLs',{urls:['*://*.google-analytics.com/*','*://*.googletagmanager.com/*','*://gc.zgo.at/*','*://*.google.com/*','*://*.g.doubleclick.net/*']});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:2});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:1500000,uploadThroughput:500000,connectionType:'cellular4g'});
  const url='http://127.0.0.1:'+port+'/';
  await pg.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
  await pg.waitForFunction(()=>document.documentElement.dataset.loadState==='ready',{},{timeout:45000});
  await pg.waitForTimeout(1800);
  let completedFonts=true;
  try{await pg.waitForFunction(()=>document.fonts.status==='loaded',{},{timeout:65000});}catch{completedFonts=false;}
  await pg.waitForTimeout(1500);
  const lims=Array.from(reqs.values());
  const inBand=lims.filter(v=>v.status===200);
  const summarize=rs=>({count:rs.length,wire:rs.reduce((n,i)=>n+(i.bytes||0),0),finished:rs.filter(x=>x.complete).length});
  const data=await pg.evaluate(()=>{
    let cls=0,sum=0,last=-1,start=-1;
    for(const e of window.qaShifts) {
      if(start<0||e.start-last>=1000||e.start-start>=5000){start=e.start;sum=0;}
      sum+=e.value;last=e.start;cls=Math.max(cls,sum);
    }
    const boxes={}; for (const id of ['leadFacts','frontTitle','leadH','indH','fisH','fixes']) {
      const el=document.getElementById(id);if(!el)continue;const s=getComputedStyle(el);const b=el.getBoundingClientRect();
      boxes[id]={y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),font:s.fontFamily};
    }
    const scrolls=Array.from(document.querySelectorAll('.fiscal-grid *, .industry-overview *')).filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowY)&&e.clientHeight&&e.scrollHeight>e.clientHeight+4).map(e=>e.className||e.id);
    const nav=performance.getEntriesByType('navigation')[0];
    const canvas=document.createElement('canvas');
    canvas.width=72;canvas.height=72;
    const pen=canvas.getContext('2d',{willReadFrequently:true});
    pen.font='48px '+getComputedStyle(document.body).fontFamily;
    function glyph(letter){
      pen.clearRect(0,0,72,72);
      pen.fillText(letter,4,55);
      return canvas.toDataURL();
    }
    const visibleHangul=glyph('한')!==glyph('국') && glyph('가')!==glyph('독');
    const mast = document.querySelector('header.kj-head') || document.querySelector('header');
    const palette = {body:getComputedStyle(document.body).backgroundColor,mast:mast&&getComputedStyle(mast).backgroundColor,root:getComputedStyle(document.documentElement).backgroundColor};
    return {visibleHangul,palette,title:document.title,date:JSON.parse(document.querySelector('#issue-data').textContent).date,paint:performance.getEntriesByType('paint').map(e=>[e.name,Math.round(e.startTime)]),lcp:window.qaLcp,ready:window.qaReady,shifts:window.qaShifts,cls,boxes,scrolls,docWidth:document.documentElement.scrollWidth,viewport:innerWidth,navDecoded:nav.decodedBodySize,navWire:nav.encodedBodySize};
  });
  await pg.evaluate(() => {
    const probe=document.createElement('span');
    probe.id='qa-hangul-glyphs';
    probe.setAttribute('aria-hidden','true');
    probe.style.cssText='position:fixed;top:0;left:0;pointer-events:none;opacity:0.001;font-size:22px;z-index:-1';
    probe.textContent='한국의뉴스를읽습니다';
    document.body.append(probe);
    void probe.getBoundingClientRect();
  });
  await pg.evaluate(()=>document.fonts.ready);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const dom=await cdp.send('DOM.getDocument');
  const probe=await cdp.send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#qa-hangul-glyphs'});
  const platform=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:probe.nodeId});
  data.glyphFonts=platform.fonts;
  await pg.evaluate(()=>document.querySelector('#qa-hangul-glyphs').remove());
  const han=platform.fonts.filter(font=>font.glyphCount>0 && !/^LastResort$|^Arial$|^Liberation|^Times New Roman$|^DejaVu/i.test(font.familyName));
  const expectedFont =noLocal?han.some(font=>font.isCustomFont):phase==='after'?han.some(font=>/Noto|Nanum|Gothic|Malgun|명조|고딕/i.test(font.familyName)):han.length>0;
  if(iteration==='1'){
  await pg.screenshot({path:output+'-home.jpg',type:'jpeg',quality:75});
  await pg.evaluate(()=>document.querySelector('[data-theme-toggle]')?.click());
  for(const [label,selector] of [['lead','#leadFacts'],['industry','#indH'],['fiscal','#fisH'],['history','#debtH']]) {
    const el=pg.locator(selector);
    if(await el.count()){await el.evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));await pg.waitForTimeout(160);await pg.screenshot({path:output+'-'+label+'.jpg',type:'jpeg',quality:75});}
  }
  }
  if (!expectedFont || !data.visibleHangul || data.docWidth > data.viewport + 1 || data.date !== '2026-11-23' || data.ready.state !== 'ready' || errors.length) throw Error(JSON.stringify({data,errors}));
  const local=inBand.filter(x=>x.url.startsWith('http://127.0.0.1:'));
  const fontFaces=lims.filter(x=>x.type==='Font'||/fonts\.gstatic/.test(x.url));
  const resources={total:summarize(inBand),local:summarize(local),localCSS:summarize(local.filter(x=>x.type==='Stylesheet')),localJS:summarize(local.filter(x=>x.type==='Script')),fontCSS:summarize(inBand.filter(x=>x.url.includes('fonts.googleapis.com'))),fontFiles:summarize(fontFaces.filter(x=>x.status===200)),fontAttempted:fontFaces.length,fontsFailed:fontFaces.filter(x=>x.failure).length};
  const localFontResponses=fontFaces.filter(x=>x.status===200&&x.url.startsWith(url));
  if(phase==='after' && (noLocal ? !localFontResponses.length : localFontResponses.some(x=>x.url.endsWith('.woff2') && x.complete))) {
    throw Error(JSON.stringify({noLocal,expectedFont,glyphFonts:data.glyphFonts,localFontResponses}));
  }
  const report={phase,device,iteration,noLocal,completedFonts,errors,data,resources,requests:lims};
  fs.writeFileSync(output+'.json',JSON.stringify(report,null,2));
  console.log('EDITION_METRICS '+JSON.stringify({phase,device,iteration,noLocal,visibleHangul:data.visibleHangul,glyphFonts:data.glyphFonts,palette:data.palette,resources,cls:data.cls,lcp:data.lcp.at(-1),paint:data.paint,ready:data.ready,scrolls:data.scrolls,errors,completedFonts}));
  await browser.close();server.close();
})().catch(err=>{console.error(err);server.close();process.exit(1)});
