#!/usr/bin/env node
/*
 * Автотесты приложения «3000 слов».
 *
 *   cd dev/tests && npm install && npx playwright install chromium firefox webkit
 *   node run.js                 — все три движка
 *   node run.js chromium        — только один
 *   node run.js chromium --shots — ещё и снимки экранов в dev/tests/shots/
 *   node run.js webkit --only=случайные — только разделы, в названии которых есть это слово
 *
 * Проверяется собранный файл ../english-words.html.
 */
const pw = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'english-words.html');
const URL = 'file://' + FILE;
const SHOTS = process.argv.includes('--shots');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);   // часть названия раздела
const ENGINES = process.argv.slice(2).filter(a => !a.startsWith('--'));
const KEY = 'words3000:v1';

// Подмена времени: Date сдвигается на заданное число дней. Сдвиг помнит сам тест и заново выставляет
// его после перезагрузки страницы (см. reload ниже).
// В localStorage его держать нельзя: обращение к хранилищу из init-скрипта, то есть в момент создания
// документа, в Chromium для file:// изредка (около 2 % перезагрузок) даёт странице пустое хранилище,
// и тест видит «пропавший прогресс». Само приложение читает хранилище позже, и с ним такого нет
// (0 потерь на 1150 перезагрузок, в том числе в обычном профиле браузера).
// window.name тоже не годится: WebKit очищает его при перезагрузке file://.
const CLOCK = `(()=>{const RD=Date;let off=0;
 class D extends RD{constructor(...a){if(a.length)super(...a);else super(RD.now()+off*864e5)} static now(){return RD.now()+off*864e5}}
 window.Date=D;window.__setOff=n=>{off=n;return n};window.__setNow=(...a)=>window.__setOff((new RD(...a).getTime()-RD.now())/864e5);})();`;

// Подмена синтеза речи: в тестовых браузерах голосов нет, поэтому по умолчанию изображаем исправную озвучку.
// window.__ttsMode: 'ok' (по умолчанию) | 'error' (движок сообщает об ошибке) | 'silent' (ни звука, ни событий)
const TTS = `(()=>{try{Object.defineProperty(window.speechSynthesis,'speak',{configurable:true,value:u=>{const m=window.__ttsMode||'ok';window.__spoken=(window.__spoken||0)+1;
 setTimeout(()=>{if(m==='ok'){u.onstart&&u.onstart({});u.onend&&u.onend({})}else if(m==='error'){u.onerror&&u.onerror({error:'synthesis-failed'})}},0)}})}catch(e){}})();`;

let failed = 0, passed = 0;
const check = (cond, msg) => { if (cond) passed++; else { failed++; console.log('    ✗ ' + msg); } };

const st = p => p.evaluate(() => { const c = __w3k.cur; return c ? { t: c.task.t, en: c.task.w.en, ans: c.answered, opts: c.opts && c.opts.map(o => o.en), flipped: !!c.flipped, retry: !!c.task.retry } : null; });
const view = p => p.evaluate(() => __w3k.view);
const counts = p => p.evaluate(() => __w3k.counts());

async function answer(p, { wrong = false, kbd = false } = {}) {
  const c = await st(p);
  if (!c) return null;
  // после верного ответа приложение само идёт дальше через 0,9–1,5 с: кнопка «Дальше» может исчезнуть раньше клика
  if (c.ans) { kbd ? await p.keyboard.press('Enter') : await p.click('[data-act=next]', { timeout: 3000 }).catch(async e => { const x = await st(p); if (x && x.ans && x.en === c.en) throw e; }); return c; }
  if (c.t === 'intro') { kbd ? await p.keyboard.press('Enter') : await p.click('[data-act=intro-next]'); }
  else if (c.t === 'type') { await p.fill('#tinp', wrong ? 'qqqqqq' : c.en); await p.keyboard.press('Enter'); }
  else if (c.t === 'card') {
    if (!c.flipped) { kbd ? await p.keyboard.press(' ') : await p.click('#flip'); }
    else { kbd ? await p.keyboard.press(wrong ? 'ArrowLeft' : 'ArrowRight') : await p.click(wrong ? '[data-act=card-no]' : '[data-act=card-yes]'); }
  } else { let i = c.opts.indexOf(c.en); if (wrong) i = (i + 1) % 4; kbd ? await p.keyboard.press(String(i + 1)) : await p.click(`.opt[data-i="${i}"]`); }
  return c;
}
async function runSession(p, opt = {}) {
  let n = 0, wrongLeft = opt.wrong || 0; const used = new Set();
  while (await view(p) === 'session') {
    const c = await st(p); let w = false;
    if (c && !c.ans && c.t !== 'intro' && !c.retry && wrongLeft > 0 && !used.has(c.en) && (c.t !== 'card' || c.flipped)) { w = true; wrongLeft--; used.add(c.en); }
    await answer(p, { wrong: w, kbd: opt.kbd });
    if (++n > 4000) throw new Error('session did not finish');
  }
}
async function runSort(p, know = i => i % 2 === 0) {
  let i = 0;
  while (await view(p) === 'sort') {
    if (!await p.$('[data-act=sort-know]')) { await p.click('[data-act=sort-finish]'); break; }
    await p.click(know(i) ? '[data-act=sort-know]' : '[data-act=sort-learn]');
    if (++i > 3100) throw new Error('sort did not finish');
  }
}
const invariants = p => p.evaluate(KEY => {
  const S = __w3k.S, W = __w3k.W, errs = [], c = __w3k.counts();
  const t = Math.round(Date.UTC(...(d => [d.getFullYear(), d.getMonth(), d.getDate()])(new Date(Date.now() - 4 * 36e5))) / 864e5);
  const names = new Set(W.map(w => w.en));
  if (c.unseen + c.known + c.queued + c.inLesson + c.learning + c.mastered !== W.length) errs.push('counts do not add up');
  for (const k in S.p) {
    const v = S.p[k];
    if (!names.has(k)) errs.push('unknown word ' + k);
    if (!Array.isArray(v) || v.length !== 4 || v.some(x => !Number.isInteger(x))) { errs.push('bad entry ' + k); continue; }
    if (v[0] < -2 || v[0] > 7) errs.push('bad status ' + k);
    if (v[0] >= 1 && v[0] <= 6 && (v[1] < t - 400 || v[1] > t + 60)) errs.push('bad due ' + k + ' ' + (v[1] - t));
    if (v[2] < 0) errs.push('negative lapses ' + k);
  }
  for (const d in S.hist) if (!S.hist[d].every(x => Number.isInteger(x) && x >= 0)) errs.push('bad hist ' + d);
  let stored = null; try { stored = localStorage.getItem(KEY); } catch (e) { }
  if (stored !== null && stored !== JSON.stringify(S)) errs.push('storage differs from memory');
  return errs;
}, KEY);

