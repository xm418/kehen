"""直接从已跑的 dev server 页面上找 .panda-px 元素截图。"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 420, "height": 900})
    page.goto("http://localhost:5173/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)

    pandas = page.locator(".panda-px")
    n = pandas.count()
    print(f"找到 {n} 个 .panda-px 元素")

    for i in range(n):
        el = pandas.nth(i)
        classes = el.get_attribute("class") or ""
        mood = "unknown"
        for m in ["idle", "focus", "mad", "celebrate"]:
            if f"panda-px-{m}" in classes:
                mood = m
                break
        try:
            el.screenshot(path=f"c:/Users/33973/Desktop/项目/px-{mood}-{i}.png")
            print(f"  ✅ px-{mood}-{i}.png")
        except Exception as e:
            print(f"  ❌ 失败: {e}")

    # 整体页面
    page.screenshot(path="c:/Users/33973/Desktop/项目/px-page.png", full_page=True)
    print("\n✅ 整体页面截图 px-page.png")

    browser.close()
