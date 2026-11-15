#!/usr/bin/env python3
"""Собирает приложение и всё, что нужно для выпуска.

Из template.html + app.css + app.js + data/words.json получается один HTML-файл версии, затем:
  <корень>/versions/english-words-v<N>.html   — версия приложения (старые не трогаются); её скачивают программы
  <корень>/versions/versions.json             — список версий с контрольными суммами; по нему программы обновляются
  <корень>/english-words.html                 — программа: оболочка (dev/shell) со встроенной версией <N>.
                                                Этот файл кладёт на компьютер установщик; его же можно открыть в браузере.

Корень — папка двумя уровнями выше этого файла (dev/src/build.py).

Как выпустить версию:
  1. поднять VERSION ниже и добавить запись в releases.json (дата, что изменилось);
  2. python3 build.py; прогнать проверки (dev/tests, dev/shell);
  3. закоммитить и отправить на GitHub — с этого момента программы скачают версию сами
     (GitHub отдаёт новый список версий с задержкой до 5 минут).
Новый установщик (dev/windows/build.py) нужен, только если менялась оболочка (SHELL в dev/shell/build.py).

Уже выпущенную версию скрипт не перезаписывает: перед изменениями поднимите VERSION.
Во время работы над ещё не выпущенной версией — python3 build.py --force
python3 build.py --check — ничего не пишет, только сверяет: файлы на диске совпадают с тем, что получилось бы при сборке.
"""
import hashlib, importlib.util, json, pathlib, re, sys

VERSION = '1.4'   # менять при каждом изменении приложения

src = pathlib.Path(__file__).resolve().parent     # resolve: иначе запуск по пути с «..» ищет файлы не там
words = json.loads((src / 'data' / 'words.json').read_text(encoding='utf-8'))
html = (src / 'template.html').read_text(encoding='utf-8')
html = html.replace('/*__CSS__*/', (src / 'app.css').read_text(encoding='utf-8'))
assert all('|' not in en and '\n' not in en + ru for en, ru in words)
packed = json.dumps('\n'.join(f'{en}|{ru}' for en, ru in words), ensure_ascii=False).replace('</', '<\\/')
html = html.replace('/*__WORDS__*/""', packed)
html = html.replace('/*__JS__*/', (src / 'app.js').read_text(encoding='utf-8'))
html = html.replace('__VERSION__', VERSION)
root = src.parent.parent
out = root / 'english-words.html'
vdir = root / 'versions'; vdir.mkdir(exist_ok=True)
vfile = vdir / f'english-words-v{VERSION}.html'
mfile = vdir / 'versions.json'
CHECK, FORCE = '--check' in sys.argv, '--force' in sys.argv


def vkey(v):
    return tuple(int(x) for x in v.split('.'))


def manifest(current_html):
    """Список версий для программ: versions.json. Тексты — из releases.json, суммы — по файлам в versions/."""
    rel = json.loads((src / 'releases.json').read_text(encoding='utf-8'))
    seen, items = set(), []
    for r in sorted(rel, key=lambda r: vkey(r['v']), reverse=True):
        v = r['v']
        if not re.fullmatch(r'\d+(\.\d+)+', v) or v in seen:
            sys.exit(f'releases.json: плохой или повторный номер версии «{v}»')
        seen.add(v)
        if not re.fullmatch(r'\d{4}-\d\d-\d\d', r.get('date', '')) or not r.get('notes'):
            sys.exit(f'releases.json: у версии {v} нужны date (ГГГГ-ММ-ДД) и notes')
        if len(r['notes']) > 300 or len(r.get('known', '')) > 200:
            sys.exit(f'releases.json: у версии {v} слишком длинный текст (notes до 300 знаков, known до 200)')
        name = f'english-words-v{v}.html'
        data = current_html.encode('utf-8') if v == VERSION else (vdir / name).read_bytes() if (vdir / name).exists() else None
        if data is None:
            sys.exit(f'releases.json: версия {v} есть в списке, но файла versions/{name} нет')
        item = {'v': v, 'file': name, 'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'date': r['date'],
                'notes': r['notes'], 'data': r.get('data', 1), 'shell': r.get('shell', 1)}
        if r.get('known'):
            item['known'] = r['known']
        items.append(item)
    if VERSION not in seen:
        sys.exit(f'В releases.json нет записи о версии {VERSION}: добавьте дату и строку «что изменилось».')
    if items[0]['v'] != VERSION:
        sys.exit(f'В releases.json есть версия новее собираемой ({items[0]["v"]} > {VERSION}).')
    for f in vdir.glob('english-words-v*.html'):
        if f.name[len('english-words-v'):-len('.html')] not in seen:
            sys.exit(f'Файл versions/{f.name} есть, а записи о нём в releases.json нет.')
    date = next(i['date'] for i in items if i['v'] == VERSION)
    return json.dumps({'latest': VERSION, 'versions': items}, ensure_ascii=False, indent=1) + '\n', date


def shell_build():
    spec = importlib.util.spec_from_file_location('shell_build', src.parent / 'shell' / 'build.py')
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


mtext, date = manifest(html)
sb = shell_build()
if any(r.get('shell', 1) > sb.SHELL for r in json.loads(mtext)['versions'] if r['v'] == VERSION):
    sys.exit(f'Версии {VERSION} в releases.json назначена оболочка новее, чем собирается (SHELL = {sb.SHELL}).')
program = sb.build(html, VERSION, date=date)

if CHECK:
    bad = [str(f.relative_to(root)) for f, want in ((vfile, html), (mfile, mtext), (out, program))
           if not f.exists() or f.read_bytes() != want.encode('utf-8')]
    if bad:
        sys.exit('Не совпадает со сборкой: ' + ', '.join(bad) + '. Запустите python3 build.py.')
    print(f'Всё на месте: версия {VERSION}, оболочка {sb.SHELL}, в списке {len(json.loads(mtext)["versions"])} версий.')
    sys.exit(0)

if vfile.exists() and vfile.read_bytes() != html.encode('utf-8') and not FORCE:
    sys.exit(f'Версия {VERSION} уже существует и отличается от новой сборки. '
             f'Поднимите VERSION в build.py (или запустите с --force, если версия ещё не выпущена).')
# newline='' — чтобы файлы были байт в байт одинаковыми на любой системе: по ним считаются контрольные суммы
for f, text in ((vfile, html), (mfile, mtext), (out, program)):
    with open(f, 'w', encoding='utf-8', newline='') as h:
        h.write(text)
print(f'{vfile.relative_to(root)} — версия {VERSION}, {len(words)} слов, {vfile.stat().st_size / 1024:.0f} КБ')
print(f'{mfile.relative_to(root)} — {len(json.loads(mtext)["versions"])} версий, последняя {VERSION}')
print(f'{out.relative_to(root)} — программа: оболочка {sb.SHELL} + версия {VERSION}, {out.stat().st_size / 1024:.0f} КБ')
