/**
 * Windows 安装包内容完整性测试
 *
 * 验证打包产物（release/ 目录）包含所有必需的文件，
 * 确保安装后能正常生成执行程序和文件入口。
 *
 * 运行:
 *   npx vitest run test/v1.1.0/windows/packageContent.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { resolve, join } from 'path'

const projectRoot = resolve(__dirname, '../../..')
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const productName: string = pkg.build.productName || pkg.name
const releaseDir = join(projectRoot, 'release')
const unpackedDir = join(releaseDir, 'win-unpacked')

function fileExists(path: string): boolean {
  return existsSync(path)
}

function fileSize(path: string): number {
  return statSync(path).size
}

function listAsarContent(): string[] {
  const { execSync } = require('child_process')
  try {
    const output = execSync(
      `npx asar list "${join(unpackedDir, 'resources', 'app.asar')}"`,
      { cwd: projectRoot, encoding: 'utf8', timeout: 10000 }
    )
    return output.trim().split('\n')
  } catch {
    return []
  }
}

// ============================================================
// release/ 目录构建产物完整性
// ============================================================

describe('release/ 目录 — 安装包产物', () => {
  it('release/ 目录应该存在', () => {
    expect(existsSync(releaseDir)).toBe(true)
  })

  it('应该存在 .exe 安装程序文件', () => {
    const files = [
      join(releaseDir, `${productName}-Setup-${pkg.version}.exe`),
    ]
    const found = files.some(f => fileExists(f))
    if (!found) {
      // fallback: 列出 release 目录下的所有 exe
      const { readdirSync } = require('fs')
      const allExe = readdirSync(releaseDir).filter((f: string) => f.endsWith('.exe'))
      console.log('  Found exe files:', allExe)
    }
    expect(found).toBe(true)
  })

  it('.exe 安装程序大小应合理（＞ 50MB）', () => {
    const exePath = join(releaseDir, `${productName}-Setup-${pkg.version}.exe`)
    expect(fileExists(exePath)).toBe(true)
    const sizeMB = fileSize(exePath) / (1024 * 1024)
    expect(sizeMB).toBeGreaterThan(50)
    console.log(`  ✓ 安装程序大小: ${sizeMB.toFixed(1)} MB`)
  })

  it('应该存在 .exe.blockmap 增量更新文件', () => {
    const mapPath = join(releaseDir, `${productName}-Setup-${pkg.version}.exe.blockmap`)
    expect(fileExists(mapPath)).toBe(true)
    expect(fileSize(mapPath)).toBeGreaterThan(0)
  })

  it('应该存在 builder-effective-config.yaml 有效配置', () => {
    const configPath = join(releaseDir, 'builder-effective-config.yaml')
    expect(fileExists(configPath)).toBe(true)
    const content = readFileSync(configPath, 'utf8')
    expect(content).toContain('appId: com.doulingo.assist')
    expect(content).toContain('nsis')
  })

  it('应该存在 latest.yml 自动更新配置', () => {
    const ymlPath = join(releaseDir, 'latest.yml')
    expect(fileExists(ymlPath)).toBe(true)
    const content = readFileSync(ymlPath, 'utf8')
    expect(content).toContain('version:')
    expect(content).toContain('exe')
  })
})

// ============================================================
// win-unpacked/ 解压目录完整性
// ============================================================

describe('win-unpacked/ — 解压应用目录', () => {
  it('解压目录应该存在', () => {
    expect(existsSync(unpackedDir)).toBe(true)
  })

  it('应该包含主执行文件（Electron 应用入口）', () => {
    const exeFiles = [
      join(unpackedDir, `${productName}.exe`),
      join(unpackedDir, 'electron.exe'),
    ]
    const found = exeFiles.some(f => fileExists(f))
    if (!found) {
      const { readdirSync } = require('fs')
      const allExe = readdirSync(unpackedDir).filter((f: string) => f.endsWith('.exe'))
      console.log('  Found exe in unpacked:', allExe)
    }
    expect(found).toBe(true)
  })

  it('主执行文件大小应合理（＞ 100MB）', () => {
    const exePath = join(unpackedDir, `${productName}.exe`)
    expect(fileExists(exePath)).toBe(true)
    const sizeMB = fileSize(exePath) / (1024 * 1024)
    expect(sizeMB).toBeGreaterThan(100)
    console.log(`  ✓ 主执行文件大小: ${sizeMB.toFixed(1)} MB`)
  })

  it('应该包含 resources/ 目录', () => {
    const resourcesDir = join(unpackedDir, 'resources')
    expect(existsSync(resourcesDir)).toBe(true)
  })

  it('应该包含 app.asar（应用代码归档）', () => {
    const asarPath = join(unpackedDir, 'resources', 'app.asar')
    expect(fileExists(asarPath)).toBe(true)
    expect(fileSize(asarPath)).toBeGreaterThan(1024 * 1024) // > 1MB
  })

  it('应该包含 elevate.exe（提权辅助）', () => {
    const elevatePath = join(unpackedDir, 'resources', 'elevate.exe')
    expect(fileExists(elevatePath)).toBe(true)
    expect(fileSize(elevatePath)).toBeGreaterThan(0)
  })

  it('应该包含 Electron 运行时核心 DLL', () => {
    const requiredDlls = [
      'd3dcompiler_47.dll',
      'ffmpeg.dll',
      'libEGL.dll',
      'libGLESv2.dll',
      'vk_swiftshader.dll',
      'vulkan-1.dll',
    ]
    for (const dll of requiredDlls) {
      expect(fileExists(join(unpackedDir, dll))).toBe(true)
    }
  })

  it('应该包含 icudtl.dat 国际化数据', () => {
    expect(fileExists(join(unpackedDir, 'icudtl.dat'))).toBe(true)
    expect(fileSize(join(unpackedDir, 'icudtl.dat'))).toBeGreaterThan(1024 * 1024)
  })

  it('应该包含 locales/ 本地化文件', () => {
    const localesDir = join(unpackedDir, 'locales')
    expect(existsSync(localesDir)).toBe(true)
    const zhCN = join(localesDir, 'zh-CN.pak')
    expect(fileExists(zhCN)).toBe(true)
  })

  it('应该包含 app-update.yml（应用更新配置）', () => {
    const updateYml = join(unpackedDir, 'resources', 'app-update.yml')
    expect(fileExists(updateYml)).toBe(true)
  })
})

// ============================================================
// app.asar 内部完整性
// ============================================================

describe('app.asar — 应用代码归档完整性', () => {
  let asarFiles: string[]

  beforeEach(() => {
    asarFiles = listAsarContent()
  })

  it('应该包含 /package.json', () => {
    expect(asarFiles).toContain('/package.json')
  })

  it('应该包含主进程入口 /dist-electron/main.js', () => {
    expect(asarFiles).toContain('/dist-electron/main.js')
  })

  it('应该包含预加载脚本 /dist-electron/preload.js', () => {
    expect(asarFiles).toContain('/dist-electron/preload.js')
  })

  it('应该包含渲染进程入口 /dist/index.html', () => {
    expect(asarFiles).toContain('/dist/index.html')
  })

  it('应该包含 JS 打包产物 /dist/assets/ 目录', () => {
    const hasJsAssets = asarFiles.some(f => f.startsWith('/dist/assets/') && f.endsWith('.js'))
    expect(hasJsAssets).toBe(true)
  })

  it('应该包含 CSS 样式文件', () => {
    const hasCssAssets = asarFiles.some(f => f.startsWith('/dist/assets/') && f.endsWith('.css'))
    expect(hasCssAssets).toBe(true)
  })

  it('应该包含运行时依赖 node_modules/', () => {
    const hasNodeModules = asarFiles.some(f => f.startsWith('/node_modules/'))
    expect(hasNodeModules).toBe(true)
  })

  it('node_modules/ 应该包含运行时依赖（vue, pinia, ws）', () => {
    const hasVue = asarFiles.some(f => f.startsWith('/node_modules/vue/'))
    const hasPinia = asarFiles.some(f => f.startsWith('/node_modules/pinia/'))
    const hasWs = asarFiles.some(f => f.startsWith('/node_modules/ws/'))
    expect(hasVue).toBe(true)
    expect(hasPinia).toBe(true)
    expect(hasWs).toBe(true)
  })

  it('node_modules/ 不应包含 electron 自身（peer dep）', () => {
    const asarFiles = listAsarContent()
    const hasElectron = asarFiles.some(f => f.startsWith('/node_modules/electron/'))
    expect(hasElectron).toBe(false)
  })
})

// ============================================================
// 构建资源配置完整性
// ============================================================

describe('build/ — 构建资源配置', () => {
  it('应该包含 icon.png（应用图标源文件）', () => {
    expect(fileExists(join(projectRoot, 'build', 'icon.png'))).toBe(true)
  })

  it('应该包含 icon.ico（Windows 图标）', () => {
    expect(fileExists(join(projectRoot, 'build', 'icon.ico'))).toBe(true)
    expect(fileSize(join(projectRoot, 'build', 'icon.ico'))).toBeGreaterThan(1000)
  })

  it('应该包含 icon_512.png（macOS 高分辨率图标）', () => {
    expect(fileExists(join(projectRoot, 'build', 'icon_512.png'))).toBe(true)
  })

  it('icon.png 和 icon.ico 应该大小合理', () => {
    const pngSize = fileSize(join(projectRoot, 'build', 'icon.png'))
    const icoSize = fileSize(join(projectRoot, 'build', 'icon.ico'))
    expect(pngSize).toBeGreaterThan(1000)
    expect(icoSize).toBeGreaterThan(1000)
    console.log(`  ✓ icon.png: ${(pngSize / 1024).toFixed(1)} KB, icon.ico: ${(icoSize / 1024).toFixed(1)} KB`)
  })
})

// ============================================================
// package.json 与构建产物一致性
// ============================================================

describe('package.json 配置与产物一致性', () => {
  it('package.json 中 main 字段指向 dist-electron/main.js', () => {
    expect(pkg.main).toBe('dist-electron/main.js')
  })

  it('package.json build.files 配置应该包含所有必需的文件模式', () => {
    const files = pkg.build.files
    expect(files).toContain('dist/index.html')
    expect(files).toContain('dist/assets/**/*')
    expect(files).toContain('dist-electron/**/*')
  })

  it('build.directories.output 应指向 release/', () => {
    expect(pkg.build.directories.output).toBe('release')
  })

  it('NSIS 配置应包含快捷方式设置', () => {
    expect(pkg.build.nsis.createDesktopShortcut).toBe(true)
    expect(pkg.build.nsis.createStartMenuShortcut).toBe(true)
    expect(pkg.build.nsis.shortcutName).toBeTruthy()
  })

  it('win.target.arch 应包含 x64', () => {
    const winTargets = pkg.build.win.target
    const hasX64 = winTargets.some((t: any) => t.arch && t.arch.includes('x64'))
    expect(hasX64).toBe(true)
  })

  it('productName 应为 ASCII 字符（避免安装目录中文路径问题）', () => {
    // ASCII 字符检查：所有字符码点都在 0-127 范围内
    const isAscii = productName.split('').every(c => c.charCodeAt(0) <= 127)
    expect(isAscii).toBe(true)
    console.log(`  ✓ productName: "${productName}" (纯 ASCII)`)
  })

  it('shortcutName 应为中文（用户看到的是中文名称）', () => {
    expect(pkg.build.nsis.shortcutName).toBe('外语口语学习助手')
  })
})

