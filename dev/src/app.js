(function(){
'use strict';

/* ================= helpers ================= */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAY=864e5, K=-1, Q=-2, INT=[0,1,3,7,14,30,60], KEY='words3000:v1';
const plural=(n,f)=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?f[2]:b>1&&b<5?f[1]:b===1?f[0]:f[2]};
const nWords=n=>n+' '+plural(n,['слово','слова','слов']);
const nDays=n=>n+' '+plural(n,['день','дня','дней']);
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function dayNum(d){d=d||new Date();return Math.round(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/DAY)}
function dayDate(n){const d=new Date(n*DAY);return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}
// сутки начинаются в 4 утра по местным часам: занятие после полуночи относится к прошедшему дню
const today=()=>{const d=new Date();d.setHours(d.getHours()-4);return dayNum(d)};
const fmtDate=(n,o)=>dayDate(n).toLocaleDateString('ru-RU',o||{day:'numeric',month:'long'});

const ICON={
 today:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="m9 15 2 2 4-4"/>',
 book:'<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
 chart:'<path d="M5 20v-8M12 20V4M19 20v-5"/>',
 sliders:'<path d="M4 7h8M18 7h2M4 17h2M12 17h8"/><circle cx="15" cy="7" r="2.5"/><circle cx="9" cy="17" r="2.5"/>',
 sound:'<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 flame:'<path d="M12 3c.6 3.6 5 5.4 5 10.4a5 5 0 0 1-10 0c0-2 .9-3.5 2-4.6.3 1.5 1 2.4 2 2.6-.6-3 0-5.9 1-8.4z"/>',
 undo:'<path d="M8 5 4 9l4 4"/><path d="M4 9h10a5 5 0 0 1 0 10h-3"/>',
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 chev:'<path d="m9 6 6 6-6 6"/>',
 eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
 layers:'<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 13 8.5 4.5 8.5-4.5"/>',
 repeat:'<path d="M17 3.5 20.5 7 17 10.5"/><path d="M3.5 12v-2a3 3 0 0 1 3-3h14"/><path d="M7 20.5 3.5 17 7 13.5"/><path d="M20.5 12v2a3 3 0 0 1-3 3h-14"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.6v.4"/>',
 down:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', up:'<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>'
};
const ic=(n,c)=>`<svg class="ic ${c||''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

/* ================= words ================= */
const CAP=new Set('january february april june july august september october november december monday tuesday wednesday thursday friday saturday sunday christmas english british american european french german russian chinese japanese'.split(' '));
const UP={i:'I',ok:'OK',tv:'TV',cd:'CD',dvd:'DVD'};
const ALT=Object.assign(Object.create(null),{analyse:'analyze',behaviour:'behavior',centre:'center',colour:'color',coloured:'colored',defence:'defense',dialogue:'dialog',favour:'favor',favourite:'favorite',honour:'honor',humour:'humor',kilometre:'kilometer',labour:'labor',licence:'license',metre:'meter',neighbour:'neighbor',neighbourhood:'neighborhood',offence:'offense',practise:'practice',programme:'program',jewellery:'jewelry',grey:'gray',ok:'okay',theatre:'theater',litre:'liter'});
const HOMO=['to too two','there their','right write','here hear','see sea','son sun','for four','by buy bye','know no','new knew','one won','our hour','week weak','meet meat','piece peace','whole hole','wait weight','way weigh','road rode','sale sail','tail tale','wear where','whether weather','which witch','flower flour','male mail','plane plain','break brake','steel steal','role roll','sight site','some sum','would wood','threw through','bare bear','fair fare','pair pear','pray prey','rain reign','red read','scene seen','soul sole','stair stare','waste waist','die dye','eye i','heal heel','lessen lesson','night knight','not knot','poor pour','root route','sew so','cell sell','cent sent scent','dear deer','board bored','allowed aloud','past passed','principal principle','hi high','be bee','in inn','its it\'s','than then','accept except','affect effect','quite quiet'];
const W=WORDS.split('\n').map((l,i)=>{const k=l.indexOf('|');return[l.slice(0,k),l.slice(k+1)]}).map((r,i)=>({i,en:r[0],ru:r[1],show:UP[r[0]]||(CAP.has(r[0])?r[0][0].toUpperCase()+r[0].slice(1):r[0])}));
const byEn=Object.create(null); W.forEach(w=>byEn[w.en]=w);
const homo=Object.create(null);
HOMO.forEach(g=>{const a=g.split(' ');a.forEach(x=>{(homo[x]=homo[x]||new Set());a.forEach(y=>homo[x].add(y))})});

/* ================= state & storage ================= */
function fresh(){return{v:1,set:{perDay:10,typing:true,audio:true,autoSpeak:true,theme:'auto',voice:'',rate:0.9},p:Object.create(null),tr:Object.create(null),hist:Object.create(null),extra:null,started:false,first:0,backup:0}}
const int=(x,lo,hi)=>{x=Math.round(+x);return Number.isFinite(x)?Math.min(hi,Math.max(lo,x)):lo};
function sanitize(d){
  const s=fresh(); if(!d||typeof d!=='object') return s;
  const st=d.set||{};
  if(Number.isFinite(+st.perDay)) s.set.perDay=Math.min(50,Math.max(1,Math.round(+st.perDay)));
  ['typing','audio','autoSpeak'].forEach(k=>{if(typeof st[k]==='boolean')s.set[k]=st[k]});
  if(['auto','light','dark'].includes(st.theme)) s.set.theme=st.theme;
  if(typeof st.voice==='string') s.set.voice=st.voice.slice(0,200);
  if(Number.isFinite(+st.rate)) s.set.rate=Math.min(1.2,Math.max(.5,+st.rate));
  if(d.p&&typeof d.p==='object') for(const k in d.p){const v=d.p[k]; if(byEn[k]&&Array.isArray(v)&&Number.isFinite(+v[0])){const a=Math.round(+v[0]); if(a>=-2&&a<=7) s.p[k]=[a,int(v[1],0,1e6),int(v[2],0,1e6),int(v[3],0,1e6)]}}
  if(d.tr&&typeof d.tr==='object') for(const k in d.tr){if(byEn[k]&&typeof d.tr[k]==='string'&&d.tr[k].trim()) s.tr[k]=d.tr[k].trim().slice(0,200)}
  if(d.hist&&typeof d.hist==='object') for(const k in d.hist){const v=d.hist[k]; if(/^\d{1,6}$/.test(k)&&Array.isArray(v)) s.hist[+k]=[0,1,2,3,4].map(i=>int(v[i],0,1e6))}
  if(Array.isArray(d.extra)&&Number.isFinite(+d.extra[0])) s.extra=[int(d.extra[0],0,1e6),int(d.extra[1],0,1000)];
  s.first=int(d.first,0,1e6);s.backup=int(d.backup,0,1e6);
  s.started=!!d.started||Object.keys(s.p).length>0;
  return s;
}
const store=(function(){
  let ok=true;
  try{const k='__w3k_test';window.localStorage.setItem(k,'1');window.localStorage.removeItem(k)}catch(e){ok=false}
  return{
    ok,
    load(){if(!ok)return fresh();try{const t=window.localStorage.getItem(KEY);return t?sanitize(JSON.parse(t)):fresh()}catch(e){return fresh()}},
    save(s){if(!ok)return;try{window.localStorage.setItem(KEY,JSON.stringify(s))}catch(e){if(!store.warned){store.warned=true;toast('Не удалось сохранить прогресс: хранилище браузера переполнено или закрыто')}}}
  };
})();
let S=store.load();
const save=()=>store.save(S);
const st=w=>{const p=S.p[w.en];return p?p[0]:null};
const tr=w=>S.tr[w.en]||w.ru;
const hist=d=>S.hist[d]||(S.hist[d]=[0,0,0,0,0]);

function applyTheme(){
  const t=S.set.theme==='auto'?(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):S.set.theme;
  document.documentElement.dataset.theme=t;
  const m=$('meta[name=theme-color]'); if(m) m.content=t==='dark'?'#121412':'#F5F3EE';
}
if(window.matchMedia){const mq=matchMedia('(prefers-color-scheme: dark)');const f=()=>applyTheme();mq.addEventListener?mq.addEventListener('change',f):mq.addListener&&mq.addListener(f)}

/* ================= meanings / distractors ================= */
const mcache=Object.create(null);
function meanings(w){
  const t=tr(w); let c=mcache[w.en];
  if(!c||c.t!==t){
    const m=t.toLowerCase().replace(/ё/g,'е').replace(/\([^)]*\)/g,'').split(/[,;]/).map(s=>s.trim()).filter(Boolean);
    const first=(m[0]||'').split(' ')[0];
    const kind=/(ть|ться|чь|чься|ти|тись)$/.test(first)?'v':/(ый|ий|ой)$/.test(first)?'a':'o';
    c=mcache[w.en]={t,m,kind};
  }
  return c;
}
function conflict(a,b){const x=meanings(a).m,y=meanings(b).m;return x.some(v=>y.includes(v))}
function distract(w,n,noHomo){
  const kind=meanings(w).kind, hs=noHomo&&homo[w.en];
  const okW=v=>v!==w&&!conflict(v,w)&&!(hs&&hs.has(v.en));
  const res=[];
  const take=(pool,sameKind)=>{for(const v of shuffle(pool)){if(res.length>=n)break;if(res.includes(v)||!okW(v))continue;if(sameKind&&meanings(v).kind!==kind)continue;if(res.some(r=>conflict(r,v)))continue;res.push(v)}};
  const near=W.slice(Math.max(0,w.i-150),w.i+150);
  take(near,true); if(res.length<n)take(near,false); if(res.length<n)take(W,false);
  return res;
}
const norm=s=>String(s).trim().toLowerCase().replace(/[’‘`]/g,"'").replace(/\s+/g,' ');
function variants(w){const v=[w.en];if(ALT[w.en])v.push(ALT[w.en]);const z=w.en.replace(/iz(e|es|ed|ing|ation)$/,'is$1');if(z!==w.en)v.push(z);return v}
function lev(a,b){ // расстояние Дамерау — Левенштейна: перестановка соседних букв считается одной ошибкой
  const m=a.length,n=b.length;if(Math.abs(m-n)>2)return 3;
  const d=[];for(let i=0;i<=m;i++){d[i]=[i];for(let j=1;j<=n;j++)d[i][j]=i?0:j}
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[m][n];
}
const flat=x=>x.replace(/[\s-]+/g,'');
function checkTyped(w,val){
  const a=norm(val); if(!a) return 'empty';
  if(variants(w).includes(a)||ALT[a]===w.en||(w.en.includes('-')&&flat(a)===flat(w.en))) return 'ok';
  const o=byEn[a]; if(o&&o!==w&&conflict(o,w)) return 'syn';
  const d=lev(a,w.en); if(w.en.length>=4&&d===1) return 'near';
  return 'bad';
}
const ambiguous=w=>W.some(v=>v!==w&&conflict(v,w));

