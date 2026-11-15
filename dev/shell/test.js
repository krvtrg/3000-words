// Проверки оболочки: автообновление, откат, выбор версии, защита хранилища.
// Вместо GitHub — подставной сервер на этом же компьютере; «новые версии» делаются из 1.2 заменой номера.
//
//   xvfb-run -a node test.js [chromium|firefox|webkit ...] [--only=<часть названия>] [--shots=<папка>]
//
// Chromium запускается так же, как окно программы (--app); Firefox и WebKit — как файл в обычном браузере.
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const pw = require(path.join(__dirname, '..', 'tests', 'node_modules', 'playwright'));
const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const engines = args.filter(a => !a.startsWith('--')); if (!engines.length) engines.push('chromium', 'firefox', 'webkit');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
const SHOTS = (args.find(a => a.startsWith('--shots=')) || '').slice(8);      // папка для снимков экрана
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const cardShot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.locator('#ver-card').screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const TMP = fs.mkdtempSync(path.join(os.homedir(), '.cache', 'shell-test-'));
const KEY = 'words3000:v1', MARK = 'words3000:shell';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (c, msg) => { if (c) passed++; else { failed++; console.log('    ✗ ' + msg); } };

/* ---------- версии ---------- */
// текущая версия приложения — из dev/src/build.py: раздел с настоящей оболочкой проверяет именно её
const CUR = fs.readFileSync(path.join(ROOT, 'dev', 'src', 'build.py'), 'utf8').match(/^VERSION = '([\d.]+)'/m)[1], CURRE = CUR.replace(/\./g, '\\.');
const real = v => fs.readFileSync(path.join(ROOT, 'versions', `english-words-v${v}.html`));
const fake = v => Buffer.from(real('1.2').toString('utf8').replace('Версия 1.2', 'Версия ' + v), 'utf8');
const fake13 = v => Buffer.from(real(CUR).toString('utf8').replace(`name="app-version" content="${CUR}"`, `name="app-version" content="${v}"`).replace(`const VER='${CUR}'`, `const VER='${v}'`).replace('Версия ' + CUR, 'Версия ' + v), 'utf8');   // «новая версия» с разделом выбора версии
const broken = v => Buffer.from(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>сломанная</title></head><body><p>Версия ${v}</p><!--${'x'.repeat(1200)}--><script>throw new Error('сломанная версия')</script></body></html>`, 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function manifest(files, latest, extra = {}) {
  return Buffer.from(JSON.stringify({ latest, versions: Object.keys(files).map(v => Object.assign({ v, file: `english-words-v${v}.html`, sha256: sha(files[v]), size: files[v].length, date: '2026-11-15', notes: 'Версия ' + v, data: 1, shell: 1 }, extra[v] || {})) }));
}

/* ---------- подставной сервер ---------- */
function server() {
  const s = { files: {}, hits: {}, down: false, mangle: null };
  s.http = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0].slice(1));
    s.hits[name] = (s.hits[name] || 0) + 1;
    if (s.down) { req.socket.destroy(); return; }
    let body = s.files[name];
    if (!body) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end('нет'); return; }
    if (s.mangle) body = s.mangle(name, body);
    if (body === 'hang') return;                                       // не отвечаем вовсе
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=300' });
    res.end(body);
  });
  s.set = (versions, latest, extra) => { s.files = { 'versions.json': manifest(versions, latest, extra) }; for (const v in versions) s.files[`english-words-v${v}.html`] = versions[v]; };
  s.start = () => new Promise(r => s.http.listen(0, '127.0.0.1', () => { s.port = s.http.address().port; s.url = `http://127.0.0.1:${s.port}/{file}`; r(s); }));
  s.stop = () => new Promise(r => { s.http.closeAllConnections && s.http.closeAllConnections(); s.http.close(r); });
  return s;
}

/* ---------- сборка оболочки ---------- */
function buildShell(appBuf, sources, out) {
  const app = path.join(TMP, 'app-in.html'), cfg = path.join(TMP, 'cfg.json');
  fs.writeFileSync(app, appBuf);
  fs.writeFileSync(cfg, JSON.stringify({ sources: sources.map(u => typeof u === 'string' ? { url: u } : u), timing: { health: 1500, checkDelay: 150, net: 1500, mirror: 300 } }));
  execFileSync('python3', [path.join(__dirname, 'build.py'), app, out, '--config', cfg]);
}

