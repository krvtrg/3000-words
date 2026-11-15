// Проба на настоящем GitHub: программа со встроенной старой версией должна сама скачать последнюю.
// В отличие от test.js здесь нет подставного сервера — запросы идут в интернет, по тем же адресам, что у пользователя.
//
//   xvfb-run -a node live.js [chromium|firefox|webkit ...] [--branch=main] [--builtin=1.2]
//   xvfb-run -a node live.js chromium --branch=<ветка> --builtin=1.3 --wait-for=1.5
//        — программа запущена и ждёт: через сколько секунд после публикации она увидит и скачает версию 1.5
//
// Ничего не публикует и не меняет: только читает репозиторий. После выпуска запускается как последняя проверка.
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const pw = require(path.join(__dirname, '..', 'tests', 'node_modules', 'playwright'));
const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2), opt = n => (args.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
const engines = args.filter(a => !a.startsWith('--')); if (!engines.length) engines.push('chromium', 'firefox', 'webkit');
const REPO = 'krvtrg/3000-words', BRANCH = opt('branch') || 'main', BUILTIN = opt('builtin') || '1.2', WAIT_FOR = opt('wait-for');
const HOSTS = { raw: 'raw.githubusercontent.com', cdn: 'cdn.jsdelivr.net', api: 'api.github.com' };
const SOURCES = [
  { url: `https://${HOSTS.raw}/${REPO}/${BRANCH}/versions/{file}` },
  { url: `https://${HOSTS.cdn}/gh/${REPO}@${BRANCH}/versions/{file}`, filesOnly: true },
  { url: `https://${HOSTS.api}/repos/${REPO}/contents/versions/{file}?ref=${BRANCH}`, headers: { Accept: 'application/vnd.github.raw+json' } }
];
const TMP = fs.mkdtempSync(path.join(os.homedir(), '.cache', 'shell-live-'));
const KEY = 'words3000:v1', sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (c, msg) => { if (c) passed++; else failed++; console.log((c ? '  ✓ ' : '  ✗ ') + msg); };
const cmp = (a, b) => { const x = a.split('.'), y = b.split('.'); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (+x[i] || 0) - (+y[i] || 0); if (d) return d; } return 0; };

function env(engine) {
  const dir = fs.mkdtempSync(path.join(TMP, engine + '-')), file = path.join(dir, 'english-words.html'), cfg = path.join(dir, 'cfg.json');
  // у пробной ветки адреса свои; у main — те, что вшиты в программу (так проверяются именно они)
  fs.writeFileSync(cfg, JSON.stringify(BRANCH === 'main' ? {} : { sources: SOURCES }));
  execFileSync('python3', [path.join(__dirname, 'build.py'), path.join(ROOT, 'versions', `english-words-v${BUILTIN}.html`), file, '--config', cfg]);
  const e = { asked: [], block: [], errors: [], ctx: null };
  e.open = async () => {
    const o = { headless: engine !== 'chromium', viewport: engine === 'chromium' ? null : { width: 1100, height: 800 }, reducedMotion: 'reduce' };
    if (engine === 'chromium') o.args = ['--app=file://' + file, '--no-first-run', '--no-default-browser-check', '--window-size=1180,820'];
    e.ctx = await pw[engine].launchPersistentContext(path.join(dir, 'profile'), o);
    await e.ctx.route(/^https?:\/\//, r => { const h = new URL(r.request().url()).host; e.asked.push(h); return e.block.includes(h) ? r.abort() : r.continue(); });
    const p = e.ctx.pages()[0] || await e.ctx.waitForEvent('page');
    p.on('pageerror', x => e.errors.push(x.message));
    if (engine !== 'chromium') await p.goto('file://' + file);
    await ready(p);
    return p;
  };
  e.reopen = async () => { await e.ctx.close(); return e.open(); };
  return e;
}
const ready = p => p.waitForFunction(() => { const a = document.getElementById('app'); return !!(window.__shell && __shell.info().running && window.__w3k && a && a.children.length); }, null, { timeout: 30000 });
const idle = p => p.evaluate(() => __shell.idle.then(() => new Promise(r => setTimeout(r, 50))));
const info = p => p.evaluate(() => __shell.info());
const state = p => p.evaluate(() => JSON.parse(JSON.stringify(__shell._state())));
const progress = p => p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k) || 'null'); return d ? JSON.stringify([d.p, d.hist, d.started]) : null; }, KEY);
const appVersion = p => p.evaluate(() => window.__w3k.version || null);
async function sort(p) {                          // немного прогресса: первый урок из 10 слов, все ответы верные
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
  await p.locator('[data-act=nav][data-v=home]:visible').first().click();
  await sleep(600);
}
async function act(p, fn, arg) {                  // действие, после которого оболочка перезагружает страницу
  await p.evaluate(() => { window.__old = true; });
  await p.evaluate(fn, arg);
  await p.waitForFunction(() => !window.__old && !!window.__shell, null, { timeout: 60000 });
  await ready(p);
}

