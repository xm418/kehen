"""在多个位置插探针 script 看 HTML 解析走了多远"""
from playwright.sync_api import sync_playwright

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

# 定位关键位置
script_s = html.index('<script type="module"')
script_e = html.index('</script>', script_s) + len('</script>')
style_s = html.index('<style', script_e)
style_e = html.index('</style>', style_s) + len('</style>')
head_e = html.index('</head>')
body_s = html.index('<body>')
body_e = html.index('</body>')
root_s = html.index('<div id="root"')
boot_s = html.index('<div id="boot-splash"')

print(f'script: {script_s}-{script_e}')
print(f'style: {style_s}-{style_e}')
print(f'</head>: {head_e}')
print(f'<body>: {body_s}')
print(f'boot-splash: {boot_s}')
print(f'root: {root_s}')

# 在每个关键位置前插探针
def mk_probe(name):
    return f'<script>console.log("PROBE {name}: body_children=", document.body ? document.body.children.length : "no body", "head_children=", document.head.children.length);</script>'

# 1. module script 之前
# 2. style 之前
# 3. </head> 之前  
# 4. <body> 之后
# 5. boot-splash 之后
# 6. root 之后

probes_at = [
    (script_s, 'before-module'),
    (style_s, 'before-style'),
    (head_e, 'before-head-close'),
    (body_s + 6, 'after-body-open'),  # 跳过 <body>
]

# 倒序插入，避免 index 偏移
parts = [html]
for pos, name in sorted(probes_at, reverse=True):
    cur = parts[-1]
    cur_pos = pos
    # 如果之前已经插过，调整位置
    if cur_pos > len(cur):
        cur_pos = len(cur)
    parts[-1] = cur[:cur_pos] + mk_probe(name) + cur[cur_pos:]

html_probed = parts[-1]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    msgs = []
    page.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:250]}'))
    page.on('pageerror', lambda e: msgs.append(f'[PAGEERR] {str(e)[:200]}'))

    page.set_content(html_probed)
    page.wait_for_timeout(3000)

    info = page.evaluate("""() => ({
        body_len: document.body.innerHTML.length,
        root: !!document.getElementById('root'),
        body_children: document.body ? document.body.children.length : -1,
    })""")
    print(f'\nRESULT: {info}')
    print('\nCONSOLE MESSAGES:')
    for m in msgs:
        print(f'  {m}')

    browser.close()
