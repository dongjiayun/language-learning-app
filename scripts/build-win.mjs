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
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function run(cmd, env = {}) {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } })
}

/**
 * 后备方案：用 Node.js 将 PNG 包装为 ICO 文件。
 * 现代 Windows (Vista+) 支持 ICO 内嵌完整 PNG 数据，
 * 所以我们只需封装 ICO 头部 + PNG 字节即可。
 */
function generateIcoFromPng(pngPath, icoPath) {
  try {
    if (existsSync(icoPath)) {
      console.log('  ✓ icon.ico 已存在，跳过生成')
      return true
    }
    if (!existsSync(pngPath)) {
      console.warn(`  ⚠ 源 PNG 文件不存在: ${pngPath}`)
      return false
    }

    const pngData = readFileSync(pngPath)
    const size = pngData.length

    // ICO 文件头 (6 bytes)
    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0)      // reserved
    header.writeUInt16LE(1, 2)      // type: ICO
    header.writeUInt16LE(1, 4)      // count: 1 image

    // ICO 目录项 (16 bytes)
    const entry = Buffer.alloc(16)
    entry.writeUInt8(0, 0)          // width (0 = 256)
    entry.writeUInt8(0, 1)          // height (0 = 256)
    entry.writeUInt8(0, 2)          // color palette
    entry.writeUInt8(0, 3)          // reserved
    entry.writeUInt16LE(1, 4)       // color planes
    entry.writeUInt16LE(32, 6)      // bits per pixel
    entry.writeUInt32LE(size, 8)    // image data size
    entry.writeUInt32LE(22, 12)     // image data offset (header 6 + entry 16)

    writeFileSync(icoPath, Buffer.concat([header, entry, pngData]))
    console.log(`  ✓ icon.ico 已通过 Node.js 生成 (${size} bytes)`)
    return true
  } catch (err) {
    console.warn(`  ⚠ Node.js 生成 icon.ico 失败: ${err.message}`)
    return false
  }
}

console.log('========================================')
console.log('  外语口语学习助手 - Windows 构建脚本')
console.log('========================================')
console.log('')
console.log('  productName: DoulingoAssist (ASCII 安全路径名)')
console.log('  shortcutName: 外语口语学习助手 (中文显示名)')

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

// 生成 .ico 图标（必须存在，否则 electron-builder 会失败）
console.log('  生成 Windows 图标 (icon.ico)...')
const icoScript = 'scripts/png2ico.py'
let icoGenerated = false

// 优先用 Python 脚本生成
if (existsSync(icoScript)) {
  try {
    execSync(`python3 ${icoScript} build/icon.png build/icon.ico`, { stdio: 'pipe' })
    icoGenerated = true
    console.log('  ✓ icon.ico 通过 Python 生成成功')
  } catch {
    try {
      execSync(`python ${icoScript} build/icon.png build/icon.ico`, { stdio: 'pipe' })
      icoGenerated = true
      console.log('  ✓ icon.ico 通过 Python 生成成功')
    } catch {
      console.warn('  ⚠ Python 生成 icon.ico 失败，尝试 Node.js 后备方案')
    }
  }
} else {
  console.warn('  ⚠ 未找到 png2ico.py，尝试 Node.js 后备方案')
}

// 后备：Node.js 直接包装 PNG → ICO
const pngSource = existsSync('build/icon_512.png')
  ? 'build/icon_512.png'
  : existsSync('build/icon_256.png')
    ? 'build/icon_256.png'
    : 'build/icon.png'
if (!icoGenerated) {
  icoGenerated = generateIcoFromPng(pngSource, 'build/icon.ico')
}

// 最终检查
if (!icoGenerated || !existsSync('build/icon.ico')) {
  console.error('  ✗ icon.ico 生成失败，构建终止。请手动放置 build/icon.ico 文件')
  process.exit(1)
}

console.log('  (此步骤需要下载 Electron 和 NSIS 工具，耗时较长)')
console.log('')

const env = {
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    'https://npmmirror.com/mirrors/electron-builder-binaries/',
}

run('vite build --config vite.config.electron.ts', env)
run('electron-builder --win --x64 --publish never', env)

console.log('')
console.log('========================================')
console.log('  ✓ Windows 构建完成')
console.log('  安装包位置: release/')
console.log('========================================')