/* ================= speech ================= */
const tts={ok:typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance!=='undefined',voices:[],dead:false,u:null};
function loadVoices(){if(!tts.ok)return;try{tts.voices=speechSynthesis.getVoices().filter(v=>/^en([-_]|$)/i.test(v.lang))}catch(e){tts.voices=[]}}
if(tts.ok){loadVoices();try{speechSynthesis.addEventListener('voiceschanged',()=>{loadVoices();if(view==='settings')render()})}catch(e){}}
function pickVoice(){
  if(!tts.voices.length) return null;
  if(S.set.voice){const v=tts.voices.find(v=>v.name===S.set.voice);if(v)return v}
  const pref=[/Google US English/i,/Samantha/i,/Microsoft (Aria|Jenny|Zira)/i,/Google UK English Female/i];
  for(const r of pref){const v=tts.voices.find(v=>r.test(v.name));if(v)return v}
  return tts.voices.find(v=>/en[-_]US/i.test(v.lang))||tts.voices.find(v=>/en[-_]GB/i.test(v.lang))||tts.voices[0];
}
const TTS_FATAL=['synthesis-unavailable','synthesis-failed','language-unavailable','voice-unavailable','audio-hardware'];
let ttsWait=4000, utterSeq=0;
// задание на слух без звука решить нельзя: превращаем его в обычный выбор перевода
function listenFallback(msg){if(view!=='session'||!cur||cur.answered||cur.task.t!=='listen')return;cur.task.t='er';showTask();guardUntil=0;if(msg)toast(msg)}
// Озвучка не сработала (ошибка синтеза или тишина дольше нескольких секунд): до перезагрузки страницы
// или удачной проверки голоса задания на слух заменяются выбором перевода.
function ttsFailed(){if(tts.dead)return;tts.dead=true;listenFallback('Озвучка на этом устройстве не работает — задания на слух заменены выбором перевода');if(view==='settings'||view==='practice')render()}
function speak(text,slow){
  if(!tts.ok) return;
  try{
    const sy=window.speechSynthesis;if(sy.speaking||sy.pending)sy.cancel();if(sy.paused)sy.resume();
    const u=new SpeechSynthesisUtterance(text),v=pickVoice(),id=++utterSeq;let heard=false;
    if(v){u.voice=v;u.lang=v.lang}else u.lang='en-US';
    u.rate=slow?0.55:S.set.rate;
    u.onstart=()=>{heard=true;if(tts.dead){tts.dead=false;if(view==='settings'||view==='practice')render()}};
    u.onend=()=>{heard=true};
    u.onerror=e=>{heard=true;if(id===utterSeq&&TTS_FATAL.includes(e&&e.error))ttsFailed()};
    tts.u=u; // ссылка нужна, чтобы браузер не удалил фразу до событий
    sy.speak(u);
    setTimeout(()=>{if(!heard&&id===utterSeq&&!document.hidden)ttsFailed()},ttsWait);
  }catch(e){}
}
const audioOn=()=>tts.ok&&!tts.dead&&S.set.audio;

/* ================= scheduling ================= */
function counts(){
  const c={unseen:0,known:0,queued:0,inLesson:0,learning:0,mastered:0,due:0},t=today();
  for(const w of W){const p=S.p[w.en]; if(!p){c.unseen++;continue} const s=p[0];
    if(s===K)c.known++; else if(s===Q)c.queued++; else if(s===0)c.inLesson++; else if(s===7)c.mastered++; else{c.learning++; if(p[1]<=t)c.due++}}
  return c;
}
function dueWords(){const t=today();return W.filter(w=>{const p=S.p[w.en];return p&&p[0]>=1&&p[0]<=6&&p[1]<=t}).sort((a,b)=>S.p[a.en][1]-S.p[b.en][1]||a.i-b.i)}
function plan(){
  const t=today(),h=S.hist[t]||[0,0,0,0,0],extra=S.extra&&S.extra[0]===t?S.extra[1]:0;
  const goal=S.set.perDay+extra,in0=W.filter(w=>st(w)===0),c=counts();
  const avail=c.unseen+c.queued+in0.length;
  const left=Math.min(Math.max(0,goal-h[0]),avail);
  return{goal,learned:h[0],in0,need:Math.max(0,goal-h[0]-in0.length),left,avail,c};
}
const active=d=>{const h=S.hist[d];return !!h&&(h[0]+h[1]+(h[4]||0))>0};
function streak(){let t=today(),n=0;if(!active(t))t--;while(active(t)){n++;t--}return n}
function bestStreak(){const ds=Object.keys(S.hist).map(Number).filter(active).sort((a,b)=>a-b);let best=0,run=0,prev=null;for(const d of ds){run=prev!==null&&d===prev+1?run+1:1;best=Math.max(best,run);prev=d}return best}
function reviewType(stage){if(stage<=1)return'er';if(stage===2)return're';if(stage===3)return audioOn()?'listen':'re';return S.set.typing?'type':'re'}

/* ================= view state ================= */
let view='home', ses=null, cur=null, timer=null, sortS=null, sum=null;
// Защита от двойного нажатия: после смены экрана или задания кнопки на долю секунды не реагируют,
// иначе второе касание попадает в кнопку, оказавшуюся на том же месте.
let guardMs=300, guardUntil=0, shownDay=0;
const arm=()=>{guardUntil=performance.now()+guardMs};
const dict={q:'',f:'all',limit:80};
const prac={src:'learning',mode:'mix',n:20};
const app=$('#app');

function go(v){view=v;ses=null;cur=null;clearTimeout(timer);render();window.scrollTo(0,0)}
function render(){
  applyTheme();shownDay=today();
  if(view==='session'){return}
  if(view==='sort'){app.innerHTML=sortHTML();bindSwipe();return}
  if(view==='summary'){app.innerHTML=summaryHTML();return}
  if(view==='practice'){app.innerHTML=shell('home',practiceHTML());return}
  const body=view==='dict'?dictHTML():view==='stats'?statsHTML():view==='settings'?settingsHTML():homeHTML();
  app.innerHTML=shell(view,body);
}
const TABS=[['home','Сегодня','today'],['dict','Словарь','book'],['stats','Статистика','chart'],['settings','Настройки','sliders']];
function shell(cur,body){
  const tabs=TABS.map(([id,l,i])=>`<button class="tab" data-act="nav" data-v="${id}" ${cur===id?'aria-current="page"':''}>${ic(i)}<span>${l}</span></button>`).join('');
  return `<header class="top"><div class="top-in"><div class="brand">3000 <i>слов</i></div><nav class="tabs" aria-label="Разделы">${tabs}</nav></div></header>
<main class="page">${body}</main><nav class="tabbar" aria-label="Разделы">${tabs}</nav>`;
}
function toast(msg){const r=$('#toast-root');r.innerHTML=`<div class="toast">${esc(msg)}</div>`;clearTimeout(toast.t);toast.t=setTimeout(()=>{r.innerHTML=''},Math.max(2600,msg.length*65))}

