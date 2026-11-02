"""验证 BASE 矩阵每行是不是正好 24 字符 + 标出每行的边界。"""
import re
import ast

# 从文件里提取 BASE 数组
with open(r"c:\Users\33973\Desktop\项目\src\components\PandaSVG.tsx", "r", encoding="utf-8") as f:
    src = f.read()

# 提取 BASE 数组的字符串行
lines = []
in_base = False
for line in src.split("\n"):
    if "const BASE" in line:
        in_base = True
        continue
    if in_base:
        # 找一行字符串，形如 '........................', // 0
        m = re.match(r"\s*'([^']*)'\s*,?", line)
        if m:
            lines.append((m.group(1), len(m.group(1))))
        elif "]" in line:
            break

print(f"找到 {len(lines)} 行")
print()

issues = []
for i, (row, length) in enumerate(lines):
    mark = "  OK" if length == 24 else f"  !! 长度={length}"
    print(f"  row {i:2d}: {length:2d} {row}{mark}")
    if length != 24:
        issues.append(i)

if issues:
    print(f"\n❌ 以下行长度不对: {issues}")
else:
    print("\n✅ 所有行都是 24 字符")

# 也把每行的可视化列号标出来看看能不能对齐
print("\n--- 列号可视化（0123456789 每 10 格标一次）---")
for i, (row, _) in enumerate(lines):
    col_ruler = "".join(str(c % 10) for c in range(24))
    print(f"row {i:2d}: {col_ruler}")
    print(f"         {row}")
    print()
