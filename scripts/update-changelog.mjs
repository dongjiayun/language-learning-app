#!/usr/bin/env node

/**
 * 构建后自动更新 CHANGELOG.md
 *
 * 在 bump-version 之后调用，往 CHANGELOG.md 顶部插入新版本条目。
 * 如果当天版本条目已存在则跳过（避免重复插入）。
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = join(__dirname, '..', 'package.json')
const changelogPath = join(__dirname, '..', 'CHANGELOG.md')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const version = pkg.version
const today = new Date().toISOString().slice(0, 10)

const changelog = readFileSync(changelogPath, 'utf-8')

// 如果当天版本条目已存在，跳过
const existingHeader = `## v${version} (${today})`
if (changelog.includes(existingHeader)) {
  console.log(`ℹ️  CHANGELOG v${version} (${today}) 已存在，跳过`)
  process.exit(0)
}

const newEntry = `# 更新日志

## v${version} (${today})

<!-- 请在此处填写 新增/变更/修复 内容 -->

---

${changelog.replace('# 更新日志\n\n', '')}`

writeFileSync(changelogPath, newEntry, 'utf-8')
console.log(`✅ CHANGELOG 已更新: v${version} (${today})`)