/* ================= home ================= */
function storageNotice(){return store.ok?'':`<div class="notice">${ic('info')}<div><b>Прогресс здесь не сохранится.</b> Так бывает в окне предпросмотра и при открытии файла во встроенном просмотрщике. Скачайте файл и откройте его в браузере.</div></div>`}
function backupNotice(c){
  const t=today(),n=c.learning+c.mastered;
  if(!store.ok||n<30||t-(S.backup||S.first||t)<14)return '';
  return `<div class="notice">${ic('info')}<div><b>Сделайте копию прогресса.</b> ${nWords(n)} хранятся только в этом браузере — если очистить его данные, они пропадут.<div class="btn-row" style="margin-top:10px"><button class="btn sm primary" data-act="export">Сохранить копию</button><button class="btn sm" data-act="backup-later">Позже</button></div></div></div>`;
}
function perDaySeg(){return `<div class="seg" role="group" aria-label="Новых слов в день">${[5,10,15,20].map(n=>`<button data-act="perday" data-n="${n}" aria-pressed="${S.set.perDay===n}">${n}</button>`).join('')}</div>`}
function homeHTML(){
  const t=today(),pl=plan(),c=pl.c,sk=streak();
  const head=`<div class="page-head"><div><p class="eyebrow">${esc(new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'}))}</p><h1>Сегодня</h1></div>
   <div class="streak ${sk?'':'off'}" title="Дней подряд с занятиями">${ic('flame')}<span>${sk?nDays(sk)+' подряд':'Серия: 0'}</span></div></div>`;
  if(!S.started){
    return head+storageNotice()+`<section class="card">
      <h2 style="font-size:21px;margin-bottom:0">3000 частых слов — понемногу каждый день</h2>
      <ol class="steps">
        <li><div><b>Отбор</b><span>Отмечаете знакомые слова — в уроки они не попадут.</span></div></li>
        <li><div><b>Урок</b><span>Карточка, выбор перевода, задание на слух, ввод с клавиатуры.</span></div></li>
        <li><div><b>Повторение</b><span>Слово возвращается через 1, 3, 7, 14, 30 и 60 дней.</span></div></li>
      </ol>
      <div class="field-row"><b>Новых слов в день</b>${perDaySeg()}</div>
      <button class="btn primary big" data-act="first-start">Начать ${ic('arrow')}</button>
      <div class="center" style="margin-top:10px"><button class="link" data-act="import">У меня уже есть сохранённый прогресс</button></div>
    </section>`;
  }
  const due=c.due, left=pl.left;
  let planCard;
  if(!due&&!left){
    const more=pl.avail>0;
    planCard=`<section class="card"><div class="alldone"><span class="plan-ic">${ic('check')}</span><div><b>На сегодня всё</b><span class="muted">${pl.learned?`Выучено ${nWords(pl.learned)}. `:''}${nextDueText()}</span></div></div>
      ${more?`<button class="btn block" data-act="more">${ic('plus')}Выучить ещё 5 слов</button>`:`<p class="muted small">Все слова списка разобраны.</p>`}</section>`;
  }else{
    const inProg=pl.in0.length>0||pl.learned>0||(S.hist[t]&&S.hist[t][1]>0);
    planCard=`<section class="card"><h2>План на сегодня</h2><ul class="plan-list">
      <li class="plan-row ${due?'':'done'}"><span class="plan-ic">${ic(due?'clock':'check')}</span><div class="plan-txt"><b>Повторение</b><span>${due?'Слова, которым пришёл срок':c.learning?'Всё повторено':'Пока нечего повторять'}</span></div><div class="plan-n">${due||'—'}</div></li>
      <li class="plan-row ${left?'':'done'}"><span class="plan-ic">${ic(left?'plus':'check')}</span><div class="plan-txt"><b>Новые слова</b><span>${left?(pl.in0.length?'Урок начат — можно продолжить':'Отбор и урок'):'Норма выполнена'}</span></div><div class="plan-n">${pl.learned}<small> из ${pl.goal}</small></div></li>
    </ul>
    <button class="btn primary big" data-act="lesson">${inProg?'Продолжить':'Начать занятие'} ${ic('arrow')}</button>
    ${due&&left?`<div class="plan-foot"><button class="link" data-act="new">Сразу к новым словам</button></div>`:''}</section>`;
  }
  const knownTotal=c.known+c.mastered, seg=(n,cl)=>n?`<i class="${cl}" style="flex:${n}"></i>`:'';
  const rest=c.unseen+c.queued+c.inLesson;
  const progress=`<section class="card"><h2>Прогресс</h2>
    <div class="bignum"><b>${knownTotal}</b><span>из ${W.length} слов вы знаете</span></div>
    <div class="bar" role="img" aria-label="Выучено ${c.mastered}, в изучении ${c.learning}, уже знали ${c.known}, осталось ${rest}">${seg(c.mastered,'seg-m')}${seg(c.learning,'seg-l')}${seg(c.known,'seg-k')}${seg(rest,'')}</div>
    <div class="legend"><div><i class="seg-m"></i>Выучено<b>${c.mastered}</b></div><div><i class="seg-l"></i>В изучении<b>${c.learning}</b></div><div><i class="seg-k"></i>Уже знали<b>${c.known}</b></div><div><i class="seg-r"></i>Впереди<b>${rest}</b></div></div></section>`;
  const tiles=`<div class="tiles">
    <button class="tile" data-act="sort"><span class="plan-ic">${ic('layers')}</span><span><b>Сортировка слов</b><span>${c.unseen?`Отметьте знакомые заранее · в очереди ${c.queued}`:'Все слова разобраны'}</span></span>${ic('chev','go')}</button>
    <button class="tile" data-act="nav" data-v="practice"><span class="plan-ic">${ic('repeat')}</span><span><b>Свободная тренировка</b><span>Любое упражнение, без влияния на расписание</span></span>${ic('chev','go')}</button>
  </div>`;
  return head+storageNotice()+backupNotice(c)+planCard+progress+tiles;
}
function nextDueText(){
  const t=today();let min=Infinity,n=0;
  for(const w of W){const p=S.p[w.en];if(p&&p[0]>=1&&p[0]<=6){if(p[1]<min){min=p[1];n=1}else if(p[1]===min)n++}}
  if(min===Infinity) return 'Повторений пока нет.';
  const d=min-t;return `Следующее повторение — ${d<=1?'завтра':'через '+nDays(d)} (${nWords(n)}).`;
}

/* ================= lesson orchestration ================= */
function startLesson(){if(dueWords().length)return startReview();startNew()}
function startReview(){
  const due=dueWords().slice(0,40);
  if(!due.length){toast('Сейчас нечего повторять');return go('home')}
  startSession('review',shuffle(due.map(w=>({w,t:reviewType(S.p[w.en][0])}))));
}
function startNew(){
  const t=today(),pl=plan();let need=pl.need;
  if(need>0){const q=W.filter(w=>st(w)===Q).slice(0,need);q.forEach(w=>{S.p[w.en]=[0,0,0,t]});need-=q.length;if(q.length)save()}
  if(need>0&&W.some(w=>!S.p[w.en])) return startSort(need,startNew);
  const ws=W.filter(w=>st(w)===0);
  if(!ws.length){toast('Новых слов на сегодня нет');return go('home')}
  startSession('learn',buildLearn(ws));
}
function buildLearn(ws){
  const tasks=[],rounds=['er','re'];
  if(audioOn())rounds.push('listen'); if(S.set.typing)rounds.push('type');
  for(let i=0;i<ws.length;i+=5){
    const g=ws.slice(i,i+5);
    g.forEach((w,k)=>tasks.push({w,t:'intro',k:k+1,of:g.length}));
    rounds.forEach(r=>shuffle(g).forEach(w=>tasks.push({w,t:r})));
  }
  return tasks;
}
function startPractice(){
  const pool=W.filter(w=>{const s=st(w);return prac.src==='known'?s===K:s>=1});
  if(!pool.length){toast('Здесь пока нет слов');return}
  const types=['card','er','re'].concat(audioOn()?['listen']:[],['type']);
  const ws=shuffle(pool).slice(0,prac.n);
  const mode=prac.mode==='listen'&&!audioOn()?'mix':prac.mode;
  const tasks=ws.map(w=>({w,t:mode==='mix'?types[Math.floor(Math.random()*types.length)]:mode}));
  startSession('practice',tasks,{source:prac.src});
}

