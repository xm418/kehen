"""监听 DOM mutation"""
from playwright.sync_api import sync_playwright
import json

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()

# 在 module script 之前注入 mutation logger
probe = """
<script>
  window.__MUTATIONS__ = [];
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') {
        for (const removed of r.removedNodes) {
          window.__MUTATIONS__.push({
            type: 'removed',
            tag: removed.nodeType === 1 ? removed.tagName : 'text',
            id: removed.id || '',
            cls: removed.className || '',
            parent: r.target.tagName + '#' + r.target.id
          });
        }
      }
      if (r.type === 'characterData') {
        window.__MUTATIONS__.push({
          type: 'char',
          old: (r.oldValue || '').slice(0, 50),
          new: r.target.textContent.slice(0, 50) if r.target.textContent else ''
        });
      }
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }, true);
</script>"""

script_s = html.index('<script type="module"')
html_with_probe = html[:script_s] + probe + html[script_s:]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    msgs = []
    page.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:200]}'))
    page.on('pageerror', lambda e: msgs.append(f'[PAGEERR] {str(e)[:300]}'))

    page.set_content(html_with_probe)
    page.wait_for_timeout(5000)

    result = page.evaluate("""() => ({
        body_len: document.body.innerHTML.length,
        root: !!document.getElementById('root'),
        mutations: window.__MUTATIONS__ || [],
        boot_script_exists: document.getElementById('boot-splash') !== null,
    })""")

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print('\n=== CONSOLE ===')
    for m in msgs:
        print(f'  {m}')

    browser.close()
