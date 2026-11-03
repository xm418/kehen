"""用 CDP 看 HTML parse errors"""
from playwright.sync_api import sync_playwright
import json

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 收集所有事件
    events = []
    page.on('console', lambda m: events.append(f'CONSOLE [{m.type}] {m.text[:150]}'))
    page.on('pageerror', lambda e: events.append(f'PAGEERR {str(e)[:200]}'))
    page.on('requestfailed', lambda r: events.append(f'REQFAIL {r.url} {r.failure}'))

    # 用 CDP 监听 HTML parse error
    cdp = page.context.new_cdp_session(page)
    cdp.send('Log.enable')
    cdp.on('Log.entryAdded', lambda params: events.append(f'LOG {params}'))

    page.set_content(html)
    page.wait_for_timeout(3000)

    info = page.evaluate("""() => ({
        body_html: document.body.innerHTML.slice(0, 300),
        root: !!document.getElementById('root'),
        html_outer_len: document.documentElement.outerHTML.length,
    })""")

    print('=== EVAL ===')
    print(json.dumps(info, indent=2))
    print('\n=== EVENTS ===')
    for e in events:
        print(f'  {e}')

    browser.close()