/* ================= session engine ================= */
function startSession(kind,tasks,opts){
  ses=Object.assign({kind,tasks,i:0,done:0,ok:0,bad:0,wrong:new Map(),learned:[],mastered:[],moved:[],rem:Object.create(null)},opts||{});
  if(kind==='learn')tasks.forEach(t=>{if(t.t!=='intro')ses.rem[t.w.en]=(ses.rem[t.w.en]||0)+1});
  view='session';
  const title=kind==='review'?'Повторение':kind==='learn'?'Новые слова':'Тренировка';
  app.innerHTML=`<div class="ses"><div class="ses-top"><button class="iconbtn" data-act="close-session" aria-label="Закрыть занятие">${ic('x')}</button>
   <div class="track" role="progressbar" aria-label="${title}" aria-valuemin="0" aria-valuemax="100"><i id="pbar"></i></div><div class="ses-count" id="pcount"></div></div>
   <div class="ses-body" id="task"></div></div>`;
  window.scrollTo(0,0);
  showTask();
}
function updateProgress(){
  if(!ses)return;
  // текущее задание перестаёт считаться оставшимся, как только на него ответили (при ошибке его место занимает повтор)
  const rem=Math.max(0,ses.tasks.length-ses.i-(cur&&cur.answered?1:0)),total=ses.done+rem,pct=total?Math.round(ses.done/total*100):100;
  const b=$('#pbar');if(b){b.style.width=pct+'%';b.parentNode.setAttribute('aria-valuenow',pct)}
  const c=$('#pcount');if(c)c.textContent='ещё '+rem;
}
function wordHTML(w){return `<div class="word ${w.show.length>11?'long':''}" lang="en">${esc(w.show)}</div>`}
function speakBtns(w){return tts.ok?`<div class="speak-row"><button class="speak" data-act="say" aria-label="Прослушать слово">${ic('sound')}Прослушать</button><button class="speak" data-act="say-slow">Медленно</button></div>`:''}
function showTask(){
  clearTimeout(timer);
  if(!ses)return;
  if(ses.i>=ses.tasks.length)return finishSession();
  const task=ses.tasks[ses.i],w=task.w;cur={task,answered:false,correct:null,near:false};
  if(task.t==='listen'&&!audioOn())task.t='er';
  const el=$('#task');let h='';
  if(task.t==='intro'){
    h=`<div class="task"><p class="task-label">Новое слово · ${task.k} из ${task.of}</p>
      <div class="prompt">${wordHTML(w)}<div class="ru">${esc(tr(w))}</div>${speakBtns(w)}</div>
      <button class="btn primary big" data-act="intro-next">Понятно, дальше ${ic('arrow')}</button>
      <div class="center"><button class="link" data-act="intro-known">Уже знаю это слово</button></div>
      <p class="keys"><kbd>Enter</kbd> дальше · <kbd>S</kbd> прослушать</p></div>`;
  }else if(task.t==='er'||task.t==='re'||task.t==='listen'){
    cur.opts=shuffle([w].concat(distract(w,3,task.t==='listen')));
    const en=task.t==='re';
    const prompt=task.t==='er'?`${wordHTML(w)}${tts.ok?`<button class="speak" data-act="say" aria-label="Прослушать слово">${ic('sound')}Прослушать</button>`:''}`
      :task.t==='re'?`<div class="ru">${esc(tr(w))}</div>`
      :`<button class="speak hero" data-act="say" aria-label="Прослушать ещё раз">${ic('sound')}</button><div class="speak-row"><button class="speak" data-act="say-slow">Медленно</button><button class="speak quiet" data-act="no-sound">Нет звука</button></div>`;
    h=`<div class="task"><p class="task-label">${task.t==='er'?'Выберите перевод':task.t==='re'?'Выберите слово':'Что вы услышали?'}</p>
      <div class="prompt">${prompt}</div>
      <div class="opts">${cur.opts.map((o,i)=>`<button class="opt ${en?'en':''}" data-act="choose" data-i="${i}" ${en?'lang="en"':''}><kbd>${i+1}</kbd><span>${esc(en?o.show:tr(o))}</span></button>`).join('')}</div>
      <div id="fb"></div></div>`;
  }else if(task.t==='type'){
    const amb=ambiguous(w),letters=w.en.replace(/[^a-z]/g,'').length;
    h=`<div class="task"><p class="task-label">Напишите по-английски</p>
      <div class="prompt compact"><div class="ru">${esc(tr(w))}</div></div>
      <form class="typeform" data-form="type" autocomplete="off">
        <input class="inp" id="tinp" type="text" lang="en" inputmode="text" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Слово по-английски">
        <p class="hint">${letters} ${plural(letters,['буква','буквы','букв'])}${w.en.includes('-')?', через дефис':''}${amb?` · начинается на «${esc(w.show[0])}»`:''}</p>
        <p class="type-msg" id="tmsg" role="status"></p>
        <button class="btn primary big" type="submit" id="tsubmit">Проверить</button>
      </form>
      <div class="center" id="tgive"><button class="link" data-act="giveup">Не помню</button></div>
      <div id="fb"></div></div>`;
  }else if(task.t==='card'){
    h=`<div class="task"><p class="task-label">Вспомните перевод</p>
      <div class="prompt"><button class="flip" data-act="flip" id="flip">${wordHTML(w)}<span class="tap">Нажмите, чтобы увидеть перевод</span></button></div>
      <div id="fb"></div><p class="keys"><kbd>Пробел</kbd> показать перевод</p></div>`;
  }
  el.innerHTML=h;updateProgress();arm();
  if(task.t==='listen'||((task.t==='intro'||task.t==='er'||task.t==='card')&&S.set.autoSpeak))speak(w.show);
  if(task.t==='type'){const i=$('#tinp');try{i.focus({preventScroll:true})}catch(e){i.focus()}}
}
function resolve(correct){
  if(!cur||cur.answered)return;cur.answered=true;cur.correct=correct;
  const task=cur.task,w=task.w,t=today(),h=hist(t);
  if(!task.retry)ses[correct?'ok':'bad']++;
  if(correct)ses.done++;
  else{ses.wrong.set(w.en,w);ses.tasks.splice(Math.min(ses.tasks.length,ses.i+4),0,Object.assign({},task,{retry:true}))}
  if(ses.kind==='review'){
    if(!task.retry){h[1]++;h[correct?2:3]++;const p=S.p[w.en];
      if(p&&p[0]>=1&&p[0]<=6){if(correct){if(p[0]>=6){p[0]=7;p[1]=0;ses.mastered.push(w)}else{p[0]++;p[1]=t+INT[p[0]]}}else{p[0]=Math.max(1,p[0]-2);p[1]=t+1;p[2]=(p[2]||0)+1}}}
  }else if(ses.kind==='learn'){
    if(!task.retry)h[correct?2:3]++;
    if(correct&&--ses.rem[w.en]<=0&&st(w)===0){S.p[w.en]=[1,t+INT[1],0,t];h[0]++;ses.learned.push(w)}
  }else{
    h[4]=(h[4]||0)+1;
    if(!correct&&ses.source==='known'&&st(w)===K){S.p[w.en]=[Q,0,0,0];ses.moved.push(w)}
  }
  S.started=true;if(!S.first)S.first=t;save();updateProgress();
}
function feedback(correct,auto){
  const w=cur.task.w,fb=$('#fb');if(!fb)return;
  fb.innerHTML=`<div class="fb"><div class="fb-msg ${correct?'ok':'bad'}" role="status">${ic(correct?'check':'x')}<div>${correct?'Верно':'Правильный ответ'}: <b class="en" lang="en">${esc(w.show)}</b> — ${esc(tr(w))}</div></div>
   <button class="btn ${correct?'':'primary'} big" data-act="next">Дальше ${ic('arrow')}</button></div>`;
  arm();
  if(correct&&auto){timer=setTimeout(next,auto)}
  else{const b=$('[data-act=next]',fb);if(b&&b.scrollIntoView)b.scrollIntoView({block:'nearest'})}
}
function next(){clearTimeout(timer);if(!ses)return;ses.i++;showTask()}
function choose(i){
  if(!cur||cur.answered||!cur.opts)return;
  const w=cur.task.w,pick=cur.opts[i];if(!pick)return;const correct=pick===w;
  $$('.opt').forEach((b,k)=>{b.disabled=true;if(cur.opts[k]===w)b.classList.add('ok');else if(k===i)b.classList.add('bad')});
  resolve(correct);
  if(S.set.autoSpeak&&cur.task.t!=='er')speak(w.show);
  feedback(correct,cur.task.t==='er'?900:1500);
}
function submitTyped(giveUp){
  if(!cur||cur.answered||cur.task.t!=='type')return;
  const w=cur.task.w,inp=$('#tinp'),msg=$('#tmsg');
  const r=giveUp?'bad':checkTyped(w,inp.value);
  if(r==='empty'){inp.focus();return}
  if(r==='syn'){msg.textContent=`«${norm(inp.value)}» тоже подходит, но загадано другое слово — на букву «${w.show[0]}»`;inp.select();return}
  if(r==='near'&&!cur.near){cur.near=true;msg.textContent='Почти. Проверьте написание и попробуйте ещё раз';inp.focus();return}
  const correct=r==='ok';
  inp.readOnly=true;inp.classList.add(correct?'ok':'bad');msg.textContent='';
  const sb=$('#tsubmit');if(sb)sb.remove();const g=$('#tgive');if(g)g.remove();
  resolve(correct);
  if(S.set.autoSpeak)speak(w.show);
  feedback(correct,1400);
}
function flip(){
  if(!cur||cur.task.t!=='card'||cur.flipped)return;cur.flipped=true;arm();const w=cur.task.w;
  const f=$('#flip');f.innerHTML=`${wordHTML(w)}<div class="ru sub">${esc(tr(w))}</div>`;f.disabled=true;
  $('#fb').innerHTML=`<div class="fb"><div class="row2"><button class="btn big" data-act="card-no">Не помню</button><button class="btn primary big" data-act="card-yes">Помню</button></div></div>`;
  const k=$('.keys');if(k)k.innerHTML='<kbd>←</kbd> не помню · <kbd>→</kbd> помню';
}
function introKnown(){
  const w=cur.task.w;S.p[w.en]=[K,0,0,0];save();
  ses.tasks=ses.tasks.filter((t,i)=>i<=ses.i||t.w!==w);delete ses.rem[w.en];
  toast(`«${w.show}» отмечено как знакомое`);next();
}
function finishSession(){
  const s=ses,c=counts(),pl=plan(),total=s.ok+s.bad;
  const facts=[];let title,lead;
  if(s.kind==='learn'){
    title=s.learned.length?`Выучено: ${nWords(s.learned.length)}`:'Урок завершён';
    lead=s.learned.length?'Первое повторение этих слов — завтра. Оно займёт пару минут.':'Новых слов в этом уроке не осталось.';
    facts.push([s.learned.length,'новых слов']);
  }else if(s.kind==='review'){
    title='Повторение завершено';
    lead=s.bad?'Слова с ошибками вернутся завтра, остальные — позже по расписанию.':'Без ошибок. Интервалы для этих слов увеличены.';
    facts.push([total,plural(total,['слово повторено','слова повторено','слов повторено'])]);
    if(s.mastered.length)facts.push([s.mastered.length,'выучено окончательно']);
  }else{
    title='Тренировка завершена';
    lead=s.moved.length?`${nWords(s.moved.length)} с ошибками ${plural(s.moved.length,['отправлено','отправлены','отправлены'])} в очередь на изучение.`:'На расписание повторений она не влияет.';
    facts.push([total,plural(total,['задание','задания','заданий'])]);
  }
  if(total)facts.push([Math.round(s.ok/total*100)+'%','с первой попытки']);
  facts.push([streak(),plural(streak(),['день подряд','дня подряд','дней подряд'])]);
  let nextBtn=null;
  if(s.kind!=='practice'){
    if(c.due)nextBtn=['review',`Повторить ещё ${nWords(c.due)}`];
    else if(pl.left)nextBtn=['new',pl.in0.length?'Продолжить урок':`К новым словам (${pl.left})`];
  }
  sum={title,lead,facts,wrong:Array.from(s.wrong.values()),nextBtn,learned:s.kind==='learn'?s.learned:[]};
  ses=null;cur=null;view='summary';render();arm();window.scrollTo(0,0);
}
function summaryHTML(){
  const s=sum;
  const list=(title,ws)=>ws.length?`<section class="card"><h2>${title}</h2><ul class="wlist">${ws.map(w=>`<li><span class="en" lang="en">${esc(w.show)}</span><span class="tr">${esc(tr(w))}</span></li>`).join('')}</ul></section>`:'';
  return `<div class="ses"><div class="ses-body"><div class="sum">
    <div class="sum-ic">${ic('check')}</div><h1>${esc(s.title)}</h1><p class="lead">${esc(s.lead)}</p>
    <div class="facts">${s.facts.map(f=>`<div class="fact"><b>${esc(f[0])}</b><span>${esc(f[1])}</span></div>`).join('')}</div>
    ${list('Были ошибки',s.wrong)}${s.wrong.length?'':list('Слова этого урока',s.learned)}
    <div class="modal-actions">${s.nextBtn?`<button class="btn primary big" data-act="${s.nextBtn[0]}">${esc(s.nextBtn[1])} ${ic('arrow')}</button>`:''}
    <button class="btn ${s.nextBtn?'':'primary'} big" data-act="nav" data-v="home">На главную</button></div>
  </div></div></div>`;
}

