"""增强版诊断：抓所有 console + error + 运行时状态"""
import subprocess, sys, time, os

port = 8898
proc = subprocess.Popen(
    [sys.executable, '-m', 'http.server', str(port), '--directory',
     r'c:\Users\33973\Desktop\项目\dist'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1.5)

import urllib.request
try:
    r = urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html', timeout=5)
    print(f'[server] {r.status}, size={len(r.read())}')
except Exception as e:
    print(f'[server] FAIL: {e}')
    proc.kill(); sys.exit(1)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'playwright'], timeout=60)
    subprocess.check_call([sys.executable, '-m', 'playwright', 'install', 'chromium'], timeout=120)
    from playwright.sync_api import sync_playwright

all_msgs = []
page_errors = []
requests = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})

    def on_console(msg):
        all_msgs.append(f'[{msg.type}] {msg.text}')
    def on_pageerror(err):
        page_errors.append(str(err))
    def on_request(req):
        if req.resource_type in ('script', 'module', 'stylesheet'):
            resp = req.response()
            status = resp.status if resp else '?'
            requests.append(f'{req.method} {req.url} -> {status}')

    page.on('console', on_console)
    page.on('pageerror', on_pageerror)
    page.on('requestfinished', on_request)

    # 注入全局错误捕获
    page.add_init_script("""
        window.addEventListener('error', function(e) {
            window.__ERRS__ = window.__ERRS__ || [];
            window.__ERRS__.push('GLOBAL: ' + (e.message || String(e.error)));
        });
        window.addEventListener('unhandledrejection', function(e) {
            window.__ERRS__ = window.__ERRS__ || [];
            window.__ERRS__.push('UNHANDLED: ' + (e.reason?.message || String(e.reason)));
        });
    """)

    page.goto(f'http://127.0.0.1:{port}/index.html', wait_until='commit')
    page.wait_for_timeout(8000)

    info = page.evaluate("""() => {
        const root = document.getElementById('root');
        const boot = document.getElementById('boot-splash');
        return {
            ready_has_root: !!root,
            root_children: root ? root.children.length : -1,
            root_innerHTML_len: root ? root.innerHTML.length : -1,
            first_child_tag: root && root.firstElementChild ? root.firstElementChild.tagName : null,
            boot_exists: !!boot,
            body_html_tail: document.body.innerHTML.slice(-200),
            body_html_head: document.body.innerHTML.slice(0, 300),
            window_errs: window.__ERRS__ || [],
            has_React: typeof window.React !== 'undefined',
            has_store: typeof window.__STORE__ !== 'undefined',
            scripts_count: document.scripts.length,
            script_srcs: Array.from(document.scripts).map(s => s.src || '(inline)').slice(0, 5),
            module_scripts: Array.from(document.scripts).filter(s => s.type === 'module').length,
        };
    }""")

    page.screenshot(path=r'c:\Users\33973\Desktop\项目\dist-shot2.png', full_page=True)
    browser.close()

print('\n=== EVAL RESULT ===')
import json
print(json.dumps(info, indent=2, ensure_ascii=False))

print('\n=== ALL CONSOLE MESSAGES ===')
for m in all_msgs:
    print(f'  {m}')

print('\n=== PAGE ERRORS ===')
for e in page_errors:
    print(f'  {e}')

proc.kill()
print('\ndone')
