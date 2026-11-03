"""最终验证：干净 dist + 长时间等待"""
from playwright.sync_api import sync_playwright
import subprocess, sys, time

# 重新 build
subprocess.run(['npm.cmd', 'run', 'build'], capture_output=True, cwd=r'c:\Users\33973\Desktop\项目')

# 用 HTTP server 跑
port = 8896
proc = subprocess.Popen(
    [sys.executable, '-m', 'http.server', str(port), '--directory', r'c:\Users\33973\Desktop\项目\dist'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1.5)

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    
    # Test 1: HTTP 方式（模拟真实浏览器）
    print('=== HTTP 方式（localhost）===')
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    msgs = []
    page.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:150]}'))
    page.on('pageerror', lambda e: msgs.append(f'[PAGEERR] {str(e)[:200]}'))
    
    page.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
    # 等 store ready + React render 完成
    page.wait_for_timeout(5000)
    
    # 截图
    page.screenshot(path=r'c:\Users\33973\Desktop\项目\dist-shot-http.png', full_page=True)
    
    info = page.evaluate("""() => ({
        body_len: document.body.innerHTML.length,
        root: !!document.getElementById('root'),
        root_kids: document.getElementById('root')?.children.length ?? -1,
        root_head: document.getElementById('root')?.innerHTML.slice(0, 200) ?? '',
        boot: !!document.getElementById('boot-splash'),
        boot_style: document.getElementById('boot-splash') ? getComputedStyle(document.getElementById('boot-splash')).opacity : '',
        has_app: !!document.querySelector('.app'),
        has_app_loading: !!document.querySelector('.app-loading'),
        theme: document.documentElement.dataset.theme,
    })""")
    print(f'  RESULT: root={info["root"]}, app={info["has_app"]}, loading={info["has_app_loading"]}')
    print(f'  root_head: {info["root_head"][:100]}')
    print(f'  boot_opacity: {info["boot_style"]}')
    print(f'  body_len: {info["body_len"]}')
    page.close()
    
    print(f'\n  CONSOLE ({len(msgs)}):')
    for m in msgs:
        print(f'    {m}')

    browser.close()
proc.kill()
