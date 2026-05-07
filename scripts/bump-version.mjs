// build 前自动把 package.json 的 version 的 patch 段 +1
// 仅 npm run build 时调用；npm run dev 不调用，避免频繁递增
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkgPath = resolve(root, 'package.json');
const lockPath = resolve(root, 'package-lock.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version || '');
if (!m) {
  console.error('package.json 的 version 不是 x.y.z 格式:', pkg.version);
  process.exit(1);
}
const [, major, minor, patch] = m;
const next = `${major}.${minor}.${Number(patch) + 1}`;
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

try {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = next;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
} catch {}

console.log(`版本递增 ${m[0]} → ${next}`);
