"""二分测试：看看是什么导致 body 消失"""
from playwright.sync_api import sync_playwright

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

# 找到 head 里那个大的 <script type="module" crossorigin>...</script>
script_start = html.index('<script type="module"')
# 找到对应的 </script>
search_from = script_start + 10
# 正确找配对 - 不找嵌入的 </script>（我们已确认没有）
script_end = html.index('</script>', search_from) + len('</script>')

print(f'Big script: {script_start} to {script_end}, size={script_end - script_start}')

tests = []

# Test A: 去掉大 script，换成空 script
test_a = html[:script_start] + '<script type="module">console.log("A");</script>' + html[script_end:]
tests.append(('A: replace big script with empty', test_a))

# Test B: 完全去掉那个 script
test_b = html[:script_start] + html[script_end:]
tests.append(('B: remove big script entirely', test_b))

# Test C: 只保留 head 的样式和 body（去掉所有 scripts）
head_end = html.index('</head>')
body_start = html.index('<body>')
body_end = html.index('</body>') + len('</body>')
test_c = html[:script_start] + html[script_end:head_end] + html[body_start:body_end] + '</html>'
tests.append(('C: all scripts removed', test_c))

# Test D: 去掉 head 里的内联 style
style_start = html.index('<style>')
style_end = html.index('</style>') + len('</style>')
test_d = html[:style_start] + html[style_end:]
tests.append(('D: remove inline <style>', test_d))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for name, content in tests:
        page = browser.new_page()
        page.on('console', lambda m: None)
        page.on('pageerror', lambda e: None)
        page.set_content(content)
        page.wait_for_timeout(1000)
        info = page.evaluate("""() => ({
            body_len: document.body.innerHTML.length,
            root: !!document.getElementById('root'),
            boot: !!document.getElementById('boot-splash'),
        })""")
        status = 'OK' if info['root'] else 'FAIL'
        print(f'[{status}] {name}: root={info["root"]}, boot={info["boot"]}, body_len={info["body_len"]}')
        page.close()

    browser.close()