/* ================= sort ================= */
function startSort(target,after){sortS={target:target||0,picked:0,known:0,undo:[],after:after||null,shown:false};view='sort';render();arm();window.scrollTo(0,0)}
const sortCur=()=>W.find(w=>!S.p[w.en]);
function sortHTML(){
  const s=sortS,w=sortCur();
  const top=`<div class="ses-top"><button class="iconbtn" data-act="close-sort" aria-label="Закрыть">${ic('x')}</button>
    ${s.target?`<div class="track"><i style="width:${Math.round(s.picked/s.target*100)}%"></i></div><div class="ses-count">${s.picked} из ${s.target}</div>`:`<div style="flex:1"></div><button class="btn sm" data-act="close-sort">Готово</button>`}</div>`;
  if(!w)return `<div class="ses">${top}<div class="ses-body"><div class="sum"><div class="sum-ic">${ic('check')}</div><h1>Все слова разобраны</h1><p class="lead">В списке не осталось слов, которые вы не видели.</p><button class="btn primary big" data-act="sort-finish">${s.after?'Продолжить':'Готово'}</button></div></div></div>`;
  return `<div class="ses">${top}<div class="ses-body"><div class="task">
    <p class="task-label">${s.target?'Отбор слов для урока':'Сортировка слов'}</p>
    <div class="prompt"><div class="flip sortcard" id="scard">
      <span class="rank">№ ${w.i+1} по частоте</span>${wordHTML(w)}
      ${s.shown?`<div class="ru sub">${esc(tr(w))}</div>`:''}
      <div class="speak-row">${s.shown?'':`<button class="speak" data-act="sort-show">${ic('eye')}Показать перевод</button>`}${tts.ok?`<button class="speak" data-act="sort-say" aria-label="Прослушать слово">${ic('sound')}</button>`:''}</div>
    </div></div>
    <div class="row2"><button class="btn big" data-act="sort-learn">Учить</button><button class="btn primary big" data-act="sort-know">Знаю</button></div>
    <div class="sort-stats"><span>Знаю: <b>${s.known}</b></span><span>Учить: <b>${s.picked}</b></span>
      <button class="link" data-act="sort-undo" ${s.undo.length?'':'disabled'} style="padding:0 6px;min-height:24px">${ic('undo')} Отменить</button></div>
    <p class="keys"><kbd>←</kbd> учить · <kbd>→</kbd> знаю · <kbd>Пробел</kbd> перевод · <kbd>Z</kbd> отменить</p>
    <p class="hint">${s.target?'Знакомые слова в урок не попадут. Отмечайте «Знаю», только если уверены в переводе.':'Слова с пометкой «Учить» встанут в очередь и будут появляться в уроках по порядку.'}</p>
  </div></div></div>`;
}
function sortMark(know){
  const s=sortS,w=sortCur();if(!s||!w)return;
  S.p[w.en]=[know?K:Q,0,0,0];S.started=true;if(!S.first)S.first=today();s.undo.push(w.en);know?s.known++:s.picked++;s.shown=false;save();
  if(s.target&&s.picked>=s.target)return sortDone();
  render();
}
function sortUndo(){const s=sortS,en=s&&s.undo.pop();if(!en)return;const p=S.p[en];if(p){p[0]===K?s.known--:s.picked--;delete S.p[en]}s.shown=false;save();render()}
function sortDone(){const a=sortS&&sortS.after;sortS=null;if(a)a();else go('home')}
function bindSwipe(){
  const c=$('#scard');if(!c||!window.PointerEvent)return;let x0=null,dx=0;
  c.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;x0=e.clientX;dx=0;c.classList.add('drag');try{c.setPointerCapture(e.pointerId)}catch(_){}});
  c.addEventListener('pointermove',e=>{if(x0===null)return;dx=e.clientX-x0;c.style.transform=`translateX(${dx}px) rotate(${dx/40}deg)`;c.style.opacity=String(1-Math.min(.5,Math.abs(dx)/400))});
  const end=commit=>{if(x0===null)return;x0=null;c.classList.remove('drag');if(commit&&Math.abs(dx)>90)sortMark(dx>0);else{c.style.transform='';c.style.opacity=''}};
  c.addEventListener('pointerup',()=>end(true));c.addEventListener('pointercancel',()=>end(false));
}

