"""更精确的二分"""
from playwright.sync_api import sync_playwright

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

script_s = html.index('<script type="module"')
script_e = html.index('</script>', script_s) + len('</script>')

big_script = html[script_s:script_e]
script_open_tag = '<script type="module" crossorigin>'
script_content = big_script[len(script_open_tag):-len('</script>')]

prefix = html[:script_s]
suffix = html[script_e:]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    lo, hi = 200000, len(script_content)
    while lo < hi:
        mid = (lo + hi) // 2
        content = script_open_tag + script_content[:mid] + '</script>'
        full_html = prefix + content + suffix
        
        page = browser.new_page()
        page.on('console', lambda m: None)
        page.on('pageerror', lambda e: None)
        page.set_content(full_html)
        page.wait_for_timeout(800)
        info = page.evaluate("""() => ({ root: !!document.getElementById('root') })""")
        page.close()
        
        if info['root']:
            print(f'  first {mid} chars: OK')
            lo = mid + 1
        else:
            print(f'  first {mid} chars: FAIL')
            hi = mid

    print(f'\n临界点：前 {lo} 个字符开始 FAIL')
    print(f'总长度: {len(script_content)}')
    print(f'祸端位置附近 context: ...{script_content[max(0,lo-50):lo+50]}...')

    browser.close()
