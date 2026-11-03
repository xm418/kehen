"""更详细的多探针"""
from playwright.sync_api import sync_playwright

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

# 去掉我之前插的探针（如果有），用原始 dist
# 先重新 build 确保干净
import subprocess
subprocess.run(['npm.cmd', 'run', 'build'], capture_output=True, cwd=r'c:\Users\33973\Desktop\项目')
html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

script_s = html.index('<script type="module"')
script_e = html.index('</script>', script_s) + len('</script>')
body_s = html.index('<body>')
body_content_start = body_s + len('<body>')
boot_s = html.index('<div id="boot-splash"')
root_s = html.index('<div id="root"')
boot_ctrl_start = html.index('<script>', root_s)  # body 里的小脚本
body_e = html.index('</body>')

def mk_probe(name):
    return f'<script>console.log("PROBE[{name}]", "body.kids=", document.body ? document.body.children.length : "none", "body.html=", document.body ? document.body.innerHTML.slice(0, 200) : "", "root=", !!document.getElementById("root"), "boot=", !!document.getElementById("boot-splash"));</script>'

# 在 boot-splash、root、boot_ctrl、body_end 之前分别插探针
insertions = [
    (boot_s, 'before-boot-splash'),
    (root_s, 'before-root'),
    (boot_ctrl_start, 'before-boot-ctrl'),
    (body_e, 'before-body-close'),
]

# 还要在 module script 之后 style 之前也插一个
insertions.append((script_e, 'after-module'))

# 倒序插入
for pos, name in sorted(insertions, reverse=True):
    html = html[:pos] + mk_probe(name) + html[pos:]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    msgs = []
    page.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:300]}'))
    page.on('pageerror', lambda e: msgs.append(f'[PAGEERR] {str(e)[:300]}'))

    page.set_content(html)
    page.wait_for_timeout(5000)

    info = page.evaluate("""() => ({
        body_html: document.body ? document.body.innerHTML.slice(0, 500) : 'no body',
        body_kids: document.body ? document.body.children.length : -1,
        root: !!document.getElementById('root'),
        boot: !!document.getElementById('boot-splash'),
    })""")
    print(f'FINAL: {info}')
    print('\nALL CONSOLE:')
    for m in msgs:
        print(f'  {m}')

    browser.close()
