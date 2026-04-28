import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// 测试只覆盖纯函数（shared/ 和 background/utils.ts 中的业务逻辑）。
// 这里单独配置一份 vitest.config.ts，避免 vite.config.ts 的 Chrome 扩展插件干扰。
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