/* ---------- запуск ---------- */
function makeEnv(engine, name) {
  const dir = fs.mkdtempSync(path.join(TMP, engine + '-')); const file = path.join(dir, 'Программа', 'english-words.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const env = { engine, dir, file, profile: path.join(dir, 'profile'), ctx: null, p: null, errors: [] };
  env.url = 'file://' + file.split('/').map(encodeURIComponent).join('/');
  env.open = async (opts = {}) => {
    const o = { headless: engine !== 'chromium', viewport: engine === 'chromium' ? null : { width: 1100, height: 800 }, acceptDownloads: true, reducedMotion: 'reduce' };
    if (engine === 'chromium') o.args = ['--app=' + env.url, '--no-first-run', '--no-default-browser-check', '--window-size=1180,820'];
    env.ctx = await pw[engine].launchPersistentContext(env.profile, o);
    if (env.route) await env.route(env.ctx);                              // подмена сетевых ответов (раздел «выпуск»)
    env.p = env.ctx.pages()[0] || await env.ctx.waitForEvent('page');
    env.p.on('pageerror', e => env.errors.push(e.message));
    env.p.on('dialog', d => d.accept());
    if (engine !== 'chromium') await env.p.goto(env.url);
    if (!opts.raw) await ready(env.p);
    return env.p;
  };
  env.close = async () => { if (env.ctx) { await env.ctx.close(); env.ctx = null; } };
  env.reopen = async (opts) => { await env.close(); return env.open(opts); };
  return env;
}
const ready = p => p.waitForFunction(() => {
  if (document.getElementById('shell-recovery')) return true;
  const a = document.getElementById('app');
  return !!(window.__shell && window.__shell.info().running && window.__w3k && a && a.children.length);
}, null, { timeout: 20000 });
const idle = p => p.evaluate(() => __shell.idle.then(() => new Promise(r => setTimeout(r, 30))));
const info = p => p.evaluate(() => __shell.info());
const state = p => p.evaluate(() => JSON.parse(JSON.stringify(__shell._state())));
const progress = p => p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k) || 'null'); return d ? JSON.stringify([d.p, d.hist, d.started]) : null; }, KEY);
const firstScreen = p => p.evaluate(() => !!document.querySelector('[data-act=first-start]'));
async function appVersion(p) {                    // номер версии, который показывает само приложение в настройках
  await p.evaluate(() => { try { __w3k.guard = 0; } catch (e) {} });
  await p.locator('[data-act=nav][data-v=settings]:visible').first().click();
  const v = await p.evaluate(() => window.__w3k && __w3k.version || (document.body.innerText.match(/Версия ([\d.]+)/) || [])[1] || null);
  await p.evaluate(() => { try { __w3k.guard = 0; } catch (e) {} });
  await p.locator('[data-act=nav][data-v=home]:visible').first().click();
  return v;
}
async function learn(p) {                         // первый урок: 10 слов, все ответы верные
  await p.evaluate(() => { __w3k.guard = 0; });
  await p.click('[data-act=first-start]');
  for (let k = 0; k < 10; k++) await p.click('[data-act=sort-learn]');
  if (await p.evaluate(() => __w3k.view) === 'sort') await p.click('[data-act=sort-finish]');
  for (let n = 0; await p.evaluate(() => __w3k.view) === 'session'; n++) {
    if (n > 2000) throw new Error('урок не закончился');
    const c = await p.evaluate(() => { const c = __w3k.cur; return c && { t: c.task.t, en: c.task.w.en, ans: c.answered, opts: c.opts && c.opts.map(o => o.en) }; });
    if (!c) continue;
    if (c.ans || c.t === 'intro') await p.keyboard.press('Enter');
    else if (c.t === 'type') { await p.fill('#tinp', c.en); await p.keyboard.press('Enter'); }
    else await p.keyboard.press(String(c.opts.indexOf(c.en) + 1));
  }
  await p.evaluate(() => { __w3k.guard = 0; });
  await p.locator('[data-act=nav][data-v=home]:visible').first().click();     // с экрана итогов на главную
  await sleep(400);                               // оболочка успевает снять копию прогресса
}
async function act(p, fn, arg) {                  // действие, после которого оболочка перезагружает страницу
  await p.evaluate(() => { window.__old = true; });
  await p.evaluate(fn, arg);
  await p.waitForFunction(() => !window.__old && !!window.__shell, null, { timeout: 15000 });
  await ready(p);
}

