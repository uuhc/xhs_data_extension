// 简单打包：build 后把 dist 压缩为 zip
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const out = resolve(root, 'release');

if (!existsSync(dist)) {
  console.error('dist 目录不存在，请先 npm run build');
  process.exit(1);
}
if (!existsSync(out)) mkdirSync(out, { recursive: true });

const pkg = (await import(resolve(root, 'package.json'), { with: { type: 'json' } })).default;
const zipName = `${pkg.name}-${pkg.version}.zip`;
const zipPath = resolve(out, zipName);
if (existsSync(zipPath)) rmSync(zipPath);

execSync(`cd dist && zip -r "${zipPath}" .`, { stdio: 'inherit' });
console.log('\n已打包：', zipPath);
