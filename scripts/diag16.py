"""直接在 module script 执行前后 dump body"""
from playwright.sync_api import sync_playwright
import json

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

script_s = html.index('<script type="module"')
script_e = html.index('</script>', script_s) + len('</script>')

# 在 module script 前：保存当前 body 状态 + hook 所有 DOM 操作
before = """<script>
  // 保存状态
  window.__BEFORE__ = {
    body_len: document.body ? document.body.innerHTML.length : -1,
    root_exists: !!document.getElementById('root'),
    boot_exists: !!document.getElementById('boot-splash'),
  };
  // Hook 危险操作
  const orig = {
    open: document.open.bind(document),
    write: document.write.bind(document),
    writeln: document.writeln.bind(document),
  };
  document.open = function() { window.__HOOKS__ = window.__HOOKS__ || []; window.__HOOKS__.push('document.open called'); return orig.open(); };
  document.write = function() { window.__HOOKS__ = window.__HOOKS__ || []; window.__HOOKS__.push('document.write called: ' + Array.from(arguments).join('').slice(0, 200)); return orig.write.apply(document, arguments); };

  // 在 DOMContentLoaded 后立刻检查（module script 也在这时之前执行）
  document.addEventListener('DOMContentLoaded', () => {
    window.__AFTER__ = {
      body_len: document.body ? document.body.innerHTML.length : -1,
      root_exists: !!document.getElementById('root'),
      boot_exists: !!document.getElementById('boot-splash'),
    };
  });

  // 再用 setTimeout 在下一帧检查
  setTimeout(() => {
    window.__AFTER2__ = {
      body_len: document.body ? document.body.innerHTML.length : -1,
      root_exists: !!document.getElementById('root'),
      boot_exists: !!document.getElementById('boot-splash'),
      body_head: document.body ? document.body.innerHTML.slice(0, 300) : '',
    };
  }, 100);
</script>"""

html = html[:script_s] + before + html[script_s:]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    msgs = []
    page.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:200]}'))
    page.on('pageerror', lambda e: msgs.append(f'[PAGEERR] {str(e)[:200]}'))

    page.set_content(html)
    page.wait_for_timeout(3000)

    result = page.evaluate("""() => ({
        BEFORE: window.__BEFORE__,
        AFTER_DOMContentLoaded: window.__AFTER__,
        AFTER_100ms: window.__AFTER2__,
        HOOKS: window.__HOOKS__ || [],
    })""")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print('\nCONSOLE:')
    for m in msgs:
        print(f'  {m}')
    browser.close()