(async () => {
  const A = await server().start(), B = await server().start();
  const dead = 'http://127.0.0.1:9/{file}';       // порт, на котором никто не слушает
  const V = { '1.0': real('1.0'), '1.1': real('1.1'), '1.2': real('1.2') };
  const reset = () => { for (const s of [A, B]) { s.files = {}; s.hits = {}; s.down = false; s.mangle = null; } };

  for (const engine of engines) {
    console.log(`\n=== ${engine}${engine === 'chromium' ? ' (окно программы)' : ' (файл в браузере)'} ===`);
    const section = async (name, fn) => {
      if (only && !name.includes(only)) return;
      reset(); const t = Date.now(), f0 = failed; const envs = [];
      const mk = () => { const e = makeEnv(engine, name); envs.push(e); return e; };
      try { await fn(mk); } catch (e) { failed++; console.log('    ✗ сбой: ' + String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); }
      for (const e of envs) { await e.close().catch(() => {}); }
      console.log(`  ${failed === f0 ? '✓' : '✗'} ${name} (${((Date.now() - t) / 1000).toFixed(1)} c)`);
    };

    await section('первый запуск без интернета', async mk => {
      const e = mk(); buildShell(V['1.2'], [dead], e.file);
      let p = await e.open(); await idle(p);
      let s = await state(p), i = await info(p);
      check(await firstScreen(p), 'чистая установка: приложение открыло первый экран');
      check(i.running === '1.2' && i.builtin === '1.2' && !i.degraded, 'работает встроенная версия 1.2');
      check(s.marked && s.firstChecked && await p.evaluate(k => localStorage.getItem(k), MARK) === '1', 'отметка хранилища поставлена');
      check(s.lastError && !s.pending && !s.manifest, 'без сети: проверка обновлений тихо не удалась, ничего не скачано');
      await learn(p);
      const before = await progress(p);
      p = await e.reopen(); await idle(p);
      check(await progress(p) === before && !await firstScreen(p), 'после перезапуска прогресс на месте');
      const m = await p.evaluate(k => new Promise(r => { const q = indexedDB.open('words3000-shell'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('mirror'); g.onsuccess = () => r(g.result === localStorage.getItem(k)); }; }), KEY);
      check(m, 'копия прогресса во втором хранилище совпадает с основной');
      check(e.errors.length === 0, 'без ошибок на странице: ' + e.errors.join('; '));
    });

    await section('переход с обычной версии 1.2 на оболочку', async mk => {
      const e = mk(); fs.writeFileSync(e.file, V['1.2']);
      let p = await e.open({ raw: true }); await p.waitForFunction(() => window.__w3k);
      await learn(p); const before = await progress(p); await e.close();
      buildShell(V['1.2'], [dead], e.file);
      p = await e.open();
      check(await progress(p) === before && !await firstScreen(p), 'прогресс, накопленный до оболочки, виден сразу');
      check((await state(p)).marked, 'отметка хранилища поставлена');
    });

    await section('автообновление', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.1': fake('9.1') }), '9.1');
      let p = await e.open(); await learn(p); const before = await progress(p); await idle(p);
      let s = await state(p);
      check((await info(p)).running === '1.2' && s.pending === '9.1' && s.have['9.1'], 'новая версия скачана в фоне, текущий сеанс остаётся на 1.2');
      check(await appVersion(p) === '1.2', 'приложение в этом сеансе по-прежнему 1.2');
      p = await e.reopen();
      check((await info(p)).running === '9.1' && await appVersion(p) === '9.1', 'при следующем запуске работает 9.1');
      check(await progress(p) === before, 'прогресс после обновления тот же');
      check(/9\.1/.test(await p.evaluate(() => (document.getElementById('shell-toast') || {}).textContent || '')), 'показана заметка «обновлено до 9.1»');
      await shot(p, engine + '-updated');
      s = await state(p);
      check(s.backups.length === 1 && /обновлением до 9\.1/.test(s.backups[0].reason), 'перед первым запуском новой версии снята копия прогресса');
      await idle(p);
      p = await e.reopen();
      check(!await p.$('#shell-toast') && (await info(p)).running === '9.1', 'заметка показывается один раз');
      A.set(Object.assign({}, V, { '9.1': fake('9.1'), '9.2': fake('9.2') }), '9.2'); const h0 = A.hits['english-words-v9.1.html'];
      await idle(p); p = await e.reopen(); await idle(p); p = await e.reopen();
      check((await info(p)).running === '9.2' && await progress(p) === before, 'следующее обновление (9.2) приходит так же');
      check(A.hits['english-words-v9.1.html'] === h0, 'уже скачанная версия повторно не скачивается');
      check(e.errors.length === 0, 'без ошибок на странице: ' + e.errors.join('; '));
    });

    await section('испорченная загрузка и плохой список версий', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.1': fake('9.1') }), '9.1');
      A.mangle = (n, b) => n.includes('9.1') ? Buffer.from(b.toString('utf8').replace('Версия 9.1', 'Версия 6.6')) : b;       // тот же размер, другое содержимое
      let p = await e.open(); await learn(p); const before = await progress(p); await idle(p);
      let s = await state(p);
      check(!s.pending && !s.have['9.1'] && /сумма/.test(s.lastError.msg), 'файл с неверной контрольной суммой не принят: ' + (s.lastError && s.lastError.msg));
      A.mangle = (n, b) => n.includes('9.1') ? b.subarray(0, 50000) : b;                                                       // оборванная загрузка
      p = await e.reopen(); await idle(p); s = await state(p);
      check(!s.pending && !s.have['9.1'] && /размер/.test(s.lastError.msg) && (await info(p)).running === '1.2', 'оборванный файл не принят: ' + (s.lastError && s.lastError.msg));
      for (const [name, body] of [['не JSON', Buffer.from('<html>ошибка сервера</html>')], ['без последней версии', Buffer.from(JSON.stringify({ latest: '9.9', versions: [] }))], ['чужая структура', Buffer.from('[1,2,3]')]]) {
        A.mangle = (n, b) => n === 'versions.json' ? body : b;
        p = await e.reopen(); await idle(p); s = await state(p);
        check(!s.pending && s.lastError && (await info(p)).running === '1.2' && await progress(p) === before, `список версий «${name}»: приложение работает, ничего не скачано`);
      }
      A.mangle = (n, b) => 'hang';
      p = await e.reopen(); const t = Date.now(); await idle(p); s = await state(p);
      check(!s.pending && s.lastError && Date.now() - t < 6000 && await progress(p) === before, 'сервер молчит: ожидание обрывается, приложение работает');
      A.mangle = null;
      p = await e.reopen(); await idle(p);
      check((await state(p)).pending === '9.1', 'когда сервер исправен, версия скачивается');
      p = await e.reopen();
      check((await info(p)).running === '9.1' && await progress(p) === before, 'и включается при следующем запуске, прогресс тот же');
    });

    await section('запасной источник', async mk => {
      const e = mk(); buildShell(V['1.2'], [dead, A.url, B.url], e.file);
      const files = Object.assign({}, V, { '9.1': fake('9.1') });
      A.set(files, '9.1'); B.set(files, '9.1');
      A.mangle = (n, b) => n.includes('9.1') ? b.subarray(0, 1000) : b;      // второй источник отдаёт битый файл
      let p = await e.open(); await idle(p);
      const s = await state(p);
      check(s.pending === '9.1' && s.have['9.1'], 'первый источник недоступен, второй отдал битый файл — версия взята с третьего');
      check(A.hits['versions.json'] === 1 && !B.hits['versions.json'] && B.hits['english-words-v9.1.html'] === 1, 'источники пробуются по очереди, лишних запросов нет');
    });

    await section('зеркало: список версий берётся только с основного источника', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url, { url: B.url, filesOnly: true }], e.file);
      A.set(Object.assign({}, V, { '9.1': fake('9.1') }), '9.1');
      B.set(Object.assign({}, V, { '9.1': fake('9.1'), '9.9': fake('9.9') }), '9.9');             // зеркало «врёт» про последнюю версию
      A.mangle = (n, b) => n.includes('9.1') ? b.subarray(0, 1000) : b;
      let p = await e.open(); await idle(p);
      let s = await state(p);
      check(s.pending === '9.1' && s.manifest.latest === '9.1' && !B.hits['versions.json'], 'список версий взят с основного источника, файл — с зеркала');
      A.down = true; B.hits = {};
      p = await e.reopen(); await idle(p); s = await state(p);
      check(!B.hits['versions.json'] && s.lastError && s.manifest.latest === '9.1', 'основной источник недоступен: у зеркала список версий не спрашивается');
    });

    await section('сломанная версия: откат', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.3': broken('9.3') }), '9.3');
      let p = await e.open(); await learn(p); const before = await progress(p); await idle(p);
      check((await state(p)).pending === '9.3', 'сломанная версия скачана (сумма верная, но она не запускается)');
      p = await e.reopen();                       // пробует 9.3, не дожидается интерфейса, возвращается на 1.2
      let s = await state(p);
      check((await info(p)).running === '1.2' && s.bad['9.3'] && await progress(p) === before, 'оболочка сама вернула 1.2, прогресс цел');
      check(/9\.3 не запустилась/.test(await p.evaluate(() => (document.getElementById('shell-toast') || {}).textContent || '')), 'показана заметка о возврате');
      const h = A.hits['english-words-v9.3.html']; await idle(p);
      p = await e.reopen(); await idle(p);
      check((await info(p)).running === '1.2' && !(await state(p)).pending && A.hits['english-words-v9.3.html'] === h, 'сломанная версия больше не скачивается и не включается');
      check((await info(p)).versions.find(x => x.v === '9.3').failed, 'в списке версий она помечена как несработавшая');
      A.set(Object.assign({}, V, { '9.3': broken('9.3'), '9.4': fake('9.4') }), '9.4');
      p = await e.reopen(); await idle(p); p = await e.reopen();
      check((await info(p)).running === '9.4' && await progress(p) === before, 'следующая исправная версия (9.4) приходит как обычно');
    });

    await section('сломанная версия: программу закрыли раньше, чем сработал откат', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.3': broken('9.3') }), '9.3');
      let p = await e.open(); await learn(p); const before = await progress(p); await idle(p);
      for (let k = 0; k < 2; k++) { await e.close(); p = await e.open({ raw: true }); await sleep(600); }     // два неудачных запуска подряд, окно закрывают
      p = await e.reopen();
      const s = await state(p);
      check((await info(p)).running === '1.2' && s.bad['9.3'] && await progress(p) === before, 'после двух неудачных запусков версия отключена, прогресс цел');
    });

    await section('выбор версии', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.1': fake('9.1') }), '9.1', { '1.0': { known: 'есть известные ошибки' } });
      let p = await e.open(); await learn(p); const before = await progress(p); await idle(p);
      p = await e.reopen(); await idle(p);
      let i = await info(p);
      check(i.running === '9.1' && i.versions.map(x => x.v).join() === '9.1,1.2,1.1,1.0', 'список версий: от новой к старой — ' + i.versions.map(x => x.v).join());
      check(i.versions[0].latest && i.versions[0].running && i.versions[3].known === 'есть известные ошибки' && i.versions[1].downloaded && !i.versions[2].downloaded, 'в списке видно: какая последняя, какая работает, какие уже скачаны');
      await act(p, () => { __shell.use('1.0'); });
      i = await info(p);
      check(i.running === '1.0' && i.pinned === '1.0' && await appVersion(p) === '1.0', 'выбрана 1.0 — работает 1.0');
      check(await progress(p) === before, 'версия 1.0 видит тот же прогресс');
      check(/версией 1\.0/.test(await p.evaluate(() => (document.getElementById('shell-bar') || {}).textContent || '')), 'сверху полоска «Вы пользуетесь версией 1.0» с кнопкой возврата');
      await shot(p, engine + '-pinned');
      check((await state(p)).backups.some(b => /переходом на 1\.0/.test(b.reason)), 'перед переходом снята копия прогресса');
      A.set(Object.assign({}, V, { '9.1': fake('9.1'), '9.2': fake('9.2') }), '9.2');
      await idle(p); p = await e.reopen(); await idle(p); p = await e.reopen(); await idle(p);
      i = await info(p);
      check(i.running === '1.0' && !i.pending && i.latest === '9.2', 'пока версия закреплена, автообновление приостановлено (но список версий свежий)');
      check(!A.hits['english-words-v9.2.html'], 'новая версия при закреплённой не скачивается');
      await act(p, () => { __shell.use('1.1'); });
      check((await info(p)).running === '1.1' && await progress(p) === before && await p.$('#shell-bar'), 'переход 1.0 → 1.1: работает, прогресс тот же');
      await idle(p);                              // фоновая проверка этой страницы закончилась: иначе она может успеть скачать 9.2 сразу после снятия закрепления
      await act(p, () => { document.querySelector('#shell-bar button').click(); });
      i = await info(p);
      check(i.running === '9.1' && !i.pinned && !await p.$('#shell-bar') && await progress(p) === before, 'кнопка «Вернуться к последней»: самая новая из скачанных (9.1), закрепление снято — ' + JSON.stringify([i.running, i.pinned, i.latest, i.versions.filter(x => x.downloaded).map(x => x.v), i.versions.filter(x => x.failed).map(x => x.v)]));
      await idle(p); p = await e.reopen();
      check((await info(p)).running === '9.2' && await progress(p) === before, 'автообновление снова работает: пришла 9.2');
      await idle(p);
      await act(p, () => { __shell.use('1.2'); });
      A.down = true;
      const err = await p.evaluate(() => __shell.use('1.0').then(() => null, e => e.message));
      i = await info(p);
      check(i.running === '1.2' && i.pinned === '1.2', 'встроенную версию можно выбрать и без сети — ' + JSON.stringify([i.running, i.pinned]));
      check(err === null ? i.versions.find(x => x.v === '1.0').downloaded : /Не удалось скачать версию 1\.0/.test(err), 'версия, которой нет на диске, без сети не выбирается: ' + err);
      A.down = false;
      await act(p, () => { __shell.use('9.2'); });
      i = await info(p);
      check(i.running === '9.2' && !i.pinned, 'выбор самой новой версии — это возврат к автообновлению, а не закрепление');
      check(e.errors.length === 0, 'без ошибок на странице: ' + e.errors.join('; '));
    });

    await section(`приложение ${CUR}: раздел «Версия и обновления» с настоящей оболочкой`, async mk => {
      const R = real(CUR), ALL = Object.assign({}, V, { [CUR]: R });
      const e = mk(); buildShell(R, [A.url], e.file);
      const TEXT = { [CUR]: { notes: 'Автообновление и выбор версии в настройках.' }, '1.2': { notes: 'Программа для Windows. Прогресс можно загрузить прямо с первого экрана.' },
        '1.1': { date: '2026-11-15', notes: 'Исправления по итогам полной проверки: управление, озвучка, граница суток.' },
        '1.0': { date: '2026-11-14', notes: 'Первая версия.', known: 'серия дней могла сбрасываться' } };
      A.set(ALL, CUR, TEXT);
      let p = await e.open(); await learn(p);
      await p.click('[data-act=sort]'); for (let k = 0; k < 70; k++) await p.click('[data-act=sort-know]'); await p.click('.btn[data-act=close-sort]');
      if (await p.$('.sum [data-act=nav][data-v=home]')) await p.click('.sum [data-act=nav][data-v=home]');      // с 1.4 после сортировки показывается итог
      await sleep(500); const before = await progress(p); await idle(p);
      const settings = async () => { await p.evaluate(() => { __w3k.guard = 0; }); await p.locator('[data-act=nav][data-v=settings]:visible').first().click(); await p.evaluate(() => { __w3k.guard = 0; });
        if (await p.$('[data-act=ver-list][aria-expanded=false]')) await p.click('[data-act=ver-list]'); };                 // с 1.4 список версий свёрнут
      const card = () => p.$eval('#ver-card', c => c.innerText);
      const clickReload = async sel => { await p.evaluate(() => { window.__old = true; }); await p.click(sel); await p.waitForFunction(() => !window.__old && !!window.__shell, null, { timeout: 15000 }); await ready(p); };
      const toastHas = re => p.waitForFunction(s => new RegExp(s).test((document.querySelector('.toast') || {}).textContent || ''), re.source, { timeout: 8000 }).then(() => true, () => false);

      check(await p.evaluate(() => __w3k.version) === CUR && (await info(p)).running === CUR, 'работает версия ' + CUR);
      await p.evaluate(() => { __w3k.guard = 0; }); await p.locator('[data-act=nav][data-v=settings]:visible').first().click();
      check(await p.$('[data-act=ver-list][aria-expanded=false]') && !await p.$('.vers') && /Все версии\s+4 версии/.test(await card()), 'список версий в настройках свёрнут, в строке — их число');
      await settings(); let t = await card();
      check(new RegExp('Установлена версия ' + CURRE + ' — последняя').test(t) && /Последняя проверка — сегодня в \d\d:\d\d/.test(t), `в настройках: «Установлена версия ${CUR} — последняя» и время проверки`);
      check(await p.$$eval('.vers li', a => a.map(l => l.querySelector('b').textContent).join()) === CUR + ',1.2,1.1,1.0' && /Известные ошибки: серия дней/.test(t), 'список версий с GitHub показан в настройках, у 1.0 — известные ошибки');
      await cardShot(p, engine + '-settings');

      await p.click('[data-act=ver-use][data-v="1.0"]'); await clickReload('.modal [data-act=ver-use-yes]');
      check((await info(p)).running === '1.0' && await appVersion(p) === '1.0' && await p.$('#shell-bar') && await progress(p) === before, 'кнопка «Перейти» у 1.0: открылась 1.0 с полосой наверху, прогресс тот же');
      await clickReload('#shell-bar button');
      check((await info(p)).running === CUR && !await p.$('#shell-bar') && await progress(p) === before, `из 1.0 обратно: снова ${CUR}, прогресс тот же`);
      await settings();
      check(/Сохранено копий: 2/.test(await card()), 'в настройках видно, что сделаны две копии прогресса');

      A.set(Object.assign({}, ALL, { '9.4': fake13('9.4') }), '9.4', TEXT);
      await p.click('[data-act=ver-check]');
      check(await toastHas(/Версия 9\.4 скачана/) && /Версия 9\.4 уже скачана и включится при следующем запуске/.test(await card()), '«Проверить сейчас»: версия 9.4 найдена и скачана');
      await clickReload('[data-act=ver-apply]');
      check((await info(p)).running === '9.4' && await p.evaluate(() => __w3k.version) === '9.4' && await progress(p) === before, '«Включить сейчас»: работает 9.4, прогресс тот же');
      check(/обновлено до версии 9\.4/.test(await p.evaluate(() => (document.getElementById('shell-toast') || {}).textContent || '')), 'показана заметка об обновлении');

      await settings(); await p.click(`[data-act=ver-use][data-v="${CUR}"]`); await clickReload('.modal [data-act=ver-use-yes]');
      let i = await info(p);
      check(i.running === CUR && i.pinned === CUR && !await p.$('#shell-bar'), `из 9.4 на ${CUR}: работает ${CUR}, полосы оболочки нет (в приложении есть свой раздел)`);
      await settings();
      check(new RegExp('Вы пользуетесь версией ' + CURRE + ', последняя — 9\\.4\\. Автообновление приостановлено').test(await card()), 'в настройках написано, что автообновление приостановлено');
      await cardShot(p, engine + '-settings-pinned');
      await clickReload('[data-act=ver-latest]');
      i = await info(p);
      check(i.running === '9.4' && !i.pinned && await progress(p) === before, '«Вернуться к последней»: снова 9.4');

      await settings(); await p.click('[data-act=ver-auto]');
      await p.waitForFunction(() => document.querySelector('[data-act=ver-auto]').getAttribute('aria-checked') === 'false');
      check((await state(p)).auto === false, 'выключатель в настройках выключает автообновление');
      A.set(Object.assign({}, ALL, { '9.4': fake13('9.4'), '9.5': fake13('9.5') }), '9.5', TEXT);
      p = await e.reopen(); await idle(p); p = await e.reopen(); await idle(p);
      check((await info(p)).running === '9.4' && !A.hits['english-words-v9.5.html'], 'автообновление выключено: 9.5 сама не скачивается');
      await settings();
      check(/Вышла версия 9\.5\. Автообновление выключено/.test(await card()), 'но в настройках видно, что вышла 9.5');
      await clickReload('.ver-status [data-act=ver-use]');
      check((await info(p)).running === '9.5' && await progress(p) === before, '«Обновить»: работает 9.5, прогресс тот же');

      await settings(); await p.click('[data-act=reset]'); await p.click('.modal [data-act=reset-yes]'); await sleep(900);
      const bk = (await state(p)).backups;
      check(await progress(p) !== before && bk.some(b => /резким уменьшением/.test(b.reason)), '«Сбросить всё»: оболочка сама сохранила прежний прогресс в копию — ' + bk.map(b => b.reason).join('; '));
      await settings(); await p.click('[data-act=ver-backups]');
      const row = p.locator('.modal .vers li', { hasText: 'перед резким уменьшением' }).first();
      await row.locator('[data-act=ver-restore]').click();
      await clickReload('.modal [data-act=ver-restore-yes]');
      check(await progress(p) === before && (await info(p)).running === '9.5', 'копия восстановлена из настроек: прогресс вернулся');

      A.down = true; await settings();
      await p.click('[data-act=ver-use][data-v="1.1"]'); await p.click('.modal [data-act=ver-use-yes]');
      check(await toastHas(/Не удалось скачать версию 1\.1/) && (await info(p)).running === '9.5' && await p.$eval('[data-act=ver-check]', b => !b.disabled), 'нет сети: нескачанную версию выбрать нельзя, об этом сказано, всё остаётся как было');
      check(e.errors.length === 0, 'ошибок на странице нет: ' + e.errors.join('; '));
    });

    await section('автообновление выключено', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.1': fake('9.1') }), '9.1');
      let p = await e.open({}); await p.evaluate(() => __shell.setAuto(false)); await idle(p);
      p = await e.reopen(); await idle(p);
      let s = await state(p);
      check((await info(p)).running === '1.2' && !s.pending && s.manifest && s.manifest.latest === '9.1', 'обновления не скачиваются, но список версий известен');
      await p.evaluate(() => __shell.setAuto(true).then(() => __shell.check()));
      check((await state(p)).pending === '9.1', 'после включения версия скачивается');
    });

    await section('версия для новой оболочки', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.1': fake('9.1') }), '9.1', { '9.1': { shell: 2 } });
      let p = await e.open(); await idle(p);
      check(!(await state(p)).pending && !A.hits['english-words-v9.1.html'], 'версия, которой нужна более новая программа, не скачивается');
      const err = await p.evaluate(() => __shell.use('9.1').then(() => null, e => e.message));
      check(/нужно установить новую программу/.test(err || ''), 'и вручную не выбирается: ' + err);
    });

    await section('новый установщик поверх', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.1': fake('9.1') }), '9.1');
      let p = await e.open(); await learn(p); const before = await progress(p); await idle(p); p = await e.reopen(); await idle(p);
      check((await info(p)).running === '9.1', 'исходное состояние: работает скачанная 9.1');
      await e.close(); buildShell(V['1.1'], [A.url], e.file);                                   // «старый» установщик
      p = await e.open();
      check((await info(p)).running === '9.1' && await progress(p) === before, 'установщик со старой встроенной версией не откатывает скачанную');
      await e.close(); buildShell(fake('9.5'), [A.url], e.file);                                // новый установщик
      p = await e.open();
      check((await info(p)).running === '9.5' && (await info(p)).builtin === '9.5' && await progress(p) === before, 'установщик с более новой встроенной версией — работает она');
    });

    await section('защита хранилища', async mk => {
      const e = mk(); buildShell(V['1.2'], [dead], e.file);
      let p = await e.open(); await learn(p); const before = await progress(p); await idle(p);
      // имитация сбоя: хранилище выглядит пустым, хотя отметка в IndexedDB говорит, что данные были
      await p.evaluate(([k, m]) => { localStorage.removeItem(k); localStorage.removeItem(m); }, [KEY, MARK]);
      await p.reload(); await p.waitForSelector('#shell-recovery', { timeout: 15000 });
      let s = await state(p);
      check(s.guard.hits === 4 && s.guard.tries === 3, 'приложение не запущено: три перезагрузки, затем экран восстановления');
      check(!await p.$('[data-act=first-start]') && !await p.evaluate(() => !!window.__w3k), 'первый экран «как у нового пользователя» не показан');
      await shot(p, engine + '-recovery');
      const labels = await p.$$eval('#shell-recovery button', b => b.map(x => x.textContent));
      check(labels.length === 3 && /Восстановить из копии от \d\d\.\d\d\.\d{4}/.test(labels[1]), 'три действия, есть «Восстановить из копии от …»: ' + labels.join(' | '));
      await act(p, () => { document.querySelectorAll('#shell-recovery button')[1].click(); });
      check(await progress(p) === before && !await firstScreen(p), 'восстановление из копии вернуло весь прогресс');
      await p.evaluate(([k, m]) => { localStorage.removeItem(k); localStorage.removeItem(m); }, [KEY, MARK]);
      await p.reload(); await p.waitForSelector('#shell-recovery', { timeout: 15000 });
      await p.evaluate(() => { document.querySelectorAll('#shell-recovery button')[2].click(); });
      await ready(p);
      check(await firstScreen(p) && (await state(p)).marked, '«Продолжить без прогресса» открывает приложение как новое');
      // настоящий сброс прогресса из приложения — это не сбой: отметка остаётся
      await p.evaluate(([k, d]) => localStorage.setItem(k, d), [KEY, JSON.stringify({ v: 1 })]);
      await p.reload(); await ready(p);
      check(!await p.$('#shell-recovery') && (await state(p)).guard.tries === 0, 'пустой прогресс при целой отметке сбоем не считается');
    });

    await section('выпуск: файл программы из корня и настоящий список версий', async mk => {
      // Здесь проверяется не тестовая сборка, а то, что будет отправлено на GitHub: english-words.html из корня
      // с настоящими адресами и versions/versions.json. Сам GitHub подменён: его адреса отвечают файлами с диска.
      let synced = true; try { execFileSync('python3', [path.join(ROOT, 'dev', 'src', 'build.py'), '--check'], { stdio: 'pipe' }); } catch (x) { synced = false; }
      check(synced, 'файлы выпуска совпадают со сборкой (build.py --check)');
      const VD = path.join(ROOT, 'versions'), M = JSON.parse(fs.readFileSync(path.join(VD, 'versions.json'), 'utf8'));
      check(M.versions.every(v => { const b = fs.readFileSync(path.join(VD, v.file)); return sha(b) === v.sha256 && b.length === v.size; }), 'суммы и размеры в списке версий совпадают с файлами');
      const RAW = 'https://raw.githubusercontent.com/krvtrg/3000-words/main/versions/';
      const net = { off: false, asked: [] };
      const e = mk(); fs.copyFileSync(path.join(ROOT, 'english-words.html'), e.file);
      e.route = ctx => ctx.route(/^https?:\/\//, route => {
        const u = route.request().url(); net.asked.push(u);
        const name = u.startsWith(RAW) ? u.slice(RAW.length).split('?')[0] : '';
        if (net.off || !/^[\w.-]+$/.test(name) || !fs.existsSync(path.join(VD, name))) return route.abort();
        return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain; charset=utf-8' }, body: fs.readFileSync(path.join(VD, name)) });
      });
      let p = await e.open(); await idle(p);
      let i = await info(p), st = await state(p);
      check(i.running === M.latest && i.builtin === M.latest && await p.evaluate(() => __w3k.version) === M.latest, 'в программу встроена последняя версия — ' + M.latest);
      check(net.asked[0] === RAW + 'versions.json' && !st.lastError && !st.pending, 'список версий запрошен по адресу репозитория на GitHub и принят');
      check(i.versions.map(v => v.v).join() === M.versions.map(v => v.v).join() && i.versions.every((v, k) => v.notes === M.versions[k].notes && (v.known || '') === (M.versions[k].known || '')), 'версии и подписи к ним — как в списке: ' + i.versions.map(v => v.v).join());
      await learn(p); const before = await progress(p);
      for (const v of M.versions.map(x => x.v).filter(v => v !== M.latest)) {
        await act(p, v => { __shell.use(v); }, v);
        check((await info(p)).running === v && await appVersion(p) === v && await progress(p) === before, `версия ${v}: скачана, сумма сошлась, запустилась, прогресс тот же`);
      }
      await act(p, () => { __shell.useLatest(); });
      check((await info(p)).running === M.latest && await progress(p) === before, 'возврат к последней версии');
      net.off = true; net.asked = [];
      p = await e.reopen(); await idle(p); st = await state(p);
      check(net.asked.length >= 2 && new Set(net.asked.map(u => new URL(u).host)).size >= 2, 'GitHub недоступен: опрошены и запасные адреса — ' + [...new Set(net.asked.map(u => new URL(u).host))].join(', '));
      check((await info(p)).running === M.latest && st.lastError && await progress(p) === before, 'без сети программа работает на последней версии, прогресс на месте');
      await p.evaluate(() => { __w3k.guard = 0; }); await p.locator('[data-act=nav][data-v=settings]:visible').first().click();
      check(/Проверить не удалось/.test(await p.$eval('#ver-card', c => c.innerText)), 'в настройках написано, что проверить обновления не удалось');
      check(e.errors.length === 0, 'ошибок на странице нет: ' + e.errors.join('; '));
    });

    await section('хранилище закрыто (окно предпросмотра)', async mk => {
      const e = mk(); buildShell(V['1.2'], [A.url], e.file);
      A.set(Object.assign({}, V, { '9.1': fake('9.1') }), '9.1');
      const browser = await pw[engine].launch(); const q = await browser.newPage(); const errs = []; q.on('pageerror', x => errs.push(x.message));
      const html = fs.readFileSync(e.file, 'utf8').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      await q.setContent(`<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:100vw;height:100vh" srcdoc="${html}"></iframe>`);
      const fr = q.frames()[1];
      await fr.waitForSelector('[data-act=first-start]', { timeout: 15000 });
      const i = await fr.evaluate(() => __shell.info());
      check(i.degraded && i.running === '1.2', 'оболочка запустила встроенную версию без обновлений');
      await fr.evaluate(() => { __w3k.guard = 0; }); await fr.click('[data-act=first-start]'); await fr.click('[data-act=sort-learn]');
      check(await fr.evaluate(() => __w3k.counts().queued) === 1 && errs.length === 0, 'приложение работает в памяти без ошибок: ' + errs.join('; '));
      check(/недоступен/.test(await fr.evaluate(() => __shell.use('1.0').then(() => '', x => x.message))), 'выбор версии честно отказывает');
      await browser.close();
    });
  }
  await A.stop(); await B.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nИтог: ${passed} проверок пройдено, ${failed} не пройдено`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
