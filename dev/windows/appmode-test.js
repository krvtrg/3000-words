// Проверка «режима программы»: браузер на движке Chromium (тот же, что в Microsoft Edge)
// запускается с теми же ключами, что и Words3000.exe, — отдельное окно и отдельный профиль.
// Проверяет: прогресс переживает перезапуск и обновление файла программы (обычная 1.1 → текущая программа с оболочкой),
// а файл прогресса из обычной HTML-версии загружается с первого экрана.
// Запуск (нужен X-сервер): xvfb-run -a node appmode-test.js
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require(path.join(__dirname, '..', 'tests', 'node_modules', 'playwright'));
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.homedir(), '.cache', 'appmode-'));
const prog = path.join(tmp, 'Мои программы 100% #1'); fs.mkdirSync(prog);
const page = path.join(prog, 'english-words.html'), profile = path.join(tmp, 'Profile');
// тот же способ записи адреса, что в launcher.nsi: всё, кроме A-Z a-z 0-9 @ - . _ ~ / :, — в виде %XX (UTF-8)
const url = 'file://' + [...Buffer.from(page, 'utf8')].map(b => /[A-Za-z0-9@\-._~\/:]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
let ok = 0, bad = 0;
const check = (c, name) => { c ? ok++ : bad++; console.log((c ? '  ✓ ' : '  ✗ ') + name); };
const launch = async () => {
  const ctx = await chromium.launchPersistentContext(profile, { headless: false, viewport: null,
    args: ['--app=' + url, '--no-first-run', '--no-default-browser-check', '--window-size=1180,820'] });
  const p = ctx.pages()[0] || await ctx.waitForEvent('page');
  // с версии 1.3 файл программы — оболочка: при самом первом запуске она один раз перезагружает страницу и только потом запускает приложение
  await p.waitForFunction(() => window.__w3k && document.getElementById('app').children.length && (!window.__shell || __shell.info().running), null, { timeout: 20000 });
  await p.evaluate(() => { __w3k.guard = 0; });
  return { ctx, p };
};
const prog_ = p => p.evaluate(() => JSON.stringify([__w3k.S.p, __w3k.S.hist, __w3k.S.set]));
const view = p => p.evaluate(() => __w3k.view);
const ver = p => p.evaluate(() => window.__w3k.version || (document.body.innerText.match(/Версия ([\d.]+)/) || [])[1]);
(async () => {
  console.log('Окно программы, версия 1.1');
  fs.copyFileSync(path.join(ROOT, 'versions', 'english-words-v1.1.html'), page);
  let { ctx, p } = await launch();
  check(decodeURIComponent(p.url()) === 'file://' + page, 'страница открылась из папки с пробелами, кириллицей, % и #');
  check(await p.evaluate(() => window.outerHeight - window.innerHeight < 60), 'окно без адресной строки и вкладок');
  await p.click('[data-act=first-start]');
  await p.evaluate(() => { __w3k.guard = 0; });
  // учим: отбираем 10 слов и проходим урок до конца, отвечая верно
  for (let k = 0; k < 10; k++) await p.click('[data-act=sort-learn]');
  if (await view(p) === 'sort') await p.click('[data-act=sort-finish]');
  for (let n = 0; await view(p) === 'session'; n++) {
    if (n > 2000) throw new Error('урок не закончился');
    const c = await p.evaluate(() => { const c = __w3k.cur; return c && { t: c.task.t, en: c.task.w.en, ans: c.answered, opts: c.opts && c.opts.map(o => o.en) }; });
    if (!c) continue;
    if (c.ans || c.t === 'intro') await p.keyboard.press('Enter');
    else if (c.t === 'type') { await p.fill('#tinp', c.en); await p.keyboard.press('Enter'); }
    else await p.keyboard.press(String(c.opts.indexOf(c.en) + 1));
  }
  const learned = await p.evaluate(() => Object.values(__w3k.S.p).filter(x => x[0] >= 1).length);
  check(learned >= 5, 'урок пройден в окне программы: слов в изучении — ' + learned);
  const before = await prog_(p);
  const data = await p.evaluate(() => JSON.stringify({ app: 'words3000', v: 1, exported: new Date().toISOString(), data: __w3k.S }));
  await ctx.close();

  console.log('Перезапуск программы');
  ({ ctx, p } = await launch());
  check(await prog_(p) === before, 'прогресс на месте после закрытия и запуска');
  await ctx.close();

  console.log('Обновление: файл программы заменён на новую версию, профиль не тронут');
  fs.copyFileSync(path.join(ROOT, 'english-words.html'), page);
  ({ ctx, p } = await launch());
  check(await prog_(p) === before, 'прогресс на месте после обновления');
  await p.locator('[data-act=nav][data-v=settings]:visible').first().click();
  const v = await ver(p); check(v && v !== '1.1', 'в настройках показана новая версия: ' + v);
  const sh = await p.evaluate(() => window.__shell ? __shell.info() : null);
  check(sh && !sh.degraded && sh.running === v && await p.$('#ver-card'), 'программа работает через оболочку: в настройках есть раздел «Версия и обновления»');
  await ctx.close();

  console.log('Чистая установка + файл прогресса из HTML-версии');
  fs.rmSync(profile, { recursive: true, force: true });
  ({ ctx, p } = await launch());
  check(!!await p.$('[data-act=first-start]'), 'новый профиль — первый экран');
  await p.click('.card [data-act=import]'); await p.fill('#imp-text', data); await p.click('[data-act=import-apply]');
  check(await prog_(p) === before, 'файл прогресса загружен с первого экрана');
  await ctx.close();
  ({ ctx, p } = await launch());
  check(await prog_(p) === before, 'и сохранился после перезапуска');
  if (process.env.SHOT) { await p.waitForTimeout(500); require('child_process').execSync('import -window root ' + process.env.SHOT); }
  await ctx.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nИтого: ${ok} прошло, ${bad} не прошло`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
