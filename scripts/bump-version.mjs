// build 前自动把 package.json 的 version 的 patch 段 +1
// 仅 npm run build 时调用；npm run dev 不调用，避免频繁递增
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');
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
console.log(`版本递增 ${m[0]} → ${next}`);
