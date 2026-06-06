/**
 * 版本管理脚本
 *
 * 用法：
 *   node scripts/bump-version.mjs patch   # 小版本 +1 (1.0.0 → 1.0.1)
 *   node scripts/bump-version.mjs minor   # 中版本 +1 (1.0.0 → 1.1.0)
 *   node scripts/bump-version.mjs major   # 大版本 +1 (1.0.0 → 2.0.0)
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = join(__dirname, '..', 'package.json')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const parts = pkg.version.split('.').map(Number)

const type = process.argv[2]

if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('用法: node scripts/bump-version.mjs <patch|minor|major>')
  process.exit(1)
}

switch (type) {
  case 'patch':
    parts[2] += 1
    break
  case 'minor':
    parts[1] += 1
    parts[2] = 0
    break
  case 'major':
    parts[0] += 1
    parts[1] = 0
    parts[2] = 0
    break
}

const newVersion = parts.join('.')
pkg.version = newVersion

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
console.log(`v${newVersion}`)
