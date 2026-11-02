"""测试像素熊猫刻刻的实际渲染效果。"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 420, "height": 800})
    page.goto("http://localhost:5173/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)

    # 首页整体截图
    page.screenshot(path="c:/Users/33973/Desktop/项目/test-home.png", full_page=True)
    print("截图 1: 首页整体")

    # 看看右下角有没有宠物挂件
    pet = page.locator(".pet-trigger")
    if pet.count() > 0:
        print(f"pet-trigger 存在，可见: {pet.first.is_visible()}")
        # 点一下让气泡弹出来
        pet.first.click()
        page.wait_for_timeout(400)
        page.screenshot(path="c:/Users/33973/Desktop/项目/test-home-bubble.png", full_page=True)
        print("截图 2: 气泡弹出后")

    # 截图放大的熊猫 SVG 用于检查像素
    panda = page.locator(".panda-px")
    if panda.count() > 0:
        print(f"找到 {panda.count()} 个 .panda-px 元素")
        panda.first.screenshot(path="c:/Users/33973/Desktop/项目/test-panda-closeup.png")
        print("截图 3: 熊猫 SVG 特写")
    else:
        print("没找到 .panda-px，试试找 pet-svg...")
        pet_svg = page.locator(".pet-svg")
        if pet_svg.count() > 0:
            pet_svg.first.screenshot(path="c:/Users/33973/Desktop/项目/test-panda-closeup.png")
            print("截图 3b: 通过 pet-svg 找到并截图")

    # 打印 console errors
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.wait_for_timeout(200)
    if errors:
        print(f"Console errors: {errors[:5]}")
    else:
        print("Console 无错误")

    browser.close()
    print("完成。图片在 test-home.png / test-home-bubble.png / test-panda-closeup.png")
