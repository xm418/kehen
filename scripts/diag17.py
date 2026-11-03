"""HTTP 方式加同样的探针"""
from playwright.sync_api import sync_playwright
import subprocess, sys, time, urllib.request

port = 8895
proc = subprocess.Popen(
    [sys.executable, '-m', 'http.server', str(port), '--directory', r'c:\Users\33973\Desktop\项目\dist'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1.5)

# 下载 HTML，插探针，然后用 set_content 加载（模拟 HTTP origin）
import urllib.request
resp = urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html')
html = resp.read().decode('utf-8')

script_s = html.index('<script type="module"')
before = """<script>
  window.__BEFORE__ = {
    body_len: document.body ? document.body.innerHTML.length : -1,
    root_exists: !!document.getElementById('root'),
    boot_exists: !!document.getElementById('boot-splash'),
  };
  document.addEventListener('DOMContentLoaded', () => {
    window.__AFTER__ = {
      body_len: document.body ? document.body.innerHTML.length : -1,
      root_exists: !!document.getElementById('root'),
      boot_exists: !!document.getElementById('boot-splash'),
    };
  });
  setTimeout(() => {
    window.__AFTER2__ = {
      body_len: document.body ? document.body.innerHTML.length : -1,
      root_exists: !!document.getElementById('root'),
      boot_exists: !!document.getElementById('boot-splash'),
      body_head: document.body ? document.body.innerHTML.slice(0, 300) : '',
    };
  }, 100);
</script>"""
html_probed = html[:script_s] + before + html[script_s:]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    msgs = []
    page.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:200]}'))
    page.on('pageerror', lambda e: msgs.append(f'[PAGEERR] {str(e)[:200]}'))

    # 方法 A: set_content (about:blank origin)
    print('=== A: set_content ===')
    page.set_content(html_probed)
    page.wait_for_timeout(2000)
    r = page.evaluate("""() => ({BEFORE: window.__BEFORE__, AFTER: window.__AFTER__, AFTER2: window.__AFTER2__})""")
    print(f'  BEFORE: {r}')
    print(f'  CONSOLE:')
    for m in msgs:
        print(f'    {m}')
    page.close()

    # 方法 B: HTTP goto + 注入 probe via evaluate before script
    print('\n=== B: HTTP goto + inject ===')
    page2 = browser.new_page()
    msgs2 = []
    page2.on('console', lambda m: msgs2.append(f'[{m.type}] {m.text[:200]}'))
    page2.on('pageerror', lambda e: msgs2.append(f'[PAGEERR] {str(e)[:200]}'))

    # 用 add_init_script 在页面加载前注入
    page2.add_init_script("""
      window.__BEFORE__ = { body_len: -1, root_exists: false, boot_exists: false };
      const origCreateElement = document.createElement.bind(document);
      document.addEventListener('DOMContentLoaded', () => {
        window.__AFTER__ = {
          body_len: document.body ? document.body.innerHTML.length : -1,
          root_exists: !!document.getElementById('root'),
          boot_exists: !!document.getElementById('boot-splash'),
        };
      });
      setTimeout(() => {
        window.__AFTER2__ = {
          body_len: document.body ? document.body.innerHTML.length : -1,
          root_exists: !!document.getElementById('root'),
          boot_exists: !!document.getElementById('boot-splash'),
          body_head: document.body ? document.body.innerHTML.slice(0, 300) : '',
        };
      }, 200);
    """)

    page2.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
    page2.wait_for_timeout(3000)
    
    r2 = page2.evaluate("""() => ({BEFORE: window.__BEFORE__, AFTER: window.__AFTER__, AFTER2: window.__AFTER2__})""")
    print(f'  {r2}')
    print(f'  CONSOLE:')
    for m in msgs2:
        print(f'    {m}')
    page2.close()

    browser.close()
proc.kill()
