/**
 * Windows 构建脚本
 *
 * 用法（在 Windows 上运行）：
 *   node scripts/build-win.mjs
 *
 * 或通过 npm：
 *   npm run build:win
 *
 * 前置依赖（Windows 环境需要安装）：
 *   - Node.js 18+
 *   - Yarn
 *   - Python 3（用于生成 .ico 图标）
 *   - ffmpeg（加入 PATH 环境变量）
 *   - Git
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'

function run(cmd, env = {}) {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } })
}

console.log('')
console.log('========================================')
console.log('  外语口语学习助手 - Windows 构建脚本')
console.log('========================================')
console.log('')

// ---- 检查环境 ----
console.log('[1/5] 检查构建环境...')

try {
  const nodeVer = execSync('node --version', { encoding: 'utf8' }).trim()
  console.log('  Node.js:', nodeVer)
} catch {
  console.error('  ✗ 未找到 Node.js，请先安装 Node.js 18+')
  process.exit(1)
}

try {
  execSync('yarn --version', { stdio: 'pipe' })
} catch {
  console.error('  ✗ 未找到 Yarn，请先安装: npm install -g yarn')
  process.exit(1)
}

// 检查 Python（用于生成 .ico）
try {
  execSync('python3 --version', { stdio: 'pipe' })
  console.log('  Python3: 已找到')
} catch {
  try {
    execSync('python --version', { stdio: 'pipe' })
    console.log('  Python: 已找到')
  } catch {
    console.warn('  ⚠ 未找到 Python，将跳过 .ico 图标生成')
  }
}

// 检查 ffmpeg（非必需，提示即可）
try {
  execSync('ffmpeg -version', { stdio: 'pipe' })
  console.log('  ffmpeg: 已找到')
} catch {
  console.warn('  ⚠ 未找到 ffmpeg，录音功能将不可用。请安装 ffmpeg 并加入 PATH')
}

console.log('  构建环境检查完成')
console.log('')

// ---- 安装依赖 ----
console.log('[2/5] 安装项目依赖...')
run('yarn install --frozen-lockfile')
console.log('')

// ---- 版本号 ----
console.log('[3/5] 自动升级补丁版本号...')
run('node scripts/bump-version.mjs patch')
console.log('')

// ---- 更新 CHANGELOG ----
console.log('[4/5] 更新 CHANGELOG...')
run('node scripts/update-changelog.mjs')
console.log('')

// ---- 构建 ----
console.log('[5/5] 构建 Windows 安装包...')
console.log('')

// 生成 .ico 图标
const icoScript = 'scripts/png2ico.py'
if (existsSync(icoScript)) {
  console.log('  生成 Windows 图标 (icon.ico)...')
  try {
    execSync(`python3 ${icoScript} build/icon.png build/icon.ico`, { stdio: 'pipe' })
    console.log('  ✓ icon.ico 生成成功')
  } catch {
    try {
      execSync(`python ${icoScript} build/icon.png build/icon.ico`, { stdio: 'pipe' })
      console.log('  ✓ icon.ico 生成成功')
    } catch (e) {
      console.warn('  ⚠ icon.ico 生成失败，将使用 PNG（需手动转换）')
    }
  }
} else {
  console.warn('  ⚠ 未找到 png2ico.py 脚本')
}

console.log('  (此步骤需要下载 Electron 和 NSIS 工具，耗时较长)')
console.log('')

const env = {
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    'https://npmmirror.com/mirrors/electron-builder-binaries/',
}

run('vite build --config vite.config.electron.ts', env)
run('electron-builder --win --publish never', env)

console.log('')
console.log('========================================')
console.log('  ✓ Windows 构建完成')
console.log('  安装包位置: dist/')
console.log('========================================')
