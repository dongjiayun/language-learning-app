#!/usr/bin/env node

/**
 * 自动总结 CHANGELOG
 *
 * 读取自从上一个 tag 以来的 git commit，
 * 按 conventional commit 类型分类（feat/fix/docs/test/refactor/perf），
 * 自动填写 CHANGELOG.md 中新版本条目的内容。
 *
 * 用法：
 *   node scripts/changelog-autofill.mjs
 *
 * 前置条件：
 *   - 已执行 bump-version.mjs（package.json 版本已更新）
 *   - 已执行 update-changelog.mjs（CHANGELOG.md 已插入新版本头部）
 *   - 存在上个 tag（从 v1.9.0 之后开始）
 */

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pkgPath = join(root, 'package.json')
const changelogPath = join(root, 'CHANGELOG.md')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const version = pkg.version

// ---- 获取上一个 tag ----
function getLastTag() {
  try {
    const tags = execSync('git tag --sort=-creatordate', { encoding: 'utf8', cwd: root })
      .trim()
      .split('\n')
      .filter(Boolean)
    // 排除当前版本 tag（如果已存在）
    return tags.find(t => t !== `v${version}`) || null
  } catch {
    return null
  }
}

// ---- 获取 git log ----
function getGitLog(fromTag) {
  const range = fromTag ? `${fromTag}..HEAD` : 'HEAD'
  try {
    // 获取单行格式: "type: 描述"
    return execSync(`git log --oneline --no-decorate ${range}`, {
      encoding: 'utf8',
      cwd: root,
    }).trim()
  } catch {
    return ''
  }
}

// ---- 分类规则 ----
const CATEGORY_KEYS = ['feat', 'fix', 'docs', 'test', 'refactor', 'perf', 'style', 'chore', 'other']

// ---- 分类映射（中文标签） ----
const CATEGORY_LABELS = {
  feat: '新增',
  fix: '修复',
  docs: '文档',
  test: '测试',
  refactor: '重构',
  perf: '性能',
  style: '样式',
  chore: '变更',
  other: '其他',
}

function parseCommits(log) {
  return log.split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      // 格式: "hash type: message"
      const match = line.match(/^([a-f0-9]+)\s+(.+)/)
      if (!match) return null
      const hash = match[1]
      const fullMsg = match[2]

      // 提取 type
      const typeMatch = fullMsg.match(/^(\w+)[:(]\s*(.*)/)
      const category = (typeMatch?.[1] || 'other')
      const message = typeMatch?.[2]?.trim() || fullMsg.trim()

      return { hash, category, message }
    })
    .filter(c => c !== null)
}

/** 需要跳过短小无需记录的 chore 类型 */
const COMMIT_BLACKLIST_PREFIXES = [
  'chore: 更新',
  'chore: 发布',
  'docs: 官网',
  'docs: 更新',
  'docs: Android',
]

function shouldSkip(ci) {
  // 跳过 chore: 更新/发布 和无实质内容的 docs
  return COMMIT_BLACKLIST_PREFIXES.some(prefix =>
    ci.message.startsWith(prefix) || `${ci.category}: ${ci.message}`.startsWith(prefix)
  )
}

// ---- 生成 CHANGELOG 内容 ----
function generateChangelog(commits) {
  // 按分类分组
  const groups = {}
  const order = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'other']

  for (const ci of commits) {
    if (shouldSkip(ci)) continue

    const label = CATEGORY_LABELS[ci.category] || '其他'
    if (!groups[label]) groups[label] = []
    groups[label].push(ci.message)
  }

  // 构建 markdown
  const lines = []

  for (const cat of order) {
    const label = CATEGORY_LABELS[cat] || '其他'
    const items = groups[label]
    if (!items || items.length === 0) continue

    // 去重
    const unique = [...new Set(items)]
    lines.push(`### ${label}`)
    for (const item of unique) {
      lines.push(`- ${item}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

// ---- 主流程 ----
function main() {
  const lastTag = getLastTag()
  console.log(`ℹ️  上一个 tag: ${lastTag || '无'}`)

  const log = getGitLog(lastTag)
  if (!log) {
    console.error(`❌ 无法获取 git log`)
    process.exit(1)
  }

  const commits = parseCommits(log)
  console.log(`ℹ️  读取到 ${commits.length} 个 commit`)

  const content = generateChangelog(commits)

  // 读取 CHANGELOG.md
  let changelog = readFileSync(changelogPath, 'utf-8')

  // 查找新版本条目的占位符
  const versionHeader = `## v${version}`
  const headerIdx = changelog.indexOf(versionHeader)
  if (headerIdx === -1) {
    console.error(`❌ 未在 CHANGELOG.md 中找到 v${version} 条目，请先执行 update-changelog.mjs`)
    process.exit(1)
  }

  // 找到版本标题行的结束
  const headerEnd = changelog.indexOf('\n', headerIdx) + 1

  // 找到下一个版本标题（或文件末尾）
  const nextSection = changelog.indexOf('\n## ', headerEnd)
  const sectionEnd = nextSection === -1 ? changelog.length : nextSection

  // 当前条目的内容范围（从标题行到下一个版本前）
  const oldEntryContent = changelog.slice(headerEnd, sectionEnd)

  // 检查是否有占位符
  if (!oldEntryContent.includes('请在此处填写')) {
    console.log(`ℹ️  v${version} 条目已有内容，跳过自动填充`)
    return
  }

  // 构建新内容
  const newEntry = `\n\n${content}\n\n`

  // 替换掉占位符行
  let newContent = oldEntryContent
  // 移除 <!-- 请在此处填写 ... 内容 -->
  newContent = newContent.replace(/<!--[\s\S]*?-->\s*/g, '').trim()

  // 如果 newContent 为空或只有空白，用自动生成的内容替换
  const replacement = newContent.length > 0
    ? `${newContent}\n\n${content}`
    : content

  // 组装新 changelog
  changelog = changelog.slice(0, headerEnd) + '\n\n' + replacement + '\n\n---\n\n' + changelog.slice(sectionEnd + 1)

  writeFileSync(changelogPath, changelog, 'utf-8')
  console.log(`✅ CHANGELOG v${version} 已自动填充`)
  console.log('')
  console.log('--- 生成内容预览 ---')
  console.log(replacement)
  console.log('---')
}

main()
