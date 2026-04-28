import { defineConfig, type Plugin, type UserConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import manifest from './src/manifest';

/**
 * 把 dist/src/panel/ 扁平化为 dist/panel/，并同步改写 manifest.json 中的引用，
 * 让 dist 产物不再出现 src/ 前缀，看起来像一个"标准 Chrome 扩展"目录。
 */
function flattenPanelDir(): Plugin {
  return {
    name: 'flatten-panel-dir',
    apply: 'build',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const srcPanel = resolve(distDir, 'src/panel');
      const dstPanel = resolve(distDir, 'panel');
      const srcRoot = resolve(distDir, 'src');
      const manifestPath = resolve(distDir, 'manifest.json');
      if (!existsSync(srcPanel) || !existsSync(manifestPath)) return;

      // Windows 上 renameSync 跨目录 / 目标已存在会 EPERM，
      // 改成 cpSync(recursive) + rmSync 更稳。
      if (existsSync(dstPanel)) rmSync(dstPanel, { recursive: true, force: true });
      cpSync(srcPanel, dstPanel, { recursive: true });
      rmSync(srcPanel, { recursive: true, force: true });

      // 删空的 dist/src（如果只剩它自己）
      try {
        rmSync(srcRoot, { recursive: true, force: true });
      } catch {}

      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (m?.side_panel?.default_path === 'src/panel/index.html') {
        m.side_panel.default_path = 'panel/index.html';
        writeFileSync(manifestPath, JSON.stringify(m, null, 2));
      }
    },
  };
}

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  const config: UserConfig = {
    plugins: [vue(), crx({ manifest }), flattenPanelDir()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      outDir: 'dist',
      target: 'esnext',
      minify: true,
      rollupOptions: {
        output: { chunkFileNames: 'assets/[name]-[hash].js' },
      },
    },
    server: { port: 5174, strictPort: true },
  };
  if (isBuild) {
    // 生产构建剔除 console / debugger：避免错误堆栈把 chrome-extension://<id>/ 泄露到页面埋点。
    // 开发 (`vite dev`) 保留，便于调试。
    config.esbuild = { drop: ['console', 'debugger'] };
  }
  return config;
});
