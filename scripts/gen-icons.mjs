// 把 icons/icon.svg 渲染为 16/32/48/128 四种尺寸 PNG，输出到 public/icons/
// public/ 下的文件会被 Vite 原样复制到 dist/ 根目录
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'icons/icon.svg');
const outDir = resolve(root, 'public/icons');

if (!existsSync(svgPath)) {
  console.error('未找到 SVG 源文件:', svgPath);
  process.exit(1);
}
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath, 'utf8');
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
    font: {
      // 让 resvg 自动加载系统字体，确保中文"红"能正常渲染
      loadSystemFonts: true,
      defaultFontFamily: 'PingFang SC',
    },
  });
  const png = resvg.render().asPng();
  const out = resolve(outDir, `icon-${size}.png`);
  writeFileSync(out, png);
  console.log('  ✓', `icons/icon-${size}.png`);
}

console.log('图标生成完成 →', outDir);
