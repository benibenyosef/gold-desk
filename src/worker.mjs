const memory=new Map(),pending=new Map();
const SOURCE_HEADERS={Accept:'application/json,text/html,application/xml','User-Agent':'Mozilla/5.0'};
const finite=v=>Number.isFinite(v)?v:null;
export function dateKey(time,zone='America/New_York'){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));}
export function mondayKey(key){const d=new Date(key+'T12:00:00Z');const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-(day===0?6:day-1));return d.toISOString().slice(0,10);}
export function parseMarket(data,symbol){
 const r=data?.chart?.result?.[0],m=r?.meta;
 if(data?.chart?.error||m?.symbol!==symbol||!Number.isFinite(m.regularMarketPrice)||m.regularMarketPrice<=0||!Number.isFinite(m.regularMarketTime))throw Error('Invalid market data');
 if(['GC=F','SI=F','ES=F'].includes(symbol)&&m.instrumentType!=='FUTURE')throw Error('Expected futures');
 const b=r.indicators?.quote?.[0]??{},zone=m.exchangeTimezoneName||'America/New_York';
 const bars=(r.timestamp??[]).map((t,i)=>({date:dateKey(t*1000,zone),open:finite(b.open?.[i]),high:finite(b.high?.[i]),low:finite(b.low?.[i]),close:finite(b.close?.[i]),volume:finite(b.volume?.[i])}));
 let quoteDate=dateKey(m.regularMarketTime*1000,zone);
 const lastBar=bars.findLast(x=>x.close!==null);
 if(m.instrumentType==='FUTURE'&&lastBar&&Math.abs(new Date(lastBar.date)-new Date(quoteDate))<=86400000)quoteDate=lastBar.date;
 const current=bars.findLast(x=>x.date===quoteDate),previous=bars.findLast(x=>x.date<quoteDate&&x.close!==null);
 const change=finite(m.fulldayChange)??(previous?m.regularMarketPrice-previous.close:null);
 const prev=change!==null?m.regularMarketPrice-change:null;
 const weekStart=mondayKey(quoteDate),weekBase=bars.findLast(x=>x.date<weekStart&&x.close!==null);
 const weekBars=bars.filter(x=>x.date>=weekStart&&x.date<=quoteDate);
 const lows=weekBars.map(x=>x.low).filter(Number.isFinite),highs=weekBars.map(x=>x.high).filter(Number.isFinite);
 return {symbol,contract:m.shortName||symbol,exchange:m.fullExchangeName||m.exchangeName,currency:m.currency,price:m.regularMarketPrice,change,changePercent:finite(m.fulldayChangePercent)??(prev?change/prev*100:null),previousClose:prev,open:current?.open??null,high:finite(m.regularMarketDayHigh)??current?.high??null,low:finite(m.regularMarketDayLow)??current?.low??null,volume:finite(m.regularMarketVolume),weekPercent:weekBase?(m.regularMarketPrice/weekBase.close-1)*100:null,weekBase:weekBase?.close??null,weekStart,quoteDate,weekLow:lows.length?Math.min(...lows):null,weekHigh:highs.length?Math.max(...highs):null,bars:bars.slice(-8),quoteTime:new Date(m.regularMarketTime*1000).toISOString(),fetchedAt:new Date().toISOString(),source:'Yahoo Finance',delayed:true};
}
async function cached(name,ttl,fn){
 const local=memory.get(name);if(local&&Date.now()-local.time<ttl*1000)return local.data;
 if(pending.has(name))return pending.get(name);
 const job=(async()=>{
  let cache=null;try{cache=globalThis.caches?.default;}catch{}
  const key=new Request('https://gold-desk-cache.invalid/v4/'+name);
  if(cache){try{const hit=await cache.match(key);if(hit){const data=await hit.json();memory.set(name,{time:Date.now(),data});return data;}}catch(e){console.warn('Shared cache unavailable:',String(e.message));}}
  const data=await fn();memory.set(name,{time:Date.now(),data});
  if(cache){try{await cache.put(key,Response.json(data,{headers:{'Cache-Control':'public, max-age='+ttl}}));}catch(e){console.warn('Shared cache write unavailable:',String(e.message));}}
  return data;
 })();pending.set(name,job);try{return await job;}finally{pending.delete(name);}
}
async function read(url){const r=await fetch(url,{headers:SOURCE_HEADERS,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Provider HTTP '+r.status);return r;}
async function market(symbol){return cached('market-'+encodeURIComponent(symbol),60,async()=>parseMarket(await (await read('https://query2.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?interval=1d&range=1mo')).json(),symbol));}
export function direction(value,threshold){return !Number.isFinite(value)?'unknown':value>threshold?'up':value<-threshold?'down':'flat';}
export function analysis(markets,now=Date.now()){
 const g=markets.gold;if(!g)return {available:false};
 const stale=now-new Date(g.quoteTime).getTime()>45*60000;
 const day=direction(g.changePercent,.15),week=direction(g.weekPercent,.3);
 const factors=[];
 for(const [key,inverse,threshold] of [['dollar',true,.1],['yield10',true,.5],['silver',false,.25]]){
  const q=markets[key];if(!q)continue;
  const gap=Math.abs(new Date(q.quoteTime)-new Date(g.quoteTime))/60000;
  const age=(now-new Date(q.quoteTime))/60000;
  const comparable=gap<=30&&age<=45&&!stale&&q.quoteDate===g.quoteDate;
  const d=direction(q.changePercent,threshold);
  factors.push({key,direction:d,comparable,effect:!comparable||d==='unknown'?'unknown':d==='flat'?'neutral':(d==='up')!==inverse?'support':'pressure',gapMinutes:Math.round(gap)});
 }
 const relevant=factors.filter(f=>f.comparable&&f.effect!=='unknown'&&f.effect!=='neutral');
 const support=relevant.filter(f=>f.effect==='support').length,pressure=relevant.filter(f=>f.effect==='pressure').length;
 const background=support&&pressure?'mixed':support?'support':pressure?'pressure':'unknown';
 const conflict=(day==='up'&&background==='pressure')||(day==='down'&&background==='support');
 const dayPosition=g.high>g.low?Math.max(0,Math.min(100,(g.price-g.low)/(g.high-g.low)*100)):null;
 const weekPosition=g.weekHigh>g.weekLow?Math.max(0,Math.min(100,(g.price-g.weekLow)/(g.weekHigh-g.weekLow)*100)):null;
 return {available:true,stale,day,week,background,conflict,factors,coverage:relevant.length,dayPosition,weekPosition};
}
export function parseFred(html,series){
 const rows=[...html.matchAll(/<td[^>]*>\s*(\d{4}-\d{2}-\d{2}):[^<]*<\/td>\s*<td[^>]*class="series-obs value"[^>]*>\s*([\d.-]+)\s*<\/td>/g)].map(m=>({date:m[1],value:Number(m[2])})).filter(x=>Number.isFinite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));
 if(!rows.length)throw Error('FRED observations unavailable');
 const latest=rows.at(-1),prev=rows.at(-2),start=mondayKey(latest.date),base=rows.findLast(x=>x.date<start);
 return {series,...latest,previousDate:prev?.date??null,changeBps:prev?(latest.value-prev.value)*100:null,weekChangeBps:base?(latest.value-base.value)*100:null,source:'FRED · Federal Reserve',url:'https://fred.stlouisfed.org/series/'+series,fetchedAt:new Date().toISOString(),frequency:'daily'};
}
export function parseH15(html){
 const columns=[...html.matchAll(/<th[^>]*id="col\d+"[^>]*>([\s\S]*?)<\/th>/g)].map(m=>{const t=m[1].replace(/<[^>]+>/g,' ').trim();return new Date(t+' 12:00:00 UTC').toISOString().slice(0,10);});
 if(!columns.length)throw Error('Missing H15 dates');
 const rows=[...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>m[1]);
 let real=false,items=[];
 for(const row of rows){
  if(row.includes('Inflation indexed'))real=true;
  const label=row.match(/<th[^>]*class="stub in4"[^>]*>([^<]+)<\/th>/)?.[1]?.trim();
  const series=!real&&label==='2-year'?'DGS2':real&&label==='10-year'?'DFII10':null;
  if(!series)continue;
  const values=[...row.matchAll(/<td[^>]*class="data"[^>]*>([\s\S]*?)<\/td>/g)].map(m=>Number(m[1].replace(/&nbsp;/g,' ').trim()));
  const obs=values.map((value,i)=>({date:columns[i],value})).filter(x=>x.date&&Number.isFinite(x.value));if(!obs.length)continue;
  const latest=obs.at(-1),prev=obs.at(-2),base=obs.findLast(x=>x.date<mondayKey(latest.date));
  items.push({series,...latest,previousDate:prev?.date??null,changeBps:prev?(latest.value-prev.value)*100:null,weekChangeBps:base?(latest.value-base.value)*100:null,source:'Federal Reserve · H.15',url:'https://www.federalreserve.gov/releases/h15/',fetchedAt:new Date().toISOString(),frequency:'daily'});
 }
 if(items.length!==2)throw Error('Missing H15 yield series');return {items,unavailable:[]};
}
async function yields(){return cached('h15',21600,async()=>{
 try{return parseH15(await (await read('https://www.federalreserve.gov/releases/h15/')).text());}
 catch(e){console.error('H15: '+String(e.message));const keys=['DGS2','DFII10'];const r=await Promise.allSettled(keys.map(async s=>parseFred(await (await read('https://fred.stlouisfed.org/series/'+s)).text(),s)));return {items:r.filter(x=>x.status==='fulfilled').map(x=>x.value),unavailable:keys.filter((_,i)=>r[i].status==='rejected')};}
 });}
export function parseCalendar(data){
 if(!Array.isArray(data))throw Error('Invalid calendar');
 return data.filter(e=>e.country==='USD'&&Number.isFinite(Date.parse(e.date))).map(e=>({title:String(e.title),date:new Date(e.date).toISOString(),impact:['High','Medium','Low'].includes(e.impact)?e.impact:'Unknown',forecast:String(e.forecast||''),previous:String(e.previous||''),actual:e.actual===undefined?null:String(e.actual),country:'USD'})).sort((a,b)=>a.date.localeCompare(b.date));
}
async function calendar(){return cached('calendar',1800,async()=>{
 try{return {events:parseCalendar(await (await read('https://nfs.faireconomy.media/ff_calendar_thisweek.json')).json()),source:'Forex Factory · Fair Economy',url:'https://www.forexfactory.com/calendar',fetchedAt:new Date().toISOString(),stale:false};}
 catch(e){console.error('Calendar: '+String(e.message));return {events:parseCalendar(INITIAL_DATA.calendar.data),source:'Forex Factory · Fair Economy',url:'https://www.forexfactory.com/calendar',fetchedAt:INITIAL_DATA.calendar.fetchedAt,stale:true,notice:'חיבור המקור נכשל — מוצגת הרשימה האחרונה שנשלפה בהצלחה, והיא עלולה להיות לא מעודכנת.'};}
 });}
function decode(s){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
export function parseNews(xml,now=Date.now(),defaultSource=''){
 const tag=(s,n)=>decode(s.match(new RegExp('<'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+n+'>'))?.[1]||'');
 const seen=new Set();return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>{const s=m[1],source=tag(s,'source')||defaultSource;let title=tag(s,'title');if(title.endsWith(' - '+source))title=title.slice(0,-source.length-3);return {title,source,url:tag(s,'link'),publishedAt:new Date(tag(s,'pubDate')).toISOString()};}).filter(n=>{if(!n.title||!['news.google.com','www.federalreserve.gov'].includes(new URL(n.url).hostname)||now-new Date(n.publishedAt)>4*86400000||seen.has(n.title))return false;seen.add(n.title);return true;}).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,9);
}
async function news(){return cached('news-he',900,async()=>{
 try{const items=parseNews(await (await read('https://news.google.com/rss/search?q='+encodeURIComponent('זהב דולר when:3d')+'&hl=he&gl=IL&ceid=IL:he')).text());return {items,source:'Google News · כותרות המקורות',fetchedAt:new Date().toISOString(),stale:false};}
 catch(e){console.error('News: '+String(e.message));
  let official=[];try{official=parseNews(await (await read('https://www.federalreserve.gov/feeds/press_monetary.xml')).text(),Date.now(),'Federal Reserve');}catch(e){console.error('Fed news: '+String(e.message));}
  const saved=parseNews(INITIAL_DATA.news.data,Date.now());
  return {items:[...official,...saved].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,9),source:'Federal Reserve / כותרות אחרונות שנשלפו',fetchedAt:INITIAL_DATA.news.fetchedAt,stale:true,notice:'המקור העברי אינו זמין כרגע. כותרות שמורות מוצגות לצד הודעות הפד, בשפת המקור.'};
 }
 });}
async function allMarkets(){
 const list=[['gold','GC=F'],['silver','SI=F'],['dollar','DX-Y.NYB'],['yield10','^TNX'],['equities','ES=F']];
 const r=await Promise.allSettled(list.map(([,s])=>market(s)));const markets={},unavailable=[];
 r.forEach((x,i)=>{if(x.status==='fulfilled')markets[list[i][0]]=x.value;else{unavailable.push(list[i][0]);console.error('Market '+list[i][0]+': '+String(x.reason?.message));}});
 return {markets,unavailable,analysis:analysis(markets),generatedAt:new Date().toISOString()};
}
export default {async fetch(request){
 const path=new URL(request.url).pathname;
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(path==='/'||path==='/index.html')return new Response(request.method==='HEAD'?null:PAGE_HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});
 const routes={'/api/markets':allMarkets,'/api/calendar':calendar,'/api/news':news,'/api/yields':yields,'/api/gold-quote':()=>market('GC=F')};
 if(routes[path]){try{return Response.json(await routes[path](),{headers:{'Cache-Control':'no-store'}});}catch(e){console.error('Source route '+path+': '+String(e.message));return Response.json({error:'source_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}}
 return new Response('Not found',{status:404});
}};
