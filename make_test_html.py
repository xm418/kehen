"""直接渲染 PandaSVG 到独立 HTML 截图，不受容器干扰。"""
import subprocess, os, textwrap

html = textwrap.dedent("""
<!doctype html>
<html><head>
<meta charset="utf-8">
<style>
  body { background: #f0f0f0; padding: 40px; display: flex; flex-direction: column; gap: 30px; align-items: center; }
  .label { font-family: sans-serif; font-size: 14px; color: #555; margin-bottom: 4px; }
  .specimen { background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
  svg { display: block; image-rendering: pixelated; shape-rendering: crispEdges; }
</style>
</head><body>

<div class="label">刻刻 v3 idle — 96×96 (每像素 4px)</div>
<div class="specimen" id="idle"></div>

<div class="label">刻刻 v3 idle — 192×192 (每像素 8px) 预览放大</div>
<div class="specimen" id="idle-big"></div>

<div class="label">刻刻 v3 focus — 96×96</div>
<div class="specimen" id="focus"></div>

<div class="label">刻刻 v3 mad — 96×96</div>
<div class="specimen" id="mad"></div>

<div class="label">刻刻 v3 celebrate — 96×96</div>
<div class="specimen" id="celebrate"></div>

<script type="module">
import { PandaSVG } from "/src/components/PandaSVG.tsx";

// React 19 + vite 的 ESM，直接用 htm 或者等下，让我用 fetch 把 PandaSVG 源码里的 buildGrid 复制出来当纯函数...
// 算了直接 fetch 然后 eval（dev server 是 vite 能处理 ts）
const mods = await import("/src/components/PandaSVG.tsx");

for (const [id, mood, size] of [
  ["idle", "idle", 96],
  ["idle-big", "idle", 192],
  ["focus", "focus", 96],
  ["mad", "mad", 96],
  ["celebrate", "celebrate", 96],
]) {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("width", size);
  svgEl.setAttribute("height", size);
  svgEl.setAttribute("viewBox", "0 0 24 24");
  svgEl.setAttribute("shape-rendering", "crispEdges");
  svgEl.setAttribute("class", `panda-px panda-px-${mood}`);
  const grid = mods.buildGrid(mood, 0);
  const palette = mods.PALETTE;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "px-wrapper");
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell === "." || !palette[cell]) continue;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", c);
      rect.setAttribute("y", r);
      rect.setAttribute("width", 1);
      rect.setAttribute("height", 1);
      rect.setAttribute("fill", palette[cell]);
      g.appendChild(rect);
    }
  }
  svgEl.appendChild(g);
  document.getElementById(id).appendChild(svgEl);
}
</script>
</body></html>
""")

with open(r"c:\Users\33973\Desktop\项目\test-panda.html", "w", encoding="utf-8") as f:
    f.write(html)
print("写入 test-panda.html")