// ============================================================
// 安装场景验证
// ============================================================

describe('安装场景验证 — 安装后目录结构', () => {
  /**
   * 模拟安装后应该有的文件结构：
   *   $INSTDIR/
   *     DoulingoAssist.exe           （主程序，ASCII 路径名）
   *     resources/
   *       app.asar                   （应用代码）
   *       elevate.exe                （提权辅助）
   *     locales/                     （本地化文件）
   *     ...Electron 运行时文件...
   *     uninstall.exe                （卸载程序，由 NSIS 生成）
   *
   * 测试验证解压目录（win-unpacked/）已经包含上述结构，
   * 确保 NSIS 安装程序打包时不会遗漏文件。
   */
  it('解压目录应该包含 NSIS 安装所需的所有源文件', () => {
    const requiredPaths = [
      join(unpackedDir, `${productName}.exe`),
      join(unpackedDir, 'resources', 'app.asar'),
      join(unpackedDir, 'resources', 'elevate.exe'),
      join(unpackedDir, 'icudtl.dat'),
      join(unpackedDir, 'locales'),
      join(unpackedDir, 'locales', 'zh-CN.pak'),
      join(unpackedDir, 'locales', 'en-US.pak'),
    ]
    for (const p of requiredPaths) {
      expect(fileExists(p)).toBe(true)
    }
  })

  it('解压目录的 asar 中 package.json 应该与项目根一致', () => {
    // 验证 asar 中有对应的 main 入口
    const asarFiles = listAsarContent()
    expect(asarFiles).toContain('/' + pkg.main)
  })
})
