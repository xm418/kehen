"""测试 file:// 和 set_content 两种方式"""
from playwright.sync_api import sync_playwright
import json

HTML_CONTENT = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Method 1: set_content
    print("=== Method 1: set_content ===")
    page1 = browser.new_page(viewport={'width': 390, 'height': 844})
    msgs1 = []
    page1.on('console', lambda m: msgs1.append(f'[{m.type}] {m.text[:100]}'))
    page1.on('pageerror', lambda e: msgs1.append(f'[PAGEERR] {str(e)[:200]}'))
    page1.set_content(HTML_CONTENT, wait_until='domcontentloaded')
    page1.wait_for_timeout(5000)
    info1 = page1.evaluate("""() => ({
        body_html: document.body.innerHTML.slice(0, 300),
        root_exists: !!document.getElementById('root'),
        root_children: document.getElementById('root')?.children.length ?? -1,
        boot_exists: !!document.getElementById('boot-splash'),
    })""")
    print(json.dumps(info1, indent=2, ensure_ascii=False))
    print(f'Console ({len(msgs1)}):')
    for m in msgs1[:10]:
        print(f'  {m}')
    page1.close()

    # Method 2: file://
    print("\n=== Method 2: file:// ===")
    page2 = browser.new_page(viewport={'width': 390, 'height': 844})
    msgs2 = []
    page2.on('console', lambda m: msgs2.append(f'[{m.type}] {m.text[:100]}'))
    page2.on('pageerror', lambda e: msgs2.append(f'[PAGEERR] {str(e)[:200]}'))
    page2.goto('file:///c:/Users/33973/Desktop/%E9%A1%B9%E7%9B%AE/dist/index.html', wait_until='domcontentloaded')
    page2.wait_for_timeout(5000)
    info2 = page2.evaluate("""() => ({
        body_html: document.body.innerHTML.slice(0, 300),
        root_exists: !!document.getElementById('root'),
        root_children: document.getElementById('root')?.children.length ?? -1,
        boot_exists: !!document.getElementById('boot-splash'),
    })""")
    print(json.dumps(info2, indent=2, ensure_ascii=False))
    print(f'Console ({len(msgs2)}):')
    for m in msgs2[:10]:
        print(f'  {m}')
    page2.close()

    browser.close()
