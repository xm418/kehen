"""诊断 dist/index.html 为什么白屏"""
import subprocess, sys, time, os, traceback

# 启动 python http server serve dist
port = 8899
proc = subprocess.Popen(
    [sys.executable, '-m', 'http.server', str(port), '--directory',
     r'c:\Users\33973\Desktop\项目\dist'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1)

# 测连接
import urllib.request
try:
    r = urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html', timeout=5)
    print(f'[server] {r.status}')
except Exception as e:
    print(f'[server] FAIL: {e}')
    proc.kill(); sys.exit(1)

# playwright
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('[playwright] not installed, installing...')
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'playwright'], timeout=120)
    subprocess.check_call([sys.executable, '-m', 'playwright', 'install', 'chromium'], timeout=180)
    from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)

    def on_console(msg):
        if msg.type == 'error':
            errors.append(f'CONSOLE: {msg.text}')
    def on_pageerror(err):
        errors.append(f'PAGEERROR: {err}')

    page.on('console', on_console)
    page.on('pageerror', on_pageerror)

    page.goto(f'http://127.0.0.1:{port}/index.html')
    try:
        page.wait_for_load_state('networkidle', timeout=10000)
    except Exception as e:
        errors.append(f'WAIT: {e}')
    page.wait_for_timeout(3000)

    page.screenshot(path=r'c:\Users\33973\Desktop\项目\dist-shot.png')

    # dump 关键 DOM 状态
    info = page.evaluate("""() => {
        const root = document.getElementById('root');
        const boot = document.getElementById('boot-splash');
        const body = document.body;
        const html = document.documentElement;
        return {
            body_bg: getComputedStyle(body).backgroundColor,
            html_bg: getComputedStyle(html).backgroundColor,
            root_children: root ? root.children.length : -1,
            root_text_len: root ? root.textContent.length : -1,
            root_class: root ? root.className : '',
            boot_exists: !!boot,
            boot_opacity: boot ? getComputedStyle(boot).opacity : null,
            boot_display: boot ? getComputedStyle(boot).display : null,
            body_height: body.scrollHeight,
            inner_height: window.innerHeight,
            has_app_div: !!root && root.querySelector('.app'),
            has_app_loading: !!document.querySelector('.app-loading'),
            has_page_div: !!root && root.querySelector('.page'),
            has_tabbar: !!root && root.querySelector('.tabbar'),
            body_innerHTML_len: body.innerHTML.length,
            theme_dataset: html.dataset.theme || '(none)',
        };
    }""")

    browser.close()

print('\n=== DOM STATE ===')
for k, v in sorted(info.items()):
    print(f'  {k}: {v}')
if errors:
    print('\n=== ERRORS ===')
    for e in errors:
        print(f'  {e}')
else:
    print('\n(no errors)')

proc.kill()
print('\nscreenshot saved to dist-shot.png')
