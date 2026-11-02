"""测试刻刻 v3 坐姿熊猫——每种 mood 截一张特写。"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 420, "height": 900})
    page.goto("http://localhost:5173/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)

    # 1. 首页 + idle 熊猫（右下角挂件 + 气泡）
    page.screenshot(path="c:/Users/33973/Desktop/项目/t3-home.png", full_page=True)
    pet = page.locator(".pet-trigger")
    if pet.count() > 0:
        pet.first.click()
        page.wait_for_timeout(300)
        page.screenshot(path="c:/Users/33973/Desktop/项目/t3-home-bubble.png", full_page=True)
    print("1. 首页 + 气泡")

    # 2. 专注页 —— 找"专注" tab 或 timer 入口点进去
    focus_btn = page.locator("button, [role='tab']")
    for i in range(focus_btn.count()):
        txt = focus_btn.nth(i).inner_text()
        if "专注" in txt or "计时" in txt or "25:00" in txt:
            print(f"   找到专注入口: '{txt}' at index {i}")
            focus_btn.nth(i).click()
            page.wait_for_timeout(600)
            page.screenshot(path="c:/Users/33973/Desktop/项目/t3-focus-page.png", full_page=True)
            break

    # 3. 截所有 .panda-px 元素（不同 mood）
    pandas = page.locator(".panda-px")
    count = pandas.count()
    print(f"\n找到 {count} 个 .panda-px")
    for i in range(count):
        panda = pandas.nth(i)
        mood_class = panda.get_attribute("class") or ""
        mood = "unknown"
        for m in ["idle", "focus", "mad", "celebrate"]:
            if f"panda-px-{m}" in mood_class:
                mood = m
                break
        try:
            panda.screenshot(path=f"c:/Users/33973/Desktop/项目/t3-panda-{mood}-{i}.png")
            print(f"   截图: t3-panda-{mood}-{i}.png")
        except Exception as e:
            print(f"   跳过: {e}")

    # 4. 截拦截层（如果能触发）
    gate = page.locator(".gate")
    if gate.count() > 0:
        gate.first.screenshot(path="c:/Users/33973/Desktop/项目/t3-gate.png")
        print("4. 拦截层截图")
    else:
        print("4. 没触发拦截层")

    browser.close()
    print("\n完成！")
