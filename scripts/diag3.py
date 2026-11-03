"""读探针"""
import subprocess, sys, time

port = 8897
proc = subprocess.Popen(
    [sys.executable, '-m', 'http.server', str(port), '--directory',
     r'c:\Users\33973\Desktop\项目\dist'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1.5)

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})

    all_msgs = []
    page.on('console', lambda m: all_msgs.append(f'[{m.type}] {m.text}'))
    page.on('pageerror', lambda e: all_msgs.append(f'[PAGEERR] {e}'))

    page.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
    page.wait_for_timeout(5000)

    info = page.evaluate("""() => {
        const root = document.getElementById('root');
        const body = document.body;
        return {
            body_before_len: (window.__BODY_BEFORE__ || '').length,
            body_before_head: (window.__BODY_BEFORE__ || '').slice(0, 200),
            root_before: window.__ROOT_BEFORE__,
            current_body_len: body?.innerHTML?.length ?? -1,
            current_body_head: body?.innerHTML?.slice(0, 200) ?? '',
            current_root_exists: !!root,
            current_root_children: root ? root.children.length : -1,
            current_root_innerHTML: root ? root.innerHTML.slice(0, 200) : '',
        };
    }""")

    import json
    print(json.dumps(info, indent=2, ensure_ascii=False))
    print('\n=== CONSOLE ===')
    for m in all_msgs:
        print(f'  {m}')
    browser.close()

proc.kill()
