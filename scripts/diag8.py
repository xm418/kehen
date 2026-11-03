"""精确的组合测试"""
from playwright.sync_api import sync_playwright

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

# 定位各元素
style_s = html.index('<style>')
style_e = html.index('</style>') + len('</style>')
script_s = html.index('<script type="module"')
script_e = html.index('</script>', script_s) + len('</script>')

before_style = html[:style_s]
style_block = html[style_s:style_e]
between = html[style_e:script_s]
big_script = html[script_s:script_e]
after_script = html[script_e:]

empty_style = '<style></style>'
empty_script = '<script type="module">console.log("x");</script>'

combinations = [
    ('1. style + bigscript', style_block, big_script),
    ('2. style + empty_script', style_block, empty_script),
    ('3. empty_style + bigscript', empty_style, big_script),
    ('4. empty_style + empty_script', empty_style, empty_script),
    ('5. NO_style + bigscript', '', big_script),
    ('6. style + NO_script', style_block, ''),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for name, s1, s2 in combinations:
        content = before_style + s1 + between + s2 + after_script
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
        status = 'OK ' if info['root'] else 'FAIL'
        print(f'[{status}] {name}: root={info["root"]}, body_len={info["body_len"]}')
        page.close()

    browser.close()