(async () => {
  const url = `https://${HOSTS.raw}/${REPO}/${BRANCH}/versions/versions.json`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) { console.log(`Список версий не найден: ${url} (HTTP ${r.status}). Версия ещё не опубликована?`); process.exit(2); }
  const M = JSON.parse(await r.text()), latest = M.latest;
  console.log(`GitHub, ветка ${BRANCH}: последняя версия ${latest}, всего версий ${M.versions.length}. В программу встроена ${BUILTIN}.`);

  if (WAIT_FOR) {                                 // сколько проходит от публикации до того, как работающая программа увидит версию
    const e = env(engines[0]); const p = await e.open(); await idle(p);
    console.log(`Программа запущена, сейчас видит ${(await info(p)).latest}. Жду версию ${WAIT_FOR}…`);
    const t0 = Date.now(); let seen = null;
    while (Date.now() - t0 < 900e3) {
      const i = await p.evaluate(() => __shell.check());
      if (i.latest === WAIT_FOR && !seen) { seen = Date.now(); console.log(`  версия ${WAIT_FOR} появилась в списке через ${Math.round((seen - t0) / 1000)} c после начала ожидания`); }
      if (i.pending === WAIT_FOR) { console.log(`  скачана и ждёт следующего запуска: ${Math.round((Date.now() - t0) / 1000)} c`); break; }
      await sleep(10000);
    }
    const p2 = await e.reopen();
    check(await appVersion(p2) === WAIT_FOR || (await info(p2)).running === WAIT_FOR, `после перезапуска работает версия ${WAIT_FOR}`);
    await e.ctx.close();
  } else for (const engine of engines) {
    console.log(`\n=== ${engine}${engine === 'chromium' ? ' (окно программы)' : ' (файл в браузере)'} ===`);
    try {
      const e = env(engine);
      let p = await e.open(); await sort(p); const before = await progress(p); await idle(p);
      let s = await state(p), i = await info(p);
      check(i.running === BUILTIN && e.asked[0] === HOSTS.raw, `запущена встроенная ${BUILTIN}; список версий запрошен у ${e.asked[0]}`);
      check(!s.lastError && i.latest === latest, 'список версий получен с GitHub: последняя — ' + i.latest + (s.lastError ? ' (' + s.lastError.msg + ')' : ''));
      if (cmp(latest, BUILTIN) > 0) {
        check(s.pending === latest && i.versions.find(v => v.v === latest).downloaded, `версия ${latest} скачана в фоне, контрольная сумма сошлась`);
        p = await e.reopen(); i = await info(p);
        check(i.running === latest && await appVersion(p) === latest, `после перезапуска работает ${latest}`);
        check(/обновлено до версии/.test(await p.evaluate(() => (document.getElementById('shell-toast') || {}).textContent || '')), 'показана заметка об обновлении');
        check(await progress(p) === before, 'прогресс тот же');
      } else console.log('  (встроенная версия и есть последняя — обновлять нечего)');
      const old = M.versions.map(v => v.v).filter(v => v !== latest && v !== BUILTIN).pop();
      if (old) {
        await idle(p);
        await act(p, v => { __shell.use(v); }, old);
        check((await info(p)).running === old && await progress(p) === before, `версия ${old} скачана с GitHub по запросу и запустилась, прогресс тот же`);
        await idle(p);
        await act(p, () => { __shell.useLatest(); });
        check((await info(p)).running === latest && await progress(p) === before, `возврат к ${latest}`);
      }
      check(e.errors.length === 0, 'ошибок на странице нет: ' + e.errors.join('; '));
      await e.ctx.close();

      // основной адрес недоступен: список версий — через api.github.com, файлы — с зеркала или оттуда же
      const f = env(engine); f.block = [HOSTS.raw];
      p = await f.open(); await idle(p); s = await state(p); i = await info(p);
      const used = [...new Set(f.asked)].join(', ');
      check(!s.lastError && i.latest === latest, `raw.githubusercontent.com закрыт: список версий получен запасным путём (${used})` + (s.lastError ? ' — ' + s.lastError.msg : ''));
      if (cmp(latest, BUILTIN) > 0) check(s.pending === latest, `…и версия ${latest} скачана запасным путём`);
      await f.ctx.close();

      // интернета нет вовсе
      const g = env(engine); g.block = Object.values(HOSTS);
      p = await g.open(); await sort(p); await idle(p); s = await state(p);
      check((await info(p)).running === BUILTIN && s.lastError && !s.pending && g.errors.length === 0, 'все адреса закрыты: программа работает на встроенной версии, ошибок нет');
      await g.ctx.close();
    } catch (x) { failed++; console.log('  ✗ сбой: ' + String(x && x.stack || x).split('\n').slice(0, 4).join(' | ')); }
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nИтог: ${passed} проверок пройдено, ${failed} не пройдено`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