async function suite(engine) {
  console.log(`\n=== ${engine} ===`);
  const browser = await pw[engine].launch();
  const errors = [];
  const open = async (vp, extra = {}, realTts = false) => {
    const ctx = await browser.newContext(Object.assign({ viewport: vp, reducedMotion: 'reduce' }, extra));
    await ctx.addInitScript(CLOCK); if (!realTts) await ctx.addInitScript(TTS);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await p.goto(URL); await p.evaluate(() => { __w3k.guard = 0; });
    return p;
  };
  const offs = new WeakMap();                              // страница → сдвиг времени в днях
  const reload = async p => {
    const o = offs.get(p) || 0;
    await p.reload(); await p.evaluate(o => { __w3k.guard = 0; if (o) __setOff(o); }, o);
    if (o) { const h = await p.$('.tabbar [data-v=home]'); if (h) await h.click(); }   // перерисовать уже со сдвигом
  };
  const day = async (p, n) => { offs.set(p, n); await p.evaluate(n => __setOff(n), n); };
  const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true }); await p.screenshot({ path: path.join(__dirname, 'shots', `${engine}-${name}.png`) }); } };
  const section = async (name, fn) => {
    if (ONLY && !name.includes(ONLY)) return;
    const f0 = failed, t0 = Date.now();
    try { await fn(); } catch (e) { failed++; console.log('    ✗ ' + name + ' crashed: ' + e.message.split('\n').slice(0, 4).join(' ⏎ ')); }
    console.log(`  ${failed === f0 ? '✓' : '✗'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)} c)`);
  };

  const p = await open({ width: 390, height: 844 }, { hasTouch: engine !== 'firefox', isMobile: engine === 'chromium' });

  await section('первый запуск: отбор → урок → итог', async () => {
    check(await p.evaluate(() => { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (e) { return false; } }), 'localStorage доступен для file://');
    check(!await p.$('.notice'), 'нет предупреждения о несохранении');
    await shot(p, '01-first-run');
    await p.click('[data-act=first-start]');
    check(await view(p) === 'sort', 'открылся отбор');
    await shot(p, '02-sort');
    await runSort(p, i => i % 3 === 0);
    const k = await p.evaluate(() => __w3k.ses && __w3k.ses.kind + ':' + __w3k.ses.tasks.length);
    check(k === 'learn:50', 'урок из 10 слов = 50 заданий, получено ' + k);
    await shot(p, '03-intro');
    await runSession(p, { wrong: 4 });
    check(await view(p) === 'summary', 'показан итог');
    await shot(p, '04-summary');
    const c = await counts(p);
    check(c.learning === 10 && c.inLesson === 0 && c.known === 5, 'после урока 10 слов в изучении: ' + JSON.stringify(c));
    check((await invariants(p)).length === 0, 'данные целы');
    await p.click('[data-act=nav][data-v=home]');
    check(await p.$('[data-act=more]'), 'на главной «на сегодня всё» и кнопка «ещё 5 слов»');
    await shot(p, '05-home-done');
  });

  await section('следующий день: повторение, повышение и понижение этапа', async () => {
    await day(p, 1); await reload(p);
    check((await counts(p)).due === 10, 'назавтра 10 слов к повторению');
    await shot(p, '06-home-day2');
    await p.click('[data-act=lesson]');
    check(await p.evaluate(() => __w3k.ses.kind === 'review' && __w3k.ses.tasks.every(t => t.t === 'er')), 'повторение этапа 1 — выбор перевода');
    await runSession(p, { wrong: 2, kbd: true });
    const r = await p.evaluate(() => { const S = __w3k.S, t = Math.max(...Object.keys(S.hist).map(Number)), a = Object.values(S.p).filter(x => x[0] >= 1); return { up: a.filter(x => x[0] === 2 && x[1] === t + 3).length, down: a.filter(x => x[0] === 1 && x[1] === t + 1 && x[2] === 1).length, h: S.hist[t] }; });
    check(r.up === 8 && r.down === 2, '8 слов → этап 2 (+3 дня), 2 слова остались на этапе 1 (+1 день): ' + JSON.stringify(r));
    check(r.h[1] === 10 && r.h[2] === 8 && r.h[3] === 2, 'статистика дня: 10 повторений, 8 верных, 2 ошибки');
  });

  await section('урок: «уже знаю», выход посреди урока, продолжение', async () => {
    await p.keyboard.press('Enter');                       // итог → новые слова
    check(await view(p) === 'sort', 'Enter на итоге ведёт к новым словам');
    await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft');
    let c = await counts(p); check(c.known === 6 && c.queued === 1, 'сортировка стрелками');
    await p.keyboard.press('z'); c = await counts(p); check(c.queued === 0, 'отмена клавишей Z');
    await runSort(p, i => i % 4 === 0);
    const n0 = await p.evaluate(() => __w3k.ses.tasks.length);
    await p.click('[data-act=intro-known]');
    check(n0 - await p.evaluate(() => __w3k.ses.tasks.length) === 4, '«уже знаю» убирает остальные задания слова');
    for (let i = 0; i < 12; i++) await answer(p);
    await p.keyboard.press('Escape');
    check(await view(p) === 'home', 'Escape закрывает занятие');
    check((await counts(p)).inLesson === 9, '9 слов остались «в уроке»');
    await p.click('[data-act=lesson]');
    if (await view(p) === 'sort') { check((await p.textContent('.ses-count')).trim() === '0 из 1', 'добирается ровно одно слово'); await runSort(p, () => false); }
    await runSession(p);
    c = await counts(p); check(c.inLesson === 0 && c.learning === 20, 'после второго дня 20 слов в изучении');
    check((await invariants(p)).length === 0, 'данные целы');
    await p.click('[data-act=nav][data-v=home]');
  });

  await section('расписание до конца: 1, 3, 7, 14, 30, 60 дней → «выучено»', async () => {
    const seen = [];
    for (let d = 2; d <= 130; d++) {
      await day(p, d);
      if (!await p.evaluate(() => __w3k.dueWords().length)) continue;
      await p.click('.tabbar [data-v=home]'); await p.click('[data-act=lesson]');
      const types = await p.evaluate(() => __w3k.ses.kind + ':' + [...new Set(__w3k.ses.tasks.map(t => t.t))].join('/'));
      seen.push(d + '=' + types);
      await runSession(p, { kbd: d % 2 === 0 });
      await p.click('[data-act=nav][data-v=home]');
    }
    const c = await counts(p);
    check(c.mastered === 20 && c.learning === 0, 'все 20 слов выучены: ' + JSON.stringify(c) + ' ' + seen.join(' '));
    check(seen.join(' ') === '2=review:er 4=review:re 5=review:re 11=review:listen 12=review:listen 25=review:type 26=review:type 55=review:type 56=review:type 115=review:type 116=review:type', 'дни и типы повторений: ' + seen.join(' '));
    check((await invariants(p)).length === 0, 'данные целы');
    await p.click('.tabbar [data-v=stats]'); await shot(p, '07-stats');
  });

  await section('проверка ввода и вариантов ответа на всех 3000 словах', async () => {
    const r = await p.evaluate(() => {
      const { W, checkTyped: T, distract, conflict } = __w3k, by = Object.fromEntries(W.map(w => [w.en, w])), o = {};
      o.typed = [T(by.make, 'do'), T(by.colour, ' Color '), T(by.organize, 'organise'), T(by.because, 'becuase'), T(by.because, 'becaus'), T(by.because, 'cat'), T(by.be, 'bx'),
        T(by['long-term'], 'long-term'), T(by['long-term'], 'long term'), T(by['old-fashioned'], 'oldfashioned'), T(by.i, 'I'), T(by.program, 'programme'), T(by.practice, 'practise'), T(by.watch, 'watch'), T(by.be, '')].join(',');
      const t0 = performance.now(); let bad = 0;
      for (const w of W) for (const h of [false, true]) { const d = distract(w, 3, h); if (d.length !== 3 || new Set(d).size !== 3 || d.some(x => x === w || conflict(x, w)) || (conflict(d[0], d[1]) || conflict(d[0], d[2]) || conflict(d[1], d[2]))) bad++; }
      o.bad = bad; o.ms = Math.round(performance.now() - t0);
      o.empty = W.filter(w => !w.en || !w.ru || /[A-Za-z]/.test(w.ru)).length; o.uniq = new Set(W.map(w => w.en)).size;
      return o;
    });
    check(r.typed === 'syn,ok,ok,near,near,bad,bad,ok,ok,ok,ok,ok,ok,ok,empty', 'проверка написания: ' + r.typed);
    check(r.bad === 0, 'для каждого слова находятся 3 неконфликтующих варианта (6000 наборов за ' + r.ms + ' мс)');
    check(r.empty === 0 && r.uniq === 3000, 'словарь: 3000 уникальных слов, переводы без латиницы и пустот');
  });

  await section('перенос прогресса: файл, текст, сброс, ошибки', async () => {
    await p.click('.tabbar [data-v=settings]'); await shot(p, '08-settings');
    await p.click('[data-act=export]');
    const txt = await p.inputValue('#exp-text');
    let file = null;
    try { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('[data-act=export-file]')]); file = path.join(require('os').tmpdir(), engine + '-' + dl.suggestedFilename()); await dl.saveAs(file); } catch (e) { }
    check(file && JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')).data) === JSON.stringify(JSON.parse(txt).data), 'файл скачивается и совпадает с текстом');
    await p.keyboard.press('Escape'); check(!await p.$('.modal'), 'Escape закрывает окно');
    await p.click('[data-act=reset]'); await p.click('[data-act=reset-yes]');
    check((await counts(p)).unseen === 3000, 'сброс очищает прогресс');
    await p.click('.tabbar [data-v=settings]'); await p.click('[data-act=import]');
    await p.fill('#imp-text', '{"broken":'); await p.click('[data-act=import-apply]');
    check((await p.textContent('#imp-msg')).includes('повреждён'), 'повреждённый текст — понятная ошибка');
    await p.fill('#imp-text', '{"app":"other"}'); await p.click('[data-act=import-apply]');
    check((await p.textContent('#imp-msg')).includes('не файл прогресса'), 'чужой файл — понятная ошибка');
    await p.fill('#imp-text', '{"app":"words3000","data":{"p":{"__proto__":[1,1,1,1],"nosuchword":[1,1,1,1],"be":[99,0,0,0],"of":"x","to":[3,"5",null,2]},"set":{"perDay":9999,"theme":"<script>"},"hist":{"abc":[1],"5":[-3,2.6]}}}'); await p.click('[data-act=import-apply]');
    const s = await p.evaluate(() => ({ p: __w3k.S.p, per: __w3k.S.set.perDay, th: __w3k.S.set.theme, h: __w3k.S.hist }));
    check(JSON.stringify(s.p) === '{"to":[3,5,0,2]}' && s.per === 50 && s.th === 'auto' && JSON.stringify(s.h) === '{"5":[0,3,0,0,0]}', 'мусор в загружаемых данных отбрасывается: ' + JSON.stringify(s));
    await p.click('.tabbar [data-v=settings]'); await p.click('[data-act=import]');
    if (file) { await p.setInputFiles('#imp-file', file); await p.waitForFunction(() => __w3k.counts().mastered === 20, null, { timeout: 5000 }); }
    else { await p.fill('#imp-text', txt); await p.click('[data-act=import-apply]'); }
    await reload(p);
    const c = await counts(p); check(c.mastered === 20 && c.known > 0, 'прогресс восстановлен и пережил перезагрузку');
  });

  await section('словарь и свободная тренировка', async () => {
    await p.click('.tabbar [data-v=dict]');
    await p.fill('#dict-q', 'яблоко'); check((await p.$$eval('.drow .en', e => e.map(x => x.textContent))).join() === 'apple', 'поиск по переводу');
    await p.fill('#dict-q', 'APPLE'); await p.click('.drow'); await p.click('[data-act=w-edit]');
    await p.fill('#tr-inp', '<b>яблоко</b> & "фрукт"'); await p.keyboard.press('Enter');
    check(await p.evaluate(() => __w3k.S.tr.apple) === '<b>яблоко</b> & "фрукт"' && await p.$eval('.modal .ru', e => e.children.length === 0 && e.textContent.includes('<b>')), 'свой перевод сохраняется и выводится как текст, не как разметка');
    await p.click('[data-act=w-learn]'); check(await p.evaluate(() => __w3k.S.p.apple[0]) === -2, 'слово поставлено в очередь из словаря');
    check(await p.$eval('.drow .tr', e => e.children.length === 0), 'в списке перевод тоже экранирован');
    await shot(p, '09-dict');
    await p.click('.drow'); await p.click('[data-act=w-edit]'); await p.fill('#tr-inp', ''); await p.keyboard.press('Enter');
    check(await p.evaluate(() => __w3k.S.tr.apple) === undefined, 'пустой перевод возвращает исходный');
    await p.click('[data-act=modal-close]');
    for (const f of ['learn', 'done', 'known', 'queue', 'new', 'all']) { await p.fill('#dict-q', ''); await p.click(`[data-act=dict-f][data-f=${f}]`); const n = +(await p.textContent(`[data-f=${f}] b`)); const rows = await p.$$eval('.drow', e => e.length); check(rows === Math.min(n, 80), `фильтр ${f}: ${rows} строк при ${n} словах`); }
    await p.click('[data-act=dict-more]'); check(await p.$$eval('.drow', e => e.length) === 280, '«показать ещё» добавляет 200 строк');
    await p.click('.tabbar [data-v=home]'); await p.click('[data-act=nav][data-v=practice]'); await shot(p, '10-practice');
    for (const mode of ['card', 'er', 're', 'listen', 'type', 'mix']) {
      await p.click(`[data-act=prac][data-k=mode][data-v=${mode}]`); await p.click('[data-act=prac][data-k=n][data-v="10"]'); await p.click('[data-act=prac-start]');
      const types = await p.evaluate(() => [...new Set(__w3k.ses.tasks.map(t => t.t))].join('/'));
      check(mode === 'mix' ? types.length > 0 : types === mode, `тренировка «${mode}»: ${types}`);
      const before = JSON.stringify(await p.evaluate(() => __w3k.S.p));
      await runSession(p, { kbd: mode !== 'type', wrong: 2 });
      check(await view(p) === 'summary' && JSON.stringify(await p.evaluate(() => __w3k.S.p)) === before, `«${mode}» завершается и не меняет расписание`);
      await p.click('[data-act=nav][data-v=home]'); await p.click('[data-act=nav][data-v=practice]');
    }
    await p.click('[data-act=prac][data-k=src][data-v=known]');
    const kb = (await counts(p)).known; await p.click('[data-act=prac-start]'); await runSession(p, { wrong: 3 });
    check(kb - (await counts(p)).known === 3, 'проверка «знаю»: 3 ошибки → 3 слова в очередь');
    await p.click('[data-act=nav][data-v=home]');
    check((await invariants(p)).length === 0, 'данные целы');
  });

  await section('исправленные ошибки версии 1.0', async () => {
    const q = await open({ width: 390, height: 844 });
    await q.click('[data-act=first-start]');
    // свайпы: прерванный жест не должен засчитываться
    const sc = await q.$eval('#scard', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 30 }; });
    const drag = async (dx, cancel) => { await q.mouse.move(sc.x, sc.y); await q.mouse.down(); await q.mouse.move(sc.x + dx, sc.y, { steps: 5 }); if (cancel) await q.evaluate(() => document.querySelector('#scard').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))); await q.mouse.up(); };
    await drag(160, true); let cs = await counts(q); check(cs.known === 0 && cs.queued === 0, 'прерванный свайп ничего не отмечает');
    await drag(160); cs = await counts(q); check(cs.known === 1, 'свайп вправо — «знаю»');
    await drag(-160); cs = await counts(q); check(cs.queued === 1, 'свайп влево — «учить»');
    await drag(40); cs = await counts(q); check(cs.known === 1 && cs.queued === 1, 'короткое движение не считается свайпом');
    await runSort(q, () => false);
    // щелчок мышью по «Прослушать», затем Enter — должно перейти дальше, а не нажать кнопку ещё раз
    if (await q.$('[data-act=say]')) { const i9 = await q.evaluate(() => __w3k.ses.i); await q.click('[data-act=say]'); await q.keyboard.press('Enter'); check(await q.evaluate(() => __w3k.ses.i) === i9 + 1, 'после щелчка по «Прослушать» Enter ведёт дальше'); }
    // фокус на «Уже знаю» + Enter
    let w0 = (await st(q)).en; await q.focus('[data-act=intro-known]'); await q.keyboard.press('Enter');
    check(await q.evaluate(w => __w3k.S.p[w][0] === -1, w0), 'Enter на кнопке «Уже знаю» в фокусе нажимает именно её');
    // зажатый Enter
    let i0 = await q.evaluate(() => __w3k.ses.i); await q.keyboard.down('Enter'); await q.keyboard.down('Enter'); await q.keyboard.down('Enter'); await q.keyboard.up('Enter');
    check(await q.evaluate(() => __w3k.ses.i) - i0 === 1, 'зажатый Enter листает только одно задание');
    let c; while ((c = await st(q)).t === 'intro') await q.click('[data-act=intro-next]');
    // счётчик после ошибки
    const before = await q.textContent('#pcount');
    await q.click(`.opt[data-i="${(c.opts.indexOf(c.en) + 1) % 4}"]`);
    check(before === await q.textContent('#pcount'), 'счётчик «ещё N» не прыгает вверх после ошибки: ' + before + ' → ' + await q.textContent('#pcount'));
    // двойное нажатие «Дальше»
    await q.evaluate(() => { __w3k.guard = 300; }); await q.waitForTimeout(350);
    const bb = await q.$eval('[data-act=next]', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await q.mouse.click(bb.x, bb.y); await q.mouse.click(bb.x, bb.y);
    c = await st(q); check(!c.ans, 'второе касание «Дальше» не отвечает на следующее задание');
    // двойное нажатие на вариант не пролистывает разбор ошибки
    await q.waitForTimeout(350);
    const ob = await q.$eval(`.opt[data-i="${(c.opts.indexOf(c.en) + 1) % 4}"]`, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    i0 = await q.evaluate(() => __w3k.ses.i); await q.mouse.click(ob.x, ob.y); await q.mouse.click(ob.x, ob.y); await q.mouse.click(ob.x, ob.y + 60);
    check(await q.evaluate(() => __w3k.ses.i) === i0 && (await st(q)).ans, 'двойное касание варианта не пропускает показ правильного ответа');
    await q.waitForTimeout(350); await q.click('[data-act=next]'); check(await q.evaluate(() => __w3k.ses.i) === i0 + 1, 'после паузы «Дальше» работает как обычно');
    await q.evaluate(() => { __w3k.guard = 0; });
    // мышь + клавиатура
    c = await st(q); i0 = await q.evaluate(() => __w3k.ses.i); await q.click(`.opt[data-i="${c.opts.indexOf(c.en)}"]`); await q.keyboard.press('Enter');
    check(await q.evaluate(() => __w3k.ses.i) > i0, 'клик по варианту, затем Enter — переход дальше');
    // «Нет звука»
    while ((c = await st(q)) && c.t !== 'listen') await answer(q);
    if (c) { await q.click('[data-act=no-sound]'); const c2 = await st(q); check(c2.t === 'er' && c2.en === c.en && await q.$('.word'), '«Нет звука» показывает слово вместо задания на слух'); await answer(q); }
    else check(false, 'не дошли до задания на слух');
    await q.keyboard.press('Escape');
    // «на слух» выбран, а звук выключен
    await q.evaluate(() => { __w3k.S.p.be = [3, 0, 0, 0]; __w3k.S.p.of = [3, 0, 0, 0]; });
    await q.click('[data-act=nav][data-v=practice]'); await q.click('[data-act=prac][data-k=mode][data-v=listen]');
    await q.evaluate(() => { __w3k.S.set.audio = false; }); await q.click('[data-act=prac-start]');
    check(await q.evaluate(() => __w3k.ses.tasks.every(t => t.t !== 'listen')), 'тренировка «на слух» при выключенном звуке не даёт заданий на слух');
    await q.keyboard.press('Escape');
    // список кончился во время отбора для урока
    await q.evaluate(() => { const S = __w3k.S; __w3k.W.forEach((w, i) => { if (i < 2997) S.p[w.en] = [-1, 0, 0, 0]; else delete S.p[w.en]; }); S.hist = {}; });
    await q.click('[data-act=lesson]'); check(await view(q) === 'sort', 'отбор открылся для последних трёх слов');
    await q.click('[data-act=sort-learn]'); await q.click('[data-act=sort-learn]'); await q.click('[data-act=sort-know]');
    check(await q.$('[data-act=sort-finish]'), 'показано «все слова разобраны»');
    await q.click('[data-act=sort-finish]');
    check(await q.evaluate(() => __w3k.view === 'session' && __w3k.ses.kind === 'learn' && __w3k.ses.tasks.filter(t => t.t === 'intro').length === 2), 'урок начинается с двумя отобранными словами');
    // этот урок проходим с включённой защитой от двойных нажатий и обычными паузами
    await q.evaluate(() => { __w3k.guard = 300; });
    for (let n = 0; n < 200 && await view(q) === 'session'; n++) { await q.waitForTimeout(320); await answer(q, { wrong: n === 3 }); }
    await q.evaluate(() => { __w3k.guard = 0; });
    const cc = await counts(q); check(cc.unseen === 0 && cc.learning === 2, 'последние слова выучены (с защитой от двойных нажатий): ' + JSON.stringify(cc));
    await q.click('[data-act=nav][data-v=home]');
    check(!await q.$('[data-act=lesson]') && !await q.$('[data-act=more]'), 'когда слов не осталось, главная не предлагает новый урок');
    await q.context().close();
  });

  await section('озвучка: сбой, тишина, настоящий движок без голосов', async () => {
    const toListen = async q => { let c; for (let n = 0; n < 300 && (c = await st(q)) && !(c.t === 'listen' && !c.ans); n++) await answer(q); return c; };
    for (const mode of ['error', 'silent']) {
      const q = await open({ width: 390, height: 844 });
      await q.click('[data-act=first-start]'); await runSort(q, () => false);
      const c = await toListen(q); check(!!c, mode + ': дошли до задания на слух при исправной озвучке');
      await q.evaluate(m => { window.__ttsMode = m; __w3k.ttsWait = 600; }, mode);
      await answer(q); await answer(q);                    // ответ озвучивается → сбой обнаружен
      await q.waitForFunction(() => __w3k.ttsDead, null, { timeout: 3000 }).catch(() => { });
      check(await q.evaluate(() => __w3k.ttsDead), mode + ': сбой озвучки замечен');
      let listens = 0; for (let n = 0; n < 300 && await view(q) === 'session'; n++) { const x = await st(q); if (x && x.t === 'listen') listens++; await answer(q); }
      check(listens === 0 && (await counts(q)).learning === 10, mode + ': оставшиеся задания на слух заменены, урок пройден');
      await q.click('[data-act=nav][data-v=home]'); await q.click('.tabbar [data-v=settings]');
      check((await q.textContent('.page')).includes('Озвучка сейчас не работает'), mode + ': в настройках сказано, что озвучка не работает');
      await q.evaluate(() => { window.__ttsMode = 'ok'; }); await q.click('[data-act=voice-test]');
      await q.waitForFunction(() => !__w3k.ttsDead, null, { timeout: 3000 }).catch(() => { });
      check(!await q.evaluate(() => __w3k.ttsDead) && !(await q.textContent('.page')).includes('Озвучка сейчас не работает'), mode + ': после удачной проверки голоса задания на слух возвращаются');
      await q.context().close();
    }
    // без подмены: как ведёт себя сам движок
    const q = await open({ width: 390, height: 844 }, {}, true);
    await q.click('[data-act=first-start]'); await runSort(q, () => false);
    let waited = false, kept = 0;
    for (let n = 0; n < 400 && await view(q) === 'session'; n++) {
      await q.waitForTimeout(40);
      let c = await st(q);
      if (c && c.t === 'listen' && !c.ans) {
        if (!waited) { waited = true; await q.waitForFunction(() => __w3k.cur.task.t !== 'listen', null, { timeout: 4600 }).catch(() => { }); }
        if ((await st(q)).t === 'listen') kept++;
      }
      await answer(q);
    }
    const dead = await q.evaluate(() => __w3k.ttsDead);
    console.log(`    настоящий синтез речи в ${engine}: ${dead ? 'не работает → задания на слух заменены выбором перевода' : 'работает → заданий на слух пройдено: ' + kept}`);
    check(dead ? kept === 0 : kept > 0, 'настоящий движок: задания на слух ' + (dead ? 'заменены' : 'сохранены') + ' (осталось на слух: ' + kept + ')');
    check((await counts(q)).learning === 10, 'настоящий движок: урок проходится до конца');
    await q.context().close();
  });

  await section('сохранность: 25 циклов «действие → перезагрузка»', async () => {
    let lost = 0;
    for (let i = 0; i < 25; i++) {
      const q = await open({ width: 390, height: 844 });
      await q.click('[data-act=first-start]'); for (let k = 0; k < 10; k++) await q.click('[data-act=sort-learn]');
      await q.reload();
      if (await q.evaluate(() => __w3k.counts().inLesson) !== 10) lost++;
      await q.context().close();
    }
    check(lost === 0, 'после перезагрузки прогресс на месте во всех 25 циклах (потеряно: ' + lost + ')');
  });

  await section('переход с версии 1.0: прогресс читается без потерь', async () => {
    const old = path.join(ROOT, 'versions', 'english-words-v1.0.html');
    if (!fs.existsSync(old)) { console.log('    (файл версии 1.0 не найден — пропущено)'); return; }
    const q = await open({ width: 390, height: 844 });
    await q.goto('file://' + old);
    await q.click('[data-act=first-start]'); await runSort(q, i => i % 2 === 0); await runSession(q, { wrong: 3 });
    await q.click('[data-act=nav][data-v=home]'); await q.click('.tabbar [data-v=dict]'); await q.fill('#dict-q', 'apple'); await q.click('.drow'); await q.click('[data-act=w-edit]'); await q.fill('#tr-inp', 'яблочко'); await q.keyboard.press('Enter'); await q.click('[data-act=modal-close]');
    await q.click('.tabbar [data-v=settings]'); await q.click('[data-act=step][data-d="1"]'); await q.click('[data-act=theme][data-v=dark]');
    const raw = await q.evaluate(k => localStorage.getItem(k), KEY);
    const exported = await q.evaluate(() => JSON.stringify({ app: 'words3000', v: 1, data: __w3k.S }));
    const pick = s => { const d = JSON.parse(s); return JSON.stringify([d.p, d.tr, d.hist, d.set, d.first, d.backup, d.started, d.extra]); };
    // 1) новый файл открыт в том же браузере: данные уже лежат в хранилище
    await q.goto(URL); await q.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, raw]); await reload(q);
    check(pick(await q.evaluate(() => JSON.stringify(__w3k.S))) === pick(raw), 'версия 1.1 читает хранилище версии 1.0 один в один');
    check(await q.evaluate(() => document.documentElement.dataset.theme) === 'dark' && await q.evaluate(() => __w3k.S.set.perDay) === 11, 'настройки сохранились');
    // 2) перенос через файл прогресса
    await q.click('.tabbar [data-v=settings]'); await q.click('[data-act=reset]'); await q.click('[data-act=reset-yes]');
    await q.click('.tabbar [data-v=settings]'); await q.click('[data-act=import]'); await q.fill('#imp-text', exported); await q.click('[data-act=import-apply]');
    check(pick(await q.evaluate(() => JSON.stringify(__w3k.S))) === pick(raw), 'файл прогресса из версии 1.0 загружается в 1.1 без потерь');
    // 3) чистая установка (например, программа для Windows): загрузка прямо с первого экрана
    const f = await open({ width: 390, height: 844 });
    check(!!await f.$('[data-act=first-start]') && !!await f.$('.card [data-act=import]'), 'на первом экране есть «У меня уже есть сохранённый прогресс»');
    await f.click('.card [data-act=import]'); await f.fill('#imp-text', exported); await f.click('[data-act=import-apply]');
    check(pick(await f.evaluate(() => JSON.stringify(__w3k.S))) === pick(raw) && !await f.$('[data-act=first-start]'), 'прогресс загружается с первого экрана, приложение сразу открывает план');
    await f.reload(); check(pick(await f.evaluate(() => JSON.stringify(__w3k.S))) === pick(raw), 'и сохраняется после перезапуска');
    await f.context().close();
    await day(q, 1); await q.click('.tabbar [data-v=home]');
    check((await counts(q)).due === 10, 'на следующий день слова из версии 1.0 приходят на повторение');
    await q.click('[data-act=lesson]'); await runSession(q); check((await invariants(q)).length === 0, 'после занятия в 1.1 данные целы');
    await q.context().close();
  });

  await section('без хранилища (окно предпросмотра)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); const e2 = [];
    q.on('pageerror', e => e2.push(e.message));
    const html = fs.readFileSync(FILE, 'utf8').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    await q.setContent(`<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:100vw;height:100vh" srcdoc="${html}"></iframe>`);
    const fr = q.frames()[1];
    await fr.waitForSelector('[data-act=first-start]');
    check(await fr.evaluate(() => { try { localStorage.getItem('x'); return false; } catch (e) { return true; } }), 'в изолированном окне хранилище действительно недоступно');
    check(await fr.$('.notice'), 'показано предупреждение, что прогресс не сохранится');
    await fr.evaluate(() => { __w3k.guard = 0; }); await fr.click('[data-act=first-start]'); await fr.click('[data-act=sort-learn]');
    check(await fr.evaluate(() => __w3k.counts().queued) === 1 && e2.length === 0, 'приложение работает в памяти без ошибок: ' + e2.join('; '));
    await ctx.close();
  });

  await section('граница суток 4:00, серия, часовые пояса и перевод часов', async () => {
    // 14.03.2027 — переход на летнее время в Нью-Йорке, 04.04.2027 — на зимнее в Окленде
    for (const [tz, y, m, d] of [['Europe/Moscow', 2027, 2, 13], ['America/New_York', 2027, 2, 13], ['Pacific/Auckland', 2027, 3, 3], ['Asia/Kolkata', 2026, 11, 31]]) {
      const q = await open({ width: 390, height: 844 }, { timezoneId: tz });
      const at = async (dd, h, mi) => { offs.set(q, await q.evaluate(a => __setNow(...a), [y, m, d + dd, h, mi])); if (await q.$('.tabbar [data-v=home]')) await q.click('.tabbar [data-v=home]'); };
      const snap = () => q.evaluate(() => ({ due: __w3k.counts().due, learned: __w3k.plan().learned, streak: document.querySelector('.streak').textContent.trim(), days: Object.keys(__w3k.S.hist).length }));
      await at(0, 23, 30); await reload(q);
      await q.click('[data-act=first-start]'); await runSort(q, () => false); await runSession(q); await q.click('[data-act=nav][data-v=home]');
      let s = await snap(); check(s.due === 0 && s.learned === 10 && s.streak === '1 день подряд', `${tz} 23:30: урок засчитан сегодняшнему дню ${JSON.stringify(s)}`);
      await at(1, 0, 30); s = await snap(); check(s.due === 0 && s.learned === 10, `${tz} 00:30: после полуночи день ещё тот же ${JSON.stringify(s)}`);
      await at(1, 3, 45); s = await snap(); check(s.due === 0 && s.learned === 10 && s.streak === '1 день подряд', `${tz} 03:45: всё ещё тот же день ${JSON.stringify(s)}`);
      await at(1, 4, 15); s = await snap(); check(s.due === 10 && s.learned === 0 && s.streak === '1 день подряд', `${tz} 04:15: новый день, слова пришли на повторение, серия цела ${JSON.stringify(s)}`);
      await reload(q); s = await snap(); check(s.due === 10 && s.days === 1, `${tz}: то же после перезагрузки ${JSON.stringify(s)}`);
      await at(2, 3, 0); s = await snap(); check(s.streak === '1 день подряд', `${tz} следующая ночь 03:00: серия ещё не сгорела ${JSON.stringify(s)}`);
      await at(2, 12, 0); s = await snap(); check(s.due === 10 && s.streak === 'Серия: 0', `${tz} через день: серия сброшена, слова ждут ${JSON.stringify(s)}`);
      await q.click('[data-act=lesson]'); await runSession(q); await q.click('[data-act=nav][data-v=home]');
      s = await snap(); check(s.due === 0 && s.streak === '1 день подряд' && s.days === 2, `${tz}: после занятия серия начинается заново ${JSON.stringify(s)}`);
      await q.context().close();
    }
  });

  await section('вёрстка: нет горизонтальной прокрутки, тёмная тема', async () => {
    for (const [w, h] of [[320, 568], [390, 844], [768, 1024], [1280, 800]]) {
      const q = await open({ width: w, height: h }, { colorScheme: w === 390 ? 'dark' : 'light' });
      await q.evaluate(() => { const S = __w3k.S, t = Math.round(Date.now() / 864e5); __w3k.W.slice(0, 400).forEach((x, i) => { S.p[x.en] = i % 3 ? [-1, 0, 0, 0] : [1 + i % 6, t - 2 + i % 9, 0, t - 5]; }); S.started = true; for (let d = t - 30; d < t; d++) S.hist[d] = [10, 12, 40, 5, 0]; });
      const bad = [];
      const nav = w >= 760 ? '.tabs' : '.tabbar';
      for (const v of ['home', 'dict', 'stats', 'settings']) { await q.click(`${nav} [data-v=${v}]`); const o = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o > 0) bad.push(v + '+' + o); if (w === 390 || w === 1280) await shot(q, `${w}-${v}`); }
      await q.click(`${nav} [data-v=home]`); await q.click('[data-act=nav][data-v=practice]'); if (await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) > 0) bad.push('practice');
      await q.click(`${nav} [data-v=home]`); await q.click('[data-act=lesson]');
      for (let i = 0; i < 14 && await view(q) === 'session'; i++) { const c = await st(q); if (c && !c.ans) { const o = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o > 0) bad.push(c.t + '+' + o); const clipped = await q.evaluate(() => [...document.querySelectorAll('.opt span,.word,.ru')].filter(e => e.scrollWidth > e.clientWidth + 1).length); if (clipped) bad.push(c.t + ' clipped'); if (i < 2 && (w === 390 || w === 1280)) await shot(q, `${w}-task-${c.t}`); } await answer(q, { wrong: i % 5 === 0 }); }
      check(bad.length === 0, `${w}×${h}: всё помещается` + (bad.length ? ' — ' + bad.join(', ') : ''));
      if (w === 390) check(await q.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'тёмная тема включается по настройке системы');
      await q.context().close();
    }
  });

  await section('случайные действия: 45 дней', async () => {
    const q = await open({ width: 390, height: 844 });
    let seed = 20261115; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const log = { lessons: 0, answers: 0, exits: 0, sorts: 0 };
    for (let d = 0; d < 45; d++) {
      await day(q, d);
      if (rnd() < 0.12) continue;                          // пропущенный день
      if (await view(q) !== 'home') await q.evaluate(() => document.querySelector('[data-act=close-session],[data-act=close-sort],[data-act=nav][data-v=home]').click());
      await q.click('.tabbar [data-v=home]');
      if (rnd() < 0.25) { await q.click('.tabbar [data-v=settings]'); const r = rnd(); await q.click(r < .3 ? '[data-act=toggle][data-k=typing]' : r < .6 ? '[data-act=toggle][data-k=audio]' : r < .8 ? '[data-act=step][data-d="1"]' : '[data-act=step][data-d="-1"]'); await q.click('.tabbar [data-v=home]'); }
      if (rnd() < 0.2) { await q.click('.tabbar [data-v=dict]'); const rows = await q.$$('.drow'); await rows[Math.floor(rnd() * rows.length)].click(); const acts = await q.$$('.modal-actions .btn'); await acts[Math.floor(rnd() * acts.length)].click(); await q.click('.tabbar [data-v=home]'); }
      if (rnd() < 0.15 && await q.$('[data-act=sort]')) { await q.click('[data-act=sort]'); if (await view(q) === 'sort') { const n = 5 + Math.floor(rnd() * 40); for (let i = 0; i < n && await q.$('[data-act=sort-know]'); i++) { const r = rnd(); await q.click(r < .5 ? '[data-act=sort-know]' : r < .9 ? '[data-act=sort-learn]' : '[data-act=sort-undo]:not([disabled]),[data-act=sort-know]'); log.sorts++; } await q.click('[data-act=close-sort]'); } }
      const btn = await q.$('[data-act=lesson],[data-act=more]');
      if (!btn) continue;
      await btn.click(); log.lessons++;
      let guard = 0;
      while (await view(q) !== 'home' && guard++ < 1500) {
        const v = await view(q);
        if (v === 'sort') { if (!await q.$('[data-act=sort-know]')) { await q.click('[data-act=sort-finish]'); continue; } const r = rnd(); if (r < .02) { await q.click('[data-act=close-sort]'); log.exits++; } else await q.click(r < .45 ? '[data-act=sort-know]' : '[data-act=sort-learn]'); log.sorts++; }
        else if (v === 'summary') { const b = await q.$$('.sum .modal-actions .btn'); await b[rnd() < .7 ? 0 : b.length - 1].click(); }
        else { const c = await st(q); const r = rnd(); if (r < .012) { await q.click('[data-act=close-session]'); log.exits++; } else if (c && c.t === 'intro' && r < .08) await q.click('[data-act=intro-known]'); else if (c && c.t === 'listen' && !c.ans && r < .1) await q.click('[data-act=no-sound]'); else { await answer(q, { wrong: rnd() < .22, kbd: rnd() < .5 }); log.answers++; } }
      }
      const inv = await invariants(q);
      if (inv.length) { check(false, `день ${d}: ${inv.slice(0, 3).join('; ')}`); break; }
      if (d % 15 === 7) { const txt = await q.evaluate(() => JSON.stringify({ app: 'words3000', v: 1, data: __w3k.S })); await reload(q); check(await q.evaluate(t => JSON.stringify({ app: 'words3000', v: 1, data: __w3k.S }) === t, txt), `день ${d}: после перезагрузки состояние то же`); }
    }
    const c = await counts(q);
    check(log.answers > 500, `сыграно: ${log.lessons} занятий, ${log.answers} ответов, ${log.sorts} сортировок, ${log.exits} выходов посреди; итог ${JSON.stringify(c)}`);
    console.log(`    ${log.lessons} занятий, ${log.answers} ответов, ${log.sorts} сортировок, ${log.exits} выходов; в изучении ${c.learning}, выучено ${c.mastered}, знаю ${c.known}`);
    await q.context().close();
  });

  await section('скорость на полном словаре', async () => {
    const q = await open({ width: 390, height: 844 });
    const t0 = Date.now(); await q.reload(); await q.waitForSelector('.page'); const load = Date.now() - t0; await q.evaluate(() => { __w3k.guard = 0; });
    await q.evaluate(() => { const S = __w3k.S, t = Math.round(Date.now() / 864e5); __w3k.W.forEach((x, i) => { S.p[x.en] = i % 2 ? [7, 0, 0, t - 200] : [1 + i % 6, t + i % 50 - 1, i % 4, t - 100]; }); S.started = true; for (let d = t - 400; d < t; d++) S.hist[d] = [10, 60, 200, 20, 3]; });
    const time = sel => q.evaluate(sel => { const t = performance.now(); document.querySelector(sel).click(); return +(performance.now() - t).toFixed(1); }, sel);
    const m = {};
    m.dict = await time('.tabbar [data-v=dict]'); m.stats = await time('.tabbar [data-v=stats]'); m.home = await time('.tabbar [data-v=home]');
    m.search = await q.evaluate(() => { document.querySelector('.tabbar [data-v=dict]').click(); const i = document.querySelector('#dict-q'); const t = performance.now(); for (const s of ['a', 'ab', 'abo', 'abou', 'about']) { i.value = s; i.dispatchEvent(new Event('input', { bubbles: true })); } return +((performance.now() - t) / 5).toFixed(1); });
    m.save = await q.evaluate(KEY => { const t = performance.now(); const s = JSON.stringify(__w3k.S); try { localStorage.setItem(KEY, s); } catch (e) { } return [+(performance.now() - t).toFixed(1), Math.round(s.length / 1024)]; }, KEY);
    await q.click('.tabbar [data-v=home]'); m.start = await time('[data-act=lesson]');
    m.task = await q.evaluate(() => { let n = 0, sum = 0, max = 0; while (__w3k.view === 'session' && n < 40) { const c = __w3k.cur; if (c.answered) { const t = performance.now(); document.querySelector('[data-act=next]').click(); const d = performance.now() - t; sum += d; max = Math.max(max, d); n++; continue; } if (c.task.t === 'type') { document.querySelector('#tinp').value = c.task.w.en; document.querySelector('#tsubmit').click(); } else document.querySelector('.opt[data-i="' + c.opts.indexOf(c.task.w) + '"]').click(); } return [+(sum / n).toFixed(1), +max.toFixed(1)]; });
    console.log(`    загрузка ${load} мс · главная ${m.home} · словарь ${m.dict} · статистика ${m.stats} · поиск ${m.search} · запуск повторения ${m.start} · задание ${m.task[0]} (макс. ${m.task[1]}) · сохранение ${m.save[0]} мс (${m.save[1]} КБ)`);
    check(Math.max(m.home, m.dict, m.stats, m.search, m.start, m.task[1], m.save[0]) < 100, 'любое действие быстрее 100 мс при заполненном словаре: ' + JSON.stringify(m));
    await q.context().close();
  });

  check(errors.length === 0, 'ошибок JavaScript нет' + (errors.length ? ': ' + [...new Set(errors)].slice(0, 5).join(' | ') : ''));
  await browser.close();
}

(async () => {
  const engines = ENGINES.length ? ENGINES : ['chromium', 'firefox', 'webkit'];
  const html = fs.readFileSync(FILE, 'utf8');
  console.log(`Файл: ${FILE} (${Math.round(html.length / 1024)} КБ), версия ${(html.match(/Версия ([\d.]+)/) || [])[1]}`);
  for (const e of engines) await suite(e);
  console.log(`\nИтог: ${passed} проверок пройдено, ${failed} не пройдено`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
