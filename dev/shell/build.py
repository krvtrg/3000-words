#!/usr/bin/env python3
"""Собирает оболочку: shell.html + shell.js + одна встроенная версия приложения → один HTML-файл.

  python3 build.py <файл версии приложения> <куда записать> [--config <json-файл>]

Встроенная версия — готовый файл из versions/ (например, versions/english-words-v1.2.html).
Источники обновлений по умолчанию — репозиторий на GitHub (SOURCES ниже).
Для тестов через --config можно заменить источники и времена ожидания: {"sources": [...], "timing": {...}}.
"""
import json, pathlib, re, sys

SHELL = 1          # номер оболочки; поднимать, когда меняется то, чем пользуются версии приложения
AWARE = '1.3'      # с этой версии в приложении есть свой раздел выбора версии (полоска оболочки не нужна)
REPO, BRANCH, DIR = 'krvtrg/3000-words', 'main', 'versions'
SOURCES = [
    {'url': f'https://raw.githubusercontent.com/{REPO}/{BRANCH}/{DIR}/{{file}}'},
    {'url': f'https://cdn.jsdelivr.net/gh/{REPO}@{BRANCH}/{DIR}/{{file}}', 'filesOnly': True},   # зеркало: список версий отсюда не берём
    {'url': f'https://api.github.com/repos/{REPO}/contents/{DIR}/{{file}}?ref={BRANCH}',
     'headers': {'Accept': 'application/vnd.github.raw+json'}},
]
MANIFEST = 'versions.json'


def build(app_html: str, version: str, override=None, date: str = '') -> str:
    here = pathlib.Path(__file__).resolve().parent
    cfg = {'shell': SHELL, 'builtin': version, 'builtinDate': date, 'aware': AWARE, 'data': 1, 'home': f'https://github.com/{REPO}',
           'manifest': MANIFEST, 'sources': SOURCES}
    cfg.update(override or {})
    js = (here / 'shell.js').read_text(encoding='utf-8')
    assert js.count('/*__CONFIG__*/{}') == 1
    js = js.replace('/*__CONFIG__*/{}', json.dumps(cfg, ensure_ascii=False))
    assert '</script' not in js.lower()
    # приложение лежит внутри как строка JSON; «<» экранируется, чтобы внутри не встретился закрывающий тег
    packed = json.dumps(app_html, ensure_ascii=False).replace('<', '\\u003c')
    out = (here / 'shell.html').read_text(encoding='utf-8')
    assert out.count('/*__APP__*/') == 1 and out.count('/*__SHELL__*/') == 1
    return out.replace('/*__SHELL__*/', js).replace('/*__APP__*/', packed)


def version_of(app_html: str) -> str:
    m = (re.search(r'<meta name="app-version" content="(\d+(?:\.\d+)+)"', app_html)      # с версии 1.3
         or re.search(r'Версия (\d+(?:\.\d+)+)', app_html))                                # 1.0–1.2: строка внизу настроек
    if not m:
        sys.exit('В файле приложения не найден номер версии')
    return m.group(1)


if __name__ == '__main__':
    args = sys.argv[1:]
    override = None
    if '--config' in args:
        i = args.index('--config')
        override = json.loads(pathlib.Path(args[i + 1]).read_text(encoding='utf-8'))
        del args[i:i + 2]
    if len(args) != 2:
        sys.exit(__doc__)
    app = pathlib.Path(args[0]).read_text(encoding='utf-8')
    ver = version_of(app)
    result = build(app, ver, override)
    pathlib.Path(args[1]).write_text(result, encoding='utf-8')
    print(f'{args[1]} — оболочка {SHELL}, встроенная версия {ver}, {len(result.encode("utf-8")) / 1024:.0f} КБ')
