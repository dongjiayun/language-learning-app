#!/usr/bin/env node

/**
 * DMG 背景图生成脚本包装器
 * 调用 Python 脚本生成安装背景
 */

import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pyScript = join(__dirname, 'generate-dmg-bg.py')

try {
  execSync(`python3 "${pyScript}"`, { stdio: 'inherit' })
  process.exit(0)
} catch {
  console.warn('⚠️  DMG 背景图生成失败（请确保已安装 Pillow: pip3 install Pillow），打包继续...')
  process.exit(0)
}