/* ================= practice setup ================= */
function practiceHTML(){
  const c=counts(),nL=c.learning+c.mastered,nK=c.known;
  const seg=(key,items)=>`<div class="seg" role="group">${items.map(([v,l,dis])=>`<button data-act="prac" data-k="${key}" data-v="${v}" aria-pressed="${String(prac[key])===String(v)}" ${dis?'disabled':''}>${l}</button>`).join('')}</div>`;
  const pool=prac.src==='known'?nK:nL;
  return `<div class="page-head"><div><p class="eyebrow">Без влияния на расписание</p><h1>Свободная тренировка</h1></div></div>
  <section class="card"><div class="set">
    <div class="set-row"><div><b>Какие слова</b><small>${prac.src==='known'?'Проверка слов с пометкой «знаю»: ошибётесь — слово уйдёт в очередь на изучение.':'Слова, которые вы учите или уже выучили.'}</small></div>${seg('src',[['learning',`Изучаемые · ${nL}`],['known',`«Знаю» · ${nK}`]])}</div>
    <div class="set-row"><div><b>Упражнение</b></div>${seg('mode',[['mix','Вперемешку'],['card','Карточки'],['er','Выбор перевода'],['re','Выбор слова'],['listen','На слух',!audioOn()],['type','Ввод']])}</div>
    <div class="set-row"><div><b>Сколько слов</b></div>${seg('n',[[10,'10'],[20,'20'],[40,'40']])}</div>
  </div></section>
  ${pool?`<button class="btn primary big" data-act="prac-start">Начать · ${nWords(Math.min(pool,prac.n))} ${ic('arrow')}</button>`:`<div class="card empty">${prac.src==='known'?'Слов с пометкой «знаю» пока нет.':'Вы ещё не выучили ни одного слова — сначала пройдите урок.'}</div>`}
  <div class="center"><button class="link" data-act="nav" data-v="home">Назад</button></div>`;
}

/* ================= dictionary ================= */
function statusInfo(w){
  const p=S.p[w.en];if(!p)return['Новое',''];const s=p[0];
  if(s===K)return['Знаю','k'];if(s===Q)return['В очереди',''];if(s===0)return['В уроке','l'];if(s===7)return['Выучено','m'];
  return['Учу · '+s+'/6','l'];
}
const FILTERS=[['all','Все',()=>true],['learn','Учу',w=>{const s=st(w);return s>=0&&s<=6&&s!==null}],['done','Выучено',w=>st(w)===7],['known','Знаю',w=>st(w)===K],['queue','В очереди',w=>st(w)===Q],['new','Новые',w=>st(w)===null]];
function dictRows(){
  const q=norm(dict.q).replace(/ё/g,'е'),f=FILTERS.find(x=>x[0]===dict.f)[2];
  let ws=W.filter(f);
  if(q){ws=ws.filter(w=>w.en.includes(q)||tr(w).toLowerCase().replace(/ё/g,'е').includes(q));ws.sort((a,b)=>(b.en===q)-(a.en===q)||(b.en.startsWith(q))-(a.en.startsWith(q))||a.i-b.i)}
  return ws;
}
function dictListHTML(){
  const ws=dictRows();
  if(!ws.length)return `<div class="empty">${dict.q?'Ничего не найдено. Попробуйте другое написание или снимите фильтр.':'В этой группе пока нет слов.'}</div>`;
  return `<div class="dlist">${ws.slice(0,dict.limit).map(w=>{const[l,c]=statusInfo(w);return `<button class="drow" data-act="word" data-w="${esc(w.en)}"><span class="rk">${w.i+1}</span><span style="min-width:0"><span class="en" lang="en">${esc(w.show)}</span><span class="tr">${esc(tr(w))}</span></span><span class="badge ${c}">${l}</span></button>`}).join('')}</div>
  ${ws.length>dict.limit?`<div style="padding:12px 16px 16px"><button class="btn block" data-act="dict-more">Показать ещё · осталось ${ws.length-dict.limit}</button></div>`:''}`;
}
function dictHTML(){
  const n=Object.fromEntries(FILTERS.map(f=>[f[0],W.filter(f[2]).length]));
  return `<div class="page-head"><div><p class="eyebrow">${W.length} слов по частоте</p><h1>Словарь</h1></div></div>
  <div class="search">${ic('search')}<input id="dict-q" type="search" placeholder="Слово или перевод" value="${esc(dict.q)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Поиск по словарю"></div>
  <div class="chips" role="group" aria-label="Фильтр">${FILTERS.map(f=>`<button class="chip" data-act="dict-f" data-f="${f[0]}" aria-pressed="${dict.f===f[0]}">${f[1]}<b>${n[f[0]]}</b></button>`).join('')}</div>
  <section class="card" style="padding:0;overflow:hidden" id="dict-list">${dictListHTML()}</section>`;
}
function wordModal(w,editing){
  const p=S.p[w.en],s=p?p[0]:null,[label]=statusInfo(w),t=today();
  let whenTxt='';
  if(s>=1&&s<=6){const d=p[1]-t;whenTxt=d<=0?'сегодня':d===1?'завтра':'через '+nDays(d)}
  const acts=[];
  if(s===null||s===K)acts.push(['w-learn','Учить это слово','primary']);
  if(s!==K)acts.push(['w-know','Отметить «знаю»','']);
  if(s!==null)acts.push(['w-reset','Сбросить прогресс слова','']);
  openModal(`<div class="modal-head"><div><span class="rank">№ ${w.i+1} по частоте</span><div class="word" lang="en">${esc(w.show)}</div></div><button class="iconbtn" data-act="modal-close" aria-label="Закрыть">${ic('x')}</button></div>
   ${editing?`<form data-form="tr" data-w="${esc(w.en)}" style="display:grid;gap:10px"><label for="tr-inp" class="small muted">Перевод (пусто — вернуть исходный)</label><input id="tr-inp" type="text" value="${esc(tr(w))}" maxlength="200"><div class="btn-row"><button class="btn primary sm" type="submit">Сохранить</button><button class="btn sm" type="button" data-act="word" data-w="${esc(w.en)}">Отмена</button></div></form>`
    :`<div class="ru" style="font-size:20px">${esc(tr(w))}</div><div class="btn-row">${tts.ok?`<button class="speak" data-act="say-w" data-w="${esc(w.en)}">${ic('sound')}Прослушать</button>`:''}<button class="speak" data-act="w-edit" data-w="${esc(w.en)}">Изменить перевод</button></div>`}
   <dl class="kv"><dt>Статус</dt><dd>${label}</dd>${whenTxt?`<dt>Повторение</dt><dd>${whenTxt}</dd>`:''}${p&&p[2]?`<dt>Ошибок</dt><dd>${p[2]}</dd>`:''}</dl>
   <div class="modal-actions">${acts.map(a=>`<button class="btn ${a[2]}" data-act="${a[0]}" data-w="${esc(w.en)}">${a[1]}</button>`).join('')}</div>`);
  if(editing){const i=$('#tr-inp');i&&i.focus()}
}

/* ================= stats ================= */
function statsHTML(){
  const c=counts(),t=today(),sk=streak(),best=Math.max(bestStreak(),sk);
  const fact=(n,l)=>`<div class="fact"><b>${n}</b><span>${l}</span></div>`;
  let ok=0,bad=0;for(let d=t-6;d<=t;d++){const h=S.hist[d];if(h){ok+=h[2];bad+=h[3]}}
  // calendar: 12 weeks, columns = weeks starting Monday
  const dow=(dayDate(t).getDay()+6)%7,start=t-dow-7*11;let cal='';
  for(let d=start;d<start+84;d++){
    if(d>t){cal+='<i class="fut"></i>';continue}
    const h=S.hist[d],n=h?h[0]+h[1]+(h[4]||0):0,l=n===0?'':n<10?'l1':n<30?'l2':'l3';
    cal+=`<i class="${l}${d===t?' today':''}" title="${esc(fmtDate(d))}: ${h?`новых ${h[0]}, повторено ${h[1]}`:'нет занятий'}"></i>`;
  }
  // forecast
  const fc=[0,0,0,0,0,0,0];
  for(const w of W){const p=S.p[w.en];if(p&&p[0]>=1&&p[0]<=6){const d=Math.max(0,p[1]-t);if(d<7)fc[d]++}}
  const mx=Math.max(1,...fc);
  const fcH=fc.map((n,i)=>`<div><b>${n}</b><i class="${n?'':'zero'}" style="height:${n?Math.max(6,Math.round(n/mx*80)):3}px"></i><span>${i===0?'сегодня':fmtDate(t+i,{weekday:'short'})}</span></div>`).join('');
  const stg=[0,0,0,0,0,0,0];for(const w of W){const s=st(w);if(s>=1&&s<=6)stg[s]++}
  const smx=Math.max(1,...stg);
  const stH=[1,2,3,4,5,6].map(i=>`<div class="stage"><span class="muted">${nDays(INT[i])}</span><div class="track"><i style="width:${Math.round(stg[i]/smx*100)}%"></i></div><b>${stg[i]}</b></div>`).join('');
  return `<div class="page-head"><div><p class="eyebrow">Как идёт дело</p><h1>Статистика</h1></div></div>
  <div class="statgrid">${fact(c.mastered,'выучено')}${fact(c.learning,'в изучении')}${fact(sk,plural(sk,['день подряд','дня подряд','дней подряд']))}${fact(ok+bad?Math.round(ok/(ok+bad)*100)+'%':'—','верных за 7 дней')}</div>
  <section class="card"><h2>Занятия за 12 недель</h2><div class="cal-wrap"><div class="cal-days"><span>пн</span><span></span><span>ср</span><span></span><span>пт</span><span></span><span>вс</span></div><div class="cal">${cal}</div></div>
    <p class="muted small" style="margin-top:12px">Лучшая серия: ${nDays(best)}. Чем темнее клетка, тем больше слов в этот день.</p></section>
  <section class="card"><h2>Повторения на неделю вперёд</h2>${c.learning?`<div class="fc">${fcH}</div>`:`<p class="muted">Появятся после первого урока.</p>`}</section>
  <section class="card"><h2>Слова по интервалам</h2>${c.learning?`<div class="stages">${stH}</div><p class="muted small" style="margin-top:12px">Интервал — через сколько слово придёт снова. После 60 дней слово считается выученным.</p>`:`<p class="muted">Пока в изучении нет слов.</p>`}</section>
  <section class="card"><h2>Весь список</h2><dl class="kv"><dt>Уже знали</dt><dd class="num">${c.known}</dd><dt>В очереди на изучение</dt><dd class="num">${c.queued}</dd><dt>Ещё не просмотрено</dt><dd class="num">${c.unseen}</dd></dl></section>`;
}

