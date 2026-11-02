"""用 JS 把 PandaSVG 放大并脱离容器截一张干净图。"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 600, "height": 600})
    page.goto("http://localhost:5173/")
    page.wait_for_load_state("networkidle")

    # 把 body 里加一个干净的展示面板
    page.evaluate("""() => {
      // 先 import PandaSVG 的 buildGrid + PALETTE（用 vite 的 ?raw 不行，直接取 window...
      // 算了，直接从已有 DOM 里克隆一个 svg 改尺寸
      const orig = document.querySelector('.panda-px');
      if (!orig) return 'no panda found';

      const moods = ['idle', 'focus', 'mad', 'celebrate'];
      const palette = {K:'#1a1a1a',W:'#ffffff',F:'#ffb3b3',D:'#2a2a2a',R:'#c00000',G:'#ffd700',P:'#ffb3b3'};

      const panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#eee;z-index:99999;display:flex;flex-wrap:wrap;gap:20px;padding:20px;justify-content:center;';
      document.body.appendChild(panel);

      moods.forEach(m => {
        const card = document.createElement('div');
        card.style.cssText = 'background:white;padding:16px;border-radius:8px;text-align:center;font-family:sans-serif;font-size:12px;color:#333;';
        
        // 克隆并改 class + 大小
        const clone = orig.cloneNode(true);
        clone.setAttribute('width', 120);
        clone.setAttribute('height', 120);
        clone.setAttribute('class', clone.getAttribute('class').replace(/panda-px-\\w+/g, 'panda-px-' + m));
        
        // 内部的 rect 应该不变，CSS class 变了 mood 会自动套
        card.appendChild(clone);
        
        const label = document.createElement('div');
        label.textContent = 'mood=' + m;
        label.style.cssText = 'margin-top:8px;font-weight:bold;';
        card.appendChild(label);
        panel.appendChild(card);
      });

      return 'ok';
    }""")

    page.wait_for_timeout(500)
    page.screenshot(path="c:/Users/33973/Desktop/项目/px-all-moods.png")
    print("✅ 四 mood 放大对比图: px-all-moods.png")

    browser.close()
