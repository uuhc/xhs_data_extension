// 同步 package-lock.json 的 version 字段到 package.json 的 version
// 用途：在 build 前调用，避免改了 package.json 版本但忘了 npm install 导致 lockfile 不同步
//
// 只改 version 字段，不触碰任何依赖；幂等、纯文本最小化变更。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');

if (!existsSync(lockPath)) {
  console.log('[sync-lock-version] package-lock.json not found, skip');
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const targetVersion = pkg.version;

const lockText = readFileSync(lockPath, 'utf8');
const lock = JSON.parse(lockText);

let changed = false;
if (lock.version !== targetVersion) {
  lock.version = targetVersion;
  changed = true;
}
if (lock.packages && lock.packages[''] && lock.packages[''].version !== targetVersion) {
  lock.packages[''].version = targetVersion;
  changed = true;
}

if (!changed) {
  console.log(`[sync-lock-version] already in sync at ${targetVersion}`);
  process.exit(0);
}

// 保留原文件末尾的换行风格
const trailingNewline = lockText.endsWith('\n') ? '\n' : '';
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + trailingNewline);
console.log(`[sync-lock-version] synced package-lock.json version → ${targetVersion}`);