/* ================= settings ================= */
function settingsHTML(){
  const s=S.set,sw=(k,on,dis)=>`<button class="switch" role="switch" aria-checked="${!!on}" data-act="toggle" data-k="${k}" ${dis?'disabled':''} aria-label="${{typing:'Ввод с клавиатуры',audio:'Задания на слух',autoSpeak:'Озвучивать слова автоматически'}[k]}"></button>`;
  const perDayLoad=s.perDay<=5?'около 5 минут в день':s.perDay<=10?'10–15 минут в день':s.perDay<=20?'25–30 минут в день':'больше получаса в день';
  const voices=tts.voices.map(v=>`<option value="${esc(v.name)}" ${s.voice===v.name?'selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  return `<div class="page-head"><div><h1>Настройки</h1></div></div>
  <section class="card"><h2>Занятия</h2><div class="set">
    <div class="set-row"><div><b>Новых слов в день</b><small>Сейчас: ${perDayLoad} вместе с повторениями</small></div>
      <div class="stepper"><button data-act="step" data-d="-1" aria-label="Меньше">${ic('minus')}</button><output aria-live="polite">${s.perDay}</output><button data-act="step" data-d="1" aria-label="Больше">${ic('plus')}</button></div></div>
    <div class="set-row"><div><b>Ввод с клавиатуры</b><small>Задания, где слово нужно написать. Без них останется выбор из вариантов.</small></div>${sw('typing',s.typing)}</div>
    <div class="set-row"><div><b>Задания на слух</b><small>${!tts.ok?'В этом браузере нет синтеза речи — задания на слух недоступны.':tts.dead?'Озвучка сейчас не работает: на устройстве нет английского голоса или звук недоступен. Проверьте голос ниже.':'Слово звучит, вы выбираете перевод.'}</small></div>${sw('audio',s.audio&&tts.ok,!tts.ok)}</div>
  </div></section>
  <section class="card"><h2>Произношение</h2><div class="set">
    <div class="set-row"><div><b>Озвучивать слова автоматически</b><small>При показе слова и после ответа.</small></div>${sw('autoSpeak',s.autoSpeak&&tts.ok,!tts.ok)}</div>
    ${tts.ok?`<div class="set-row"><div><b>Голос</b><small>${tts.voices.length?'Список зависит от устройства.':'Используется голос устройства по умолчанию.'}</small></div><div class="btn-row">${tts.voices.length?`<select class="sel" id="voice-sel" aria-label="Голос"><option value="">Авто</option>${voices}</select>`:''}<button class="btn sm" data-act="voice-test">${ic('sound')}Проверить</button></div></div>
    <div class="set-row"><div><b>Скорость речи</b></div><div class="seg" role="group">${[[0.7,'Медленно'],[0.9,'Обычно'],[1.05,'Быстро']].map(([v,l])=>`<button data-act="rate" data-v="${v}" aria-pressed="${Math.abs(s.rate-v)<.01}">${l}</button>`).join('')}</div></div>`:''}
  </div></section>
  <section class="card"><h2>Оформление</h2><div class="set"><div class="set-row"><div><b>Тема</b></div><div class="seg" role="group">${[['auto','Авто'],['light','Светлая'],['dark','Тёмная']].map(([v,l])=>`<button data-act="theme" data-v="${v}" aria-pressed="${s.theme===v}">${l}</button>`).join('')}</div></div></div></section>
  <section class="card"><h2>Прогресс и перенос</h2>
    <p class="muted small" style="margin-bottom:14px">${store.ok?'Прогресс хранится в этом браузере на этом устройстве. Чтобы продолжить на другом устройстве или сделать резервную копию, сохраните его в файл и загрузите там.':'В режиме предпросмотра прогресс не сохраняется. Скачайте файл приложения и откройте его в браузере.'}</p>
    <div class="btn-row"><button class="btn" data-act="export">${ic('down')}Сохранить прогресс</button><button class="btn" data-act="import">${ic('up')}Загрузить прогресс</button><button class="btn danger" data-act="reset">Сбросить всё</button></div>
  </section>
  <p class="muted small" style="text-align:center">Версия __VERSION__</p>`;
}
function exportText(){return JSON.stringify({app:'words3000',v:1,exported:new Date().toISOString(),data:S})}
function exportModal(){
  openModal(`<div class="modal-head"><h2>Сохранить прогресс</h2><button class="iconbtn" data-act="modal-close" aria-label="Закрыть">${ic('x')}</button></div>
   <p class="muted small">Скачайте файл и откройте его через «Загрузить прогресс» на другом устройстве. Если скачивание не сработало, скопируйте текст ниже целиком.</p>
   <div class="modal-actions inline"><button class="btn primary" data-act="export-file">${ic('down')}Скачать файл</button><button class="btn" data-act="export-copy">Скопировать текст</button></div>
   <textarea id="exp-text" readonly aria-label="Данные прогресса">${esc(exportText())}</textarea>`);
}
function importModal(){
  openModal(`<div class="modal-head"><h2>Загрузить прогресс</h2><button class="iconbtn" data-act="modal-close" aria-label="Закрыть">${ic('x')}</button></div>
   <p class="muted small">Текущий прогресс на этом устройстве будет заменён загруженным.</p>
   <input type="file" id="imp-file" accept=".json,application/json,text/plain" hidden>
   <button class="btn" data-act="import-pick">${ic('up')}Выбрать файл</button>
   <label for="imp-text" class="small muted">или вставьте скопированный текст</label>
   <textarea id="imp-text" placeholder='{"app":"words3000", …}'></textarea>
   <p class="type-msg" id="imp-msg" role="alert" style="color:var(--bad);text-align:left"></p>
   <button class="btn primary" data-act="import-apply">Загрузить</button>`);
}
function doImport(text){
  let d;try{d=JSON.parse(text)}catch(e){return 'Не получилось прочитать данные: текст повреждён или скопирован не полностью.'}
  if(!d||d.app!=='words3000'||!d.data||typeof d.data.p!=='object')return 'Это не файл прогресса этого приложения.';
  S=sanitize(d.data);S.started=true;save();closeModal();applyTheme();render();
  const n=Object.keys(S.p).length;toast(`Прогресс загружен: ${nWords(n)}`);return '';
}
function download(name,text){
  const b=new Blob([text],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');
  a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);
}

/* ================= modal ================= */
function openModal(html){
  const r=$('#modal-root');
  r.innerHTML=`<div class="scrim" data-scrim><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  document.body.style.overflow='hidden';
  const m=$('.modal',r);try{m.focus({preventScroll:true})}catch(e){}
}
function closeModal(){$('#modal-root').innerHTML='';document.body.style.overflow=''}
const modalOpen=()=>!!$('#modal-root').firstChild;
function confirmModal(title,text,label,act,danger){
  openModal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="modal-actions inline"><button class="btn" data-act="modal-close">Отмена</button><button class="btn ${danger?'danger':'primary'}" data-act="${act}">${esc(label)}</button></div>`);
}

/* ================= actions ================= */
const A={
  nav(el){closeModal();const v=el.dataset.v;if(v==='dict')dict.limit=80;go(v)},
  perday(el){S.set.perDay=+el.dataset.n;save();render()},
  'first-start'(){S.started=true;if(!S.first)S.first=today();save();startLesson()},
  'backup-later'(){S.backup=today()-7;save();render()},
  lesson(){startLesson()},
  new(){startNew()},
  review(){startReview()},
  more(){const t=today();S.extra=[t,(S.extra&&S.extra[0]===t?S.extra[1]:0)+5];save();startNew()},
  sort(){if(!sortCur()){toast('Все слова уже разобраны');return}startSort(0,null)},
  'close-session'(){go('home')},
  'close-sort'(){sortS=null;go('home')},
  'sort-finish'(){sortDone()},
  say(){cur&&speak(cur.task.w.show)},
  'say-slow'(){cur&&speak(cur.task.w.show,true)},
  'say-w'(el){const w=byEn[el.dataset.w];w&&speak(w.show)},
  'intro-next'(){if(!cur||cur.task.t!=='intro')return;ses.done++;next()},
  'intro-known'(){if(cur&&cur.task.t==='intro')introKnown()},
  choose(el){choose(+el.dataset.i)},
  next(){next()},
  giveup(){submitTyped(true)},
  'no-sound'(){listenFallback('Слово показано текстом. Задания на слух можно отключить в настройках')},
  flip(){flip()},
  'card-yes'(){resolve(true);next()},
  'card-no'(){resolve(false);next()},
  'sort-show'(){sortS.shown=true;render();const w=sortCur();if(w&&S.set.autoSpeak)speak(w.show)},
  'sort-say'(){const w=sortCur();w&&speak(w.show)},
  'sort-know'(){sortMark(true)},
  'sort-learn'(){sortMark(false)},
  'sort-undo'(){sortUndo()},
  prac(el){const k=el.dataset.k;prac[k]=k==='n'?+el.dataset.v:el.dataset.v;render()},
  'prac-start'(){startPractice()},
  'dict-f'(el){dict.f=el.dataset.f;dict.limit=80;render()},
  'dict-more'(){dict.limit+=200;$('#dict-list').innerHTML=dictListHTML()},
  word(el){const w=byEn[el.dataset.w];w&&wordModal(w)},
  'w-edit'(el){const w=byEn[el.dataset.w];w&&wordModal(w,true)},
  'w-learn'(el){setWord(el.dataset.w,[Q,0,0,0],'Слово добавлено в очередь')},
  'w-know'(el){setWord(el.dataset.w,[K,0,0,0],'Отмечено как знакомое')},
  'w-reset'(el){setWord(el.dataset.w,null,'Прогресс слова сброшен')},
  'modal-close'(){closeModal()},
  toggle(el){const k=el.dataset.k;S.set[k]=!S.set[k];save();render()},
  step(el){S.set.perDay=Math.min(50,Math.max(1,S.set.perDay+ +el.dataset.d));save();render()},
  rate(el){S.set.rate=+el.dataset.v;save();render();speak('This is how words will sound')},
  theme(el){S.set.theme=el.dataset.v;save();render()},
  'voice-test'(){speak('Hello! This is how English words will sound.')},
  export(){exportModal()},
  'export-file'(){try{const d=new Date(),z=n=>String(n).padStart(2,'0');download(`english-progress-${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}.json`,exportText());S.backup=today();save();toast('Файл с прогрессом сохранён в загрузки')}catch(e){toast('Скачать не удалось — скопируйте текст')}},
  'export-copy'(){const ta=$('#exp-text');ta.focus();ta.select();const done=()=>{S.backup=today();save();toast('Текст скопирован')};const fail=()=>{try{document.execCommand('copy')?done():toast('Выделите текст и скопируйте вручную')}catch(e){toast('Выделите текст и скопируйте вручную')}};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(ta.value).then(done,fail);else fail()},
  import(){importModal()},
  'import-pick'(){$('#imp-file').click()},
  'import-apply'(){const t=$('#imp-text').value.trim();const m=$('#imp-msg');if(!t){m.textContent='Выберите файл или вставьте текст.';return}const err=doImport(t);if(err)m.textContent=err},
  reset(){confirmModal('Сбросить весь прогресс?','Выученные слова, расписание повторений и статистика будут удалены. Отменить это нельзя — при необходимости сначала сохраните прогресс в файл.','Сбросить','reset-yes',true)},
  'reset-yes'(){const set=S.set;S=fresh();S.set=set;save();closeModal();go('home');toast('Прогресс сброшен')}
};
function setWord(en,val,msg){
  const w=byEn[en];if(!w)return;if(val)S.p[en]=val;else delete S.p[en];S.started=true;save();closeModal();
  if(view==='dict'){const y=window.scrollY;render();window.scrollTo(0,y)}
  toast(msg);
}

document.addEventListener('click',e=>{
  if(e.target.hasAttribute&&e.target.hasAttribute('data-scrim')){closeModal();return}
  const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
  const f=A[el.dataset.act];if(!f)return;
  e.preventDefault();
  // после щелчка мышью фокус с кнопки снимается, чтобы Enter и пробел снова управляли занятием
  if(e.detail>0&&document.activeElement===el)el.blur();
  if(performance.now()<guardUntil&&!modalOpen())return;
  f(el,e);
});
document.addEventListener('submit',e=>{
  const f=e.target;e.preventDefault();
  if(f.dataset.form==='type'){if(performance.now()<guardUntil)return;submitTyped(false)}
  else if(f.dataset.form==='tr'){const w=byEn[f.dataset.w];if(!w)return;const v=$('#tr-inp').value.trim();if(v&&v!==w.ru)S.tr[w.en]=v.slice(0,200);else delete S.tr[w.en];save();
    if(view==='dict'){const y=window.scrollY;render();window.scrollTo(0,y)}wordModal(w);toast('Перевод сохранён')}
});
document.addEventListener('input',e=>{
  if(e.target.id==='dict-q'){dict.q=e.target.value;dict.limit=80;$('#dict-list').innerHTML=dictListHTML()}
  else if(e.target.id==='tinp'){const m=$('#tmsg');if(m&&cur&&!cur.near)m.textContent=''}
});
document.addEventListener('change',e=>{
  if(e.target.id==='voice-sel'){S.set.voice=e.target.value;save();speak('Hello! This is how English words will sound.')}
  else if(e.target.id==='imp-file'){const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{const err=doImport(String(r.result||''));if(err){const m=$('#imp-msg');if(m)m.textContent=err}};r.onerror=()=>{const m=$('#imp-msg');if(m)m.textContent='Не удалось прочитать файл.'};r.readAsText(f)}
});
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key,tg=e.target,act=k==='Enter'||k===' ';
  if(modalOpen()){if(k==='Escape')closeModal();return}
  if(view!=='session'&&view!=='sort'&&view!=='summary')return;
  // зажатая клавиша не должна пролистывать задания
  if(e.repeat&&k!=='Backspace')return;
  // Enter и пробел на кнопке в фокусе нажимают именно её
  if(act&&tg.tagName==='BUTTON'&&!tg.disabled)return;
  const inField=/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName);
  if(view==='session'&&cur){
    const t=cur.task.t;
    if(k==='Escape'){go('home');return}
    if(cur.answered){if(act){e.preventDefault();next()}return}
    if(t==='type'||inField)return;
    if(k==='s'||k==='S'||k==='ы'||k==='Ы'){speak(cur.task.w.show);return}
    if(t==='intro'){if(act||k==='ArrowRight'){e.preventDefault();A['intro-next']()}}
    else if(t==='card'){
      if(!cur.flipped){if(act){e.preventDefault();flip()}}
      else if(k==='ArrowRight'||k==='2'){e.preventDefault();A['card-yes']()}
      else if(k==='ArrowLeft'||k==='1'){e.preventDefault();A['card-no']()}
    }
    else if(k>='1'&&k<='4'){e.preventDefault();choose(+k-1)}
    else if(t==='listen'&&k===' '){e.preventDefault();speak(cur.task.w.show)}
  }else if(view==='sort'&&sortS){
    if(k==='Escape'){A['close-sort']();return}
    if(!sortCur())return;
    if(k==='ArrowRight'){e.preventDefault();sortMark(true)}
    else if(k==='ArrowLeft'){e.preventDefault();sortMark(false)}
    else if(k===' '){e.preventDefault();if(!sortS.shown)A['sort-show']()}
    else if(k==='z'||k==='Z'||k==='я'||k==='Я'||k==='Backspace'){e.preventDefault();sortUndo()}
  }else if(view==='summary'&&k==='Enter'){e.preventDefault();const b=$('.sum .btn.primary');b&&b.click()}
});
window.addEventListener('storage',e=>{if(e.key===KEY&&view!=='session'&&view!=='sort'&&!modalOpen()){S=store.load();render()}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(view==='home'||view==='stats'))render()});
// открытая вкладка пережила ночь: обновить план на новый день
setInterval(()=>{if(today()!==shownDay&&(view==='home'||view==='stats')&&!modalOpen())render()},60000);

window.__w3k={set guard(v){guardMs=v;guardUntil=0},set ttsWait(v){ttsWait=v},get ttsDead(){return tts.dead},get S(){return S},get cur(){return cur},get ses(){return ses},get view(){return view},W,counts,plan,dueWords,checkTyped,distract,conflict};
render();
})();
