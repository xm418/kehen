"""精确对比：有 vs 无 add_init_script"""
from playwright.sync_api import sync_playwright
import subprocess, sys, time

port = 8894
proc = subprocess.Popen(
    [sys.executable, '-m', 'http.server', str(port), '--directory', r'c:\Users\33973\Desktop\项目\dist'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1.5)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Test 1: 完全没有 add_init_script
    print('=== Test 1: 无 init script ===')
    page1 = browser.new_page()
    page1.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
    page1.wait_for_timeout(5000)
    r1 = page1.evaluate("""() => ({
        body_len: document.body.innerHTML.length,
        root: !!document.getElementById('root'),
        app: !!document.querySelector('.app'),
        loading: !!document.querySelector('.app-loading'),
    })""")
    print(f'  {r1}')
    page1.close()

    # Test 2: 加空的 add_init_script
    print('\n=== Test 2: 空 init script ===')
    page2 = browser.new_page()
    page2.add_init_script("window.__TEST__ = true;")
    page2.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
    page2.wait_for_timeout(5000)
    r2 = page2.evaluate("""() => ({
        body_len: document.body.innerHTML.length,
        root: !!document.getElementById('root'),
        app: !!document.querySelector('.app'),
        loading: !!document.querySelector('.app-loading'),
        test_var: window.__TEST__,
    })""")
    print(f'  {r2}')
    page2.close()

    # Test 3: 直接等 selector
    print('\n=== Test 3: wait for selector ===')
    page3 = browser.new_page()
    page3.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
    try:
        page3.wait_for_selector('#root .app', timeout=10000)
        print('  selector found!')
    except Exception as e:
        print(f'  selector TIMEOUT: {e}')
    r3 = page3.evaluate("""() => ({
        body_len: document.body.innerHTML.length,
        root: !!document.getElementById('root'),
        app: !!document.querySelector('.app'),
        loading: !!document.querySelector('.app-loading'),
    })""")
    print(f'  {r3}')
    page3.close()

    browser.close()
proc.kill()
