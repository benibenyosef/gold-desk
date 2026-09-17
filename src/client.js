(()=>{
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const signed=(n,d=2)=>Number.isFinite(n)?(n>0?'+':'')+num(n,d):'—';
const pct=n=>Number.isFinite(n)?signed(n)+'%':'—';
const text=(id,value)=>{$(id).textContent=value;};
function dateKey(time=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));}
function fmt(time,date=true){return new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',...(date?{day:'2-digit',month:'2-digit'}:{}),hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(time));}
const ago=t=>Math.max(0,Math.floor((Date.now()-new Date(t).getTime())/60000));
const tone=d=>d==='up'?'var(--green)':d==='down'?'var(--red)':'var(--dim)';
const TITLES={day:{up:'עולה היום',down:'יורד היום',flat:'שינוי קטן היום',unknown:'חסר נתון יומי'},week:{up:'חיובי השבוע',down:'שלילי השבוע',flat:'שינוי קטן השבוע',unknown:'חסר בסיס שבועי'}};
let lastMarkets=null,calendarData=null,period='today',impactFilter='all',impactSort='impactAsc',nextEvent=null;
const busy=new Set();
async function get(path){const r=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(24000)});if(!r.ok)throw Error('Source unavailable');return r.json();}
function setTheme(mode){document.documentElement.dataset.theme=mode;$('themeBtn').textContent=mode==='dark'?'מצב בהיר':'מצב כהה';$('themeBtn').setAttribute('aria-pressed',String(mode==='dark'));try{localStorage.setItem('goldmacro-theme',mode);}catch{}}
try{setTheme(localStorage.getItem('goldmacro-theme')==='dark'?'dark':'light');}catch{setTheme('light');}
$('themeBtn').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
function clock(){text('ilClock',new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()));}
clock();setInterval(()=>{clock();tickCountdown();},1000);
function range(prefix,position,low,high){
 text(prefix+'Low',num(low));text(prefix+'High',num(high));
 text(prefix+'Position',Number.isFinite(position)?(position<33?'בחלק התחתון':position>67?'בחלק העליון':'במרכז הטווח'):'טווח לא זמין');
 const marker=$(prefix+'Marker');marker.style.display=Number.isFinite(position)?'block':'none';marker.style.left=(position??50)+'%';
}
function renderMarkets(data){
 lastMarkets=data;const g=data.markets.gold,a=data.analysis;
 text('marketStamp','בדיקת מקורות: '+fmt(data.generatedAt)+' · ציטוטים מושהים');
 if(!g||!a.available){
  text('quoteStatus','נתוני הזהב אינם זמינים כרגע. אין בסיס לסיכום יומי או שבועי.');
  text('dayTitle','זהב לא זמין');text('weekTitle','זהב לא זמין');text('summaryText','לא התקבל מחיר תקין לחוזה הזהב. ניסיון נוסף יבוצע בעוד דקה.');text('backgroundText','ללא נתוני הזהב לא נקבעת תמונת מצב.');
  for(const id of ['quotePrice','quoteChange','quoteOpen','quoteHigh','quoteLow','quoteVolume','dayValue','weekValue'])text(id,'—');
  range('day',null,null,null);range('week',null,null,null);$('watchList').innerHTML='<li>מקור מחיר הזהב לא זמין.</li>';
 }else{
  text('quoteContract',g.contract+' · '+g.symbol+' · '+g.exchange);
  for(const [id,key] of [['quotePrice','price'],['quoteOpen','open'],['quoteHigh','high'],['quoteLow','low']])text(id,num(g[key]));
  text('quoteVolume',Number.isFinite(g.volume)?g.volume.toLocaleString('en-US'):'—');
  text('quoteChange',Number.isFinite(g.change)?signed(g.change)+' ('+pct(g.changePercent)+')':'שינוי לא זמין');$('quoteChange').style.color=tone(a.day);
  text('quoteStatus','זמן הציטוט: '+fmt(g.quoteTime)+' · שעון ישראל · לפני '+ago(g.quoteTime)+' דקות'+(a.stale?' · ציטוט ישן; מוצגת התמונה האחרונה':'')+' · יום מסחר: '+g.quoteDate);
  $('quoteStatus').classList.toggle('unavailable',a.stale);
  for(const h of ['day','week']){text(h+'Title',TITLES[h][a[h]]);text(h+'Value',pct(g[h==='day'?'changePercent':'weekPercent']));$(h+'Value').style.color=tone(a[h]);}
  let summary=(a.stale?'לפי הציטוט האחרון, ':'')+(a.day==='up'?'הזהב עולה היום':a.day==='down'?'הזהב יורד היום':a.day==='flat'?'השינוי היומי בזהב קטן':'השינוי היומי אינו זמין')+'. '+(a.week==='up'?'התמונה השבועית חיובית':a.week==='down'?'התמונה השבועית שלילית':a.week==='flat'?'השינוי מתחילת השבוע קטן':'אין בסיס תקין להשוואה שבועית')+'.';
  if(['up','down'].includes(a.day)&&['up','down'].includes(a.week))summary+=' התנועה היום '+(a.day===a.week?'ממשיכה את כיוון השינוי השבועי.':'פועלת נגד כיוון השינוי השבועי.');
  text('summaryText',summary);
  const bg={support:'הנתונים הסמוכים בזמן נוטים לרקע תומך בזהב.',pressure:'הנתונים הסמוכים בזמן נוטים לרקע של לחץ על הזהב.',mixed:'הנתונים הסמוכים בזמן נותנים מסרים סותרים לגבי הרקע לזהב.',unknown:'אין כרגע מספיק נתונים פעילים וסמוכים בזמן כדי לסכם את הרקע לזהב.'};
  text('backgroundText',bg[a.background]+(a.conflict?' תנועת הזהב אינה תואמת את הרקע הזה — סתירה שדורשת תשומת לב.':'')+' זו פרשנות לקשרים בין נכסים, ולא הוכחה לסיבת התנועה או לתנועה הבאה.');
  const watch=[];
  if(a.stale)watch.push('מחיר הזהב בן '+ago(g.quoteTime)+' דקות. הסיכום מתאר תמונה אחרונה, לא מצב חי.');
  if(a.day!==a.week&&['up','down'].includes(a.day)&&['up','down'].includes(a.week))watch.push('יש הבדל בין הכיוון היומי לשבועי. אין להסיק מאחד מהם שהשני השתנה.');
  if(a.conflict)watch.push('יש סתירה בין הזהב לגורמים סביבו. הקשרים בין הנכסים אינם חוק קבוע.');
  const missing=a.factors.filter(f=>!f.comparable).map(f=>({dollar:'הדולר',yield10:'תשואת 10 שנים',silver:'הכסף'}[f.key]));
  if(missing.length)watch.push(missing.join(', ')+' אינם סמוכים מספיק בזמן למחיר הזהב ולכן לא נכללו בפרשנות היומית.');
  if(data.unavailable.length)watch.push('חלק ממקורות השוק לא החזירו נתונים; הפרשנות חלקית.');
  if(a.dayPosition!==null)watch.push(a.dayPosition>80?'המחיר קרוב לחלק העליון של הטווח היומי שנמדד.':a.dayPosition<20?'המחיר קרוב לחלק התחתון של הטווח היומי שנמדד.':'המחיר בתוך הטווח היומי; מיקום זה לבדו אינו אות מסחר.');
  if(!watch.length)watch.push('עקוב אחרי שינוי בכיוון המחיר ובסביבת הדולר והתשואות.');
  $('watchList').innerHTML=watch.map(w=>'<li>'+esc(w)+'</li>').join('');
  range('day',a.dayPosition,g.low,g.high);range('week',a.weekPosition,g.weekLow,g.weekHigh);
 }
 renderDrivers(data);
}
function renderDrivers(data){
 const entries=[['dollar','מדד הדולר','DXY','DX-Y.NYB'],['yield10','תשואת אג״ח','10Y','^TNX'],['silver','חוזה הכסף','SI','SI=F'],['equities','שוק המניות','ES','ES=F']];
 $('driverGrid').innerHTML=entries.map(([key,title,code,symbol])=>{
  const q=data.markets[key],f=data.analysis.factors?.find(x=>x.key===key);
  if(!q)return '<article class="card driver-card"><div class="driver-title"><h3>'+title+'</h3><span dir="ltr">'+code+'</span></div><p class="driver-price">—</p><p class="unavailable">מקור הנתונים לא זמין</p></article>';
  const effect=key==='equities'?'context':f?.effect||'unknown';
  const names={support:'רקע תומך',pressure:'רקע לוחץ',neutral:'שינוי קטן',unknown:'לא נכלל בסיכום',context:'הקשר משני'};
  let explain=key==='equities'?'תנועת המניות מספקת הקשר לסביבת הסיכון; אין ממנה לבדה מסקנה לגבי הזהב.':effect==='unknown'?'הציטוט ישן, אינו סמוך בזמן לזהב, או שחסר שינוי יומי תקין.':key==='dollar'?(effect==='support'?'דולר נחלש עשוי לתמוך בזהב.':effect==='pressure'?'דולר מתחזק עשוי להכביד על הזהב.':'השינוי בדולר קטן ביחס לסף התצוגה.'):key==='yield10'?(effect==='support'?'ירידת תשואה עשויה להפחית את עלות האלטרנטיבה להחזקת זהב.':effect==='pressure'?'עליית תשואה עשויה להגדיל את עלות האלטרנטיבה להחזקת זהב.':'השינוי בתשואה קטן ביחס לסף התצוגה.'):(effect==='support'?'עליית הכסף מספקת הקשר חיובי לתנועת המתכות.':effect==='pressure'?'ירידת הכסף מספקת הקשר חלש לתנועת המתכות.':'השינוי בכסף קטן ביחס לסף התצוגה.');
  const cls=effect==='support'?'sig-pos':effect==='pressure'?'sig-neg':'sig-neutral';
  return '<article class="card driver-card"><div class="driver-title"><h3>'+title+' <small dir="ltr">'+code+'</small></h3></div><p class="driver-price" dir="ltr">'+num(q.price,key==='silver'?3:key==='dollar'?3:2)+(key==='yield10'?'%':'')+'</p><p class="driver-change" dir="ltr" style="color:'+tone(q.changePercent>0?'up':q.changePercent<0?'down':'flat')+'">'+(key==='yield10'?(Number.isFinite(q.change)?signed(q.change*100,1)+' bp':'—'):pct(q.changePercent))+' <span dir="rtl">ביום</span></p><span class="sig '+cls+'">'+names[effect]+'</span><p class="driver-explain">'+explain+'</p><div class="driver-meta">'+esc(q.contract)+'<br>ציטוט: '+fmt(q.quoteTime)+' · לפני '+ago(q.quoteTime)+' דקות'+(ago(q.quoteTime)>45?'<span class="stale-tag">נתון ישן</span>':'')+'<br><a href="https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/" target="_blank" rel="noopener">Yahoo Finance ↗</a></div></article>';
 }).join('');
}
async function refreshMarkets(){if(busy.has('markets'))return;busy.add('markets');try{renderMarkets(await get('/api/markets'));}catch{ text('marketStamp','עדכון השוק נכשל · ניסיון נוסף בעוד דקה');text('quoteStatus',lastMarkets?'העדכון נכשל — מוצגים נתונים מהבדיקה האחרונה. בדוק את זמן הציטוט.':'לא התקבלו נתונים עדכניים. ניסיון נוסף בעוד דקה.');$('quoteStatus').classList.add('unavailable');text('backgroundText','העדכון נכשל. אין פרשנות חדשה למצב השוק.');}finally{busy.delete('markets');}}
function eventInfo(title){
 const defs=[[/Core PCE/,'מדד PCE ליבה','מדד אינפלציה מרכזי לציפיות הריבית. השפעתו תלויה בהפתעה מול הצפי ובתגובת השוק.'],[/PCE/,'מדד מחירי PCE','פרסום אינפלציה שעשוי לשנות את ציפיות הריבית.'],[/Core CPI/,'מדד מחירים לצרכן — ליבה','אינפלציה ללא מזון ואנרגיה; עקוב אחרי הפער מול הצפי.'],[/CPI/,'מדד המחירים לצרכן','נתון אינפלציה שעשוי להשפיע על הדולר, התשואות והזהב.'],[/Non-Farm|Nonfarm/,'דוח תעסוקה — NFP','נתוני התעסוקה עשויים לשנות את ציפיות הריבית ואת תנודתיות הזהב.'],[/Unemployment Rate/,'שיעור האבטלה','נתון על מצב שוק העבודה; יש לקרוא אותו לצד יתר דוח התעסוקה.'],[/Unemployment Claims/,'תביעות אבטלה','נתון שבועי על שוק העבודה, שעשוי להשפיע על ציפיות הריבית.'],[/Federal Funds Rate/,'החלטת ריבית הפד','ההחלטה, ההודעה והמסר הנלווה עשויים להזיז את הדולר והתשואות.'],[/FOMC Press Conference/,'מסיבת העיתונאים של הפד','המסר לגבי מדיניות הריבית עשוי לשנות את תגובת השוק.'],[/FOMC Economic Projections/,'תחזיות כלכליות של הפד','תחזיות הריבית והכלכלה עשויות לשנות את ציפיות השוק.'],[/FOMC Statement/,'הודעת הפד','הניסוח לגבי אינפלציה, תעסוקה וריבית עשוי להיות משמעותי לזהב.'],[/FOMC.*Minutes/,'פרוטוקול הפד','פרטים על עמדות חברי הוועדה מספקים הקשר לציפיות הריבית.'],[/FOMC.*Speaks|Fed.*Speaks/,'נאום חבר/ת הפד','התבטאויות על הריבית והאינפלציה עשויות לשנות את ציפיות השוק.'],[/Core Retail Sales/,'מכירות קמעונאיות — ליבה','נתון צריכה שעשוי להשפיע על הערכת חוזק הכלכלה.'],[/Retail Sales/,'מכירות קמעונאיות','נתוני צריכה מספקים הקשר לצמיחה ולמדיניות הריבית.'],[/Core PPI/,'מדד מחירים ליצרן — ליבה','נתון על לחצי מחירים אצל היצרנים.'],[/PPI/,'מדד המחירים ליצרן','לחצי מחירים עשויים להשפיע על ציפיות האינפלציה.'],[/Philly Fed/,'מדד הייצור של פילדלפיה','נתון פעילות תעשייתית שעשוי לשנות את הערכת מצב הכלכלה.'],[/Empire State/,'מדד הייצור של ניו יורק','אינדיקציה לפעילות התעשייתית.'],[/GDP/,'נתוני צמיחה — תמ״ג','נתון צמיחה שעשוי להשפיע על הדולר וציפיות הריבית.'],[/Building Permits/,'היתרי בנייה','נתון פעילות בשוק הדיור.'],[/Housing Starts/,'התחלות בנייה','נתון על מצב שוק הדיור הרגיש לריבית.'],[/Industrial Production/,'ייצור תעשייתי','נתון פעילות בכלכלה הריאלית.'],[/Capacity Utilization/,'ניצולת כושר הייצור','נתון משני על הפעילות התעשייתית.'],[/Import Prices/,'מחירי ייבוא','נתון משני על לחצי מחירים.'],[/Natural Gas Storage/,'מלאי גז טבעי','נתון אנרגיה; רלוונטיות ישירה נמוכה יותר לזהב.'],[/Crude Oil Inventories/,'מלאי נפט','נתון אנרגיה שעשוי לספק הקשר למחירי הנפט.'],[/Leading Index/,'מדד האינדיקטורים המובילים','נתון רקע לפעילות הכלכלית.'],[/PMI/,'מדד מנהלי הרכש','נתון פעילות שעשוי להשפיע על הערכת הצמיחה.'],[/Consumer Sentiment|Consumer Confidence/,'סנטימנט / אמון הצרכנים','נתון על ציפיות הצרכנים שעשוי לספק הקשר לכלכלה.']];
 for(const [re,he,why] of defs)if(re.test(title))return {he,why};return {he:'פרסום כלכלי בארה״ב',why:'יש לקרוא את הפרסום המקורי ואת תגובת השוק לפני שמסיקים השפעה על הזהב.'};
}
const impact=e=>({High:'גבוהה',Medium:'בינונית',Low:'נמוכה',Unknown:'לא צוין'}[e.impact]||'לא צוין');
const chip=e=>{const color={Low:'low',Medium:'medium',High:'high'}[e.impact];return '<span class="sig event-impact">'+(color?'<span class="impact-dot impact-'+color+'" aria-hidden="true"></span>':'')+impact(e)+'</span>';};
function selectCalendarEvents(events,filter,sort){
 const rank={Low:1,Medium:2,High:3};
 return events.filter(e=>filter==='all'||e.impact===filter).sort((a,b)=>{
  if(sort==='time')return new Date(a.date)-new Date(b.date);
  const ra=rank[a.impact],rb=rank[b.impact];
  if(ra===undefined&&rb!==undefined)return 1;
  if(rb===undefined&&ra!==undefined)return -1;
  return ((ra||0)-(rb||0))*(sort==='impactDesc'?-1:1)||new Date(a.date)-new Date(b.date);
 });
}
function important(e){return ['High','Medium'].includes(e.impact)||/FOMC|Fed.*Speaks/.test(e.title);}
function next(){const e=calendarData?.events.find(e=>important(e)&&new Date(e.date)>Date.now());nextEvent=e||null;
 if(!e){$('nextEventBox').innerHTML='<p class="event-description">אין אירוע עתידי משמעותי ברשימת המקור הנוכחית. הדבר אינו מעיד שאין סיכונים או חדשות בלתי צפויות.</p>';return;}
 const i=eventInfo(e.title);$('nextEventBox').innerHTML=(calendarData.stale?'<p class="small-note unavailable">לוח שמור — לא התקבל אימות חדש למועד האירוע.</p>':'')+chip(e)+'<h3 class="event-title">'+esc(i.he)+'</h3><span class="small-note" dir="ltr">'+esc(e.title)+'</span><p class="event-time">'+fmt(e.date)+'</p><div class="forecast-mini"><div><small>צפי</small><strong dir="ltr">'+esc(e.forecast||'לא מסופק')+'</strong></div><div><small>קודם</small><strong dir="ltr">'+esc(e.previous||'לא מסופק')+'</strong></div></div><p class="event-description">'+esc(i.why)+'</p><div class="countdown"><div class="num mono" id="eventCountdown" dir="ltr">—</div><p class="lbl" id="countdownLabel">עד המועד המתוכנן</p></div><p class="small-note">השפעה צפויה לפי המקור; לא דירוג סיכון כולל למסחר.</p>';tickCountdown();
}
function tickCountdown(){if(!nextEvent||!$('eventCountdown'))return;const s=Math.floor((new Date(nextEvent.date)-Date.now())/1000);if(s<=0){next();renderCalendar();return;}const days=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),sec=s%60;const pad=n=>String(n).padStart(2,'0');text('eventCountdown',(days?days+'d ':'')+pad(h)+':'+pad(m)+':'+pad(sec));text('countdownLabel',s<1800?'אירוע מתקרב — תנודתיות עשויה להשתנות':'עד המועד המתוכנן');}
function renderCalendar(){
 if(!calendarData)return;
 const today=dateKey(),todayDate=new Date(today+'T12:00:00Z'),day=todayDate.getUTCDay();todayDate.setUTCDate(todayDate.getUTCDate()-(day===0?6:day-1));const monday=todayDate.toISOString().slice(0,10),end=new Date(todayDate);end.setUTCDate(end.getUTCDate()+7);const endKey=end.toISOString().slice(0,10);
 const weekEvents=calendarData.events.filter(e=>dateKey(e.date)>=monday&&dateKey(e.date)<endKey);
 const periodEvents=period==='today'?weekEvents.filter(e=>dateKey(e.date)===today):weekEvents;
 const items=selectCalendarEvents(periodEvents,impactFilter,impactSort);
 text('calendarCount',items.length+' מתוך '+periodEvents.length+' אירועים');
 if(!weekEvents.length){$('calendarBody').innerHTML='<tr><td colspan="6">המקור אינו מציג אירועים לשבוע הנוכחי. אין להסיק מכך שהשבוע רגוע.</td></tr>';return;}
 $('calendarBody').innerHTML=items.length?items.map(e=>{const info=eventInfo(e.title),elapsed=new Date(e.date)<=Date.now();return '<tr><td>'+fmt(e.date)+(elapsed?'<span class="en">המועד עבר</span>':'')+'</td><td><strong>'+esc(info.he)+'</strong><span class="en" dir="ltr">'+esc(e.title)+'</span></td><td>'+chip(e)+'</td><td dir="ltr">'+esc(e.forecast||'—')+'</td><td dir="ltr">'+esc(e.previous||'—')+'</td><td>'+esc(e.actual??'לא מסופק')+'</td></tr>';}).join(''):'<tr><td colspan="6">'+(periodEvents.length?'לא נמצאו אירועים ברמת ההשפעה שנבחרה. אפשר לבחור כל הרמות.':'לא מופיעים אירועים אמריקאיים להיום במקור הנוכחי.')+'</td></tr>';
}
async function refreshCalendar(){if(busy.has('calendar'))return;busy.add('calendar');try{calendarData=await get('/api/calendar');text('calendarStamp',calendarData.source+' · שליפה אחרונה: '+fmt(calendarData.fetchedAt)+(calendarData.stale?' · '+calendarData.notice:''));$('calendarStamp').classList.toggle('unavailable',calendarData.stale);renderCalendar();next();}catch{text('calendarStamp','מקור היומן לא זמין · אין רשימה חדשה');if(!calendarData){$('calendarBody').innerHTML='<tr><td colspan="6">לא התקבל יומן עדכני. אין להסיק מכך שאין אירועים.</td></tr>';text('nextEventBox','יומן האירועים אינו זמין כרגע.');}}finally{busy.delete('calendar');}}
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{period=b.dataset.period;document.querySelectorAll('[data-period]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderCalendar();}));
document.querySelectorAll('[data-impact]').forEach(b=>b.addEventListener('click',()=>{impactFilter=b.dataset.impact;document.querySelectorAll('[data-impact]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderCalendar();}));
$('impactSort').addEventListener('change',e=>{impactSort=e.target.value;renderCalendar();});
async function refreshNews(){if(busy.has('news'))return;busy.add('news');try{const data=await get('/api/news');text('newsStamp',data.stale?data.notice+' · שליפה עברית אחרונה: '+fmt(data.fetchedAt):'בדיקת מקור: '+fmt(data.fetchedAt));$('newsStamp').classList.toggle('unavailable',data.stale);$('newsGrid').innerHTML=data.items.length?data.items.map(n=>'<article class="card news-card"><span class="news-source">'+esc(n.source)+'</span><h3><a href="'+esc(n.url)+'" target="_blank" rel="noopener">'+esc(n.title)+' ↗</a></h3><span class="news-time">פורסם: '+fmt(n.publishedAt)+' · שעון ישראל</span></article>').join(''):'<div class="card">לא נמצאו כותרות עדכניות במקור. אין בכך קביעה שלא התרחשו אירועים.</div>';}catch{text('newsStamp','עדכון החדשות נכשל');if(!$('newsGrid').querySelector('article'))$('newsGrid').innerHTML='<div class="card">מקור החדשות אינו זמין כרגע. ניסיון נוסף יבוצע אוטומטית.</div>';}finally{busy.delete('news');}}
async function refreshYields(){if(busy.has('yields'))return;busy.add('yields');try{const data=await get('/api/yields');$('yieldGrid').innerHTML=data.items.length?data.items.map(q=>'<article class="card yield-card"><div><h4>'+(q.series==='DGS2'?'תשואת אג״ח לשנתיים':'תשואה ריאלית · 10 שנים')+'</h4><p>יום מדידה: '+esc(q.date)+'<br>שינוי מהמדידה הקודמת: <b dir="ltr">'+(Number.isFinite(q.changeBps)?signed(q.changeBps,1)+' bp':'—')+'</b></p><a href="'+esc(q.url)+'" target="_blank" rel="noopener">'+esc(q.source)+' · '+esc(q.series)+' ↗</a></div><strong dir="ltr">'+num(q.value)+'%</strong></article>').join(''):'<div class="card">נתוני התשואות היומיים אינם זמינים כרגע.</div>';if(data.unavailable.length)$('yieldGrid').insertAdjacentHTML('beforeend','<p class="small-note unavailable">חסר מקור: '+esc(data.unavailable.join(', '))+'</p>');}catch{$('yieldGrid').innerHTML='<div class="card">מקור התשואות היומיות אינו זמין כרגע.</div>';}finally{busy.delete('yields');}}
async function refreshAll(){const button=$('refreshAll');button.disabled=true;try{await Promise.allSettled([refreshMarkets(),refreshCalendar(),refreshNews(),refreshYields()]);}finally{button.disabled=false;}}
$('refreshAll').addEventListener('click',refreshAll);refreshAll();
setInterval(()=>{if(!document.hidden)refreshMarkets();},60000);
setInterval(()=>{if(!document.hidden)refreshCalendar();},600000);
setInterval(()=>{if(!document.hidden)refreshNews();},900000);
setInterval(()=>{if(!document.hidden)refreshYields();},3600000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAll();});
})();
