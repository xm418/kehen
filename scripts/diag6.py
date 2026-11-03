"""最小测试：浏览器能不能解析 dist body 部分"""
from playwright.sync_api import sync_playwright

# 从 dist 里抠出最小 HTML
html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()
body_start = html.index('<body>')
body_end = html.index('</body>') + len('</body>')
body_section = html[body_start:body_end]

test1 = f"""<!doctype html><html><head><meta charset="UTF-8"><title>test</title></head>{body_section}<script>console.log('inline script ran');</script></html>"""

test2 = html  # 完整 dist

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    print("=== Test 1: body section only ===")
    page1 = browser.new_page()
    msgs = []
    page1.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:80]}'))
    page1.set_content(test1)
    page1.wait_for_timeout(1000)
    info = page1.evaluate("""() => ({
        body_len: document.body.innerHTML.length,
        body_head: document.body.innerHTML.slice(0, 200),
        root: !!document.getElementById('root'),
        boot: !!document.getElementById('boot-splash'),
    })""")
    print(info)
    print('console:', msgs)
    page1.close()

    print("\n=== Test 2: full dist ===")
    page2 = browser.new_page()
    msgs2 = []
    page2.on('console', lambda m: msgs2.append(f'[{m.type}] {m.text[:80]}'))
    page2.on('pageerror', lambda e: msgs2.append(f'[PAGEERR] {str(e)[:150]}'))
    page2.set_content(test2)
    page2.wait_for_timeout(5000)
    info2 = page2.evaluate("""() => ({
        body_len: document.body.innerHTML.length,
        body_head: document.body.innerHTML.slice(0, 200),
        root: !!document.getElementById('root'),
        boot: !!document.getElementById('boot-splash'),
        html_len: document.documentElement.innerHTML.length,
    })""")
    print(info2)
    print('console:', msgs2)
    page2.close()

    browser.close()
