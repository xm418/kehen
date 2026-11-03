"""二分 bigscript 内容找祸端"""
from playwright.sync_api import sync_playwright

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

script_s = html.index('<script type="module"')
script_e = html.index('</script>', script_s) + len('</script>')

big_script = html[script_s:script_e]
prefix = html[:script_s]
suffix = html[script_e:]

print(f'bigscript total len: {len(big_script)}')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # 保留前一半
    half = len(big_script) // 2
    tests = [
        ('first 1K chars', big_script[:1000] + '</script>'),
        ('first 10K chars', big_script[:10000] + '</script>'),
        ('first 50K chars', big_script[:50000] + '</script>'),
        ('first 100K chars', big_script[:100000] + '</script>'),
        ('first 200K chars', big_script[:200000] + '</script>'),
        ('full original', big_script),
    ]

    for name, content in tests:
        # 如果截断了，需要补全 script 开头并确保 </script>
        if not content.startswith('<script'):
            content = '<script type="module" crossorigin>' + content
        if not content.endswith('</script>'):
            content = content.rstrip() + '</script>'
        
        full_html = prefix + content + suffix
        
        page = browser.new_page()
        page.on('console', lambda m: None)
        page.on('pageerror', lambda e: None)
        page.set_content(full_html)
        page.wait_for_timeout(1000)
        info = page.evaluate("""() => ({
            body_len: document.body.innerHTML.length,
            root: !!document.getElementById('root'),
        })""")
        status = 'OK ' if info['root'] else 'FAIL'
        print(f'[{status}] {name}: root={info["root"]}, body_len={info["body_len"]}')
        page.close()

    browser.close()
