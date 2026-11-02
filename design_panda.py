"""
交互式设计 24×24 像素网格。
输入：每行一个 24 字符的字符串（. 空  K 黑  W 白  F 肉垫）
输出：验证每行长度 + 打印列号对照 + 可视化
"""
ROWS = 24

def show(grid: list[str]):
    assert len(grid) == ROWS, f"需要 {ROWS} 行，收到 {len(grid)}"
    print("\n  列号: 012345678901234567890123")
    print("  " + "-" * 24)
    for i, r in enumerate(grid):
        assert len(r) == 24, f"row {i} 长度 {len(r)} != 24: '{r}'"
        print(f"  r{i:02d}: {r}")
    print()

# ===== 坐姿熊猫 v3 =====
# 设计：
#   rows 0-1:   上边距
#   rows 2-4:   耳朵 + 头顶
#   rows 5-14:  头 + 黑眼圈 + 下巴
#   row  15:    脖子黑
#   rows 16-22: 身体（含左右前爪外伸 + 短尾巴 + 后爪外伸）
#   row  23:    爪底肉垫 F + 尾巴尖

BASE = [
    # 0         1         2
    # 012345678901234567890123
    "........................",  # 0
    "........................",  # 1
    "....KK......KK..........",  # 2  耳尖
    "...KKKK....KKKK.........",  # 3  耳根
    "..KKKKKKKKKKKKKKKKKKK...",  # 4  头顶（col 2-21）
    ".KKWWWWWWWWWWWWWWWWWKK..",  # 5  脸顶
    ".KWWWWWWWWWWWWWWWWWWWK..",  # 6  脸
    ".KWWKKKKWWWWWWWWWWKKWWK.",  # 7  黑眼圈上沿（col 6-9 和 14-17）
    ".KWKKKKKKWWWWWWWWKKKKWK.",  # 8  黑眼圈
    ".KWKKKKKKWWWWWWWWKKKKWK.",  # 9
    ".KWWKKKKWWWWWWWWWWKKWWK.",  # 10 黑眼圈下沿
    ".KWWWWWWWWWWWWWWWWWWWWK.",  # 11 脸颊
    "..KWWWWWWWWWWWWWWWWWWK..",  # 12
    "...KKWWWWWWWWWWWWWWKK...",  # 13 下巴 K 环
    "....KKKKWWWWWWWWKKKK....",  # 14
    "....KKKKKKKKKKKKKKKKKK..",  # 15 脖子黑（col 4-21）
    "..KKKKKKKKKKKKKKKKKKKKK.",  # 16 身体顶（col 2-22）
    ".KKKKWWWWWWWWWWWWWWKKKK.",  # 17 前爪根 + 身体白肚皮 + 尾巴根
    "KKKKKKWWWWWWWWWWWWWWKKKK",  # 18 **左前爪外伸** + 身体 + **尾巴外伸**
    "KKKKKWWWWWWWWWWWWWWWWKKK",  # 19
    "KKKKWWWWWWWWWWWWWWWWWWKK",  # 20 左后爪外伸 + 身体 + 右后爪外伸
    ".KKWWWWWWWWWWWWWWWWWWWWK",  # 21
    "..KKKKKKKKKKKKKKKKKKKKKK",  # 22 爪底接地 K 环（col 2-23）
    "..FF............FF..FF..",  # 23 肉垫 F（col 2-3 + 16-17 + 20-21）+ 尾巴尖 F
]

show(BASE)

# 可视化：字符 → 颜色块
print("颜色图例: . 透明  K 黑  W 白  F 粉肉垫")
print()
for r in BASE:
    vis = "".join({"K": "██", "W": "  ", "F": "░░", ".": "  "}[c] for c in r)
    print(f"  {vis}")
