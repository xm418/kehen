"""测试 type=module 是否导致问题"""
from playwright.sync_api import sync_playwright

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

# 1. 把 type="module" crossorigin 改成普通 script
test_normal = html.replace('<script type="module" crossorigin>', '<script>')

# 2. 去掉 crossorigin
test_nocross = html.replace('<script type="module" crossorigin>', '<script type="module">')

# 3. 移到 body 末尾
script_s = html.index('<script type="module"')
script_e = html.index('</script>', script_s) + len('</script>')
before = html[:script_s]
script = html[script_s:script_e]
after = html[script_e:]
body_close = after.index('</body>')
test_move = before + after[:body_close] + script + after[body_close:]

tests = [
    ('original (type=module + crossorigin)', html),
    ('normal <script> (no module)', test_normal),
    ('module without crossorigin', test_nocross),
    ('moved to body end', test_move),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for name, content in tests:
        page = browser.new_page()
        msgs = []
        page.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:100]}'))
        page.on('pageerror', lambda e: msgs.append(f'[PAGEERR] {str(e)[:150]}'))
        page.set_content(content)
        page.wait_for_timeout(2000)
        info = page.evaluate("""() => ({
            body_len: document.body.innerHTML.length,
            root: !!document.getElementById('root'),
            boot: !!document.getElementById('boot-splash'),
        })""")
        status = 'OK ' if info['root'] else 'FAIL'
        print(f'[{status}] {name}: root={info["root"]}, boot={info["boot"]}, body_len={info["body_len"]}')
        if msgs:
            for m in msgs[:3]:
                print(f'    {m}')
        page.close()

    browser.close()
