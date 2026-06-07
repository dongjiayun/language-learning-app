/**
 * Windows 打包配置测试
 *
 * 验证 package.json 和构建脚本的 Windows 配置是否正确。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve, join } from 'path'

const projectRoot = resolve(__dirname, '../../..')

function readPackageJson() {
  const pkgPath = join(projectRoot, 'package.json')
  return JSON.parse(readFileSync(pkgPath, 'utf8'))
}

function readGitignore() {
  const gitignorePath = join(projectRoot, '.gitignore')
  return readFileSync(gitignorePath, 'utf8')
}

function readFile(path: string): string {
  return readFileSync(path, 'utf8')
}

function fileExists(path: string): boolean {
  return existsSync(path)
}

// ============================================================
// package.json 配置
// ============================================================

describe('package.json — Windows 构建配置', () => {
  let pkg: any

  beforeEach(() => {
    pkg = readPackageJson()
  })

  describe('scripts', () => {
    it('应该包含 build:win 脚本', () => {
      expect(pkg.scripts).toHaveProperty('build:win')
      expect(pkg.scripts['build:win']).toBe('node scripts/build-win.mjs')
    })

    it('build 脚本应该保持 macOS 原有配置不变', () => {
      expect(pkg.scripts).toHaveProperty('build')
      expect(pkg.scripts.build).toContain('electron-builder')
      expect(pkg.scripts.build).toContain('dmg')
    })
  })

  describe('build.win', () => {
    it('应该包含 win 配置', () => {
      expect(pkg.build).toHaveProperty('win')
    })

    it('win.target 应该包含 nsis', () => {
      expect(pkg.build.win.target).toContain('nsis')
    })

    it('win.icon 应为 build/icon.ico', () => {
      expect(pkg.build.win.icon).toBe('build/icon.ico')
    })

    it('win.artifactName 应使用正确的命名模板', () => {
      expect(pkg.build.win.artifactName).toContain('${productName}')
      expect(pkg.build.win.artifactName).toContain('${version}')
    })
  })

  describe('build.nsis', () => {
    it('应该包含 nsis 配置', () => {
      expect(pkg.build).toHaveProperty('nsis')
    })

    it('oneClick 应为 false（允许自定义安装选项）', () => {
      expect(pkg.build.nsis.oneClick).toBe(false)
    })

    it('perMachine 应为 false（用户级安装）', () => {
      expect(pkg.build.nsis.perMachine).toBe(false)
    })

    it('allowToChangeInstallationDirectory 应为 true', () => {
      expect(pkg.build.nsis.allowToChangeInstallationDirectory).toBe(true)
    })

    it('language 应为 2052（简体中文）', () => {
      expect(pkg.build.nsis.language).toBe('2052')
    })

    it('deleteAppDataOnUninstall 应为 false', () => {
      expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(false)
    })

    it('应该包含 installerIcon 和 uninstallerIcon（.ico 格式）', () => {
      expect(pkg.build.nsis.installerIcon).toBe('build/icon.ico')
      expect(pkg.build.nsis.uninstallerIcon).toBe('build/icon.ico')
    })
  })

  describe('macOS 配置未受影响', () => {
    it('mac 配置应存在且不变', () => {
      expect(pkg.build).toHaveProperty('mac')
      expect(pkg.build.mac.target).toContain('dmg')
    })

    it('mac 配置应包含 entitlements', () => {
      expect(pkg.build.mac).toHaveProperty('entitlements')
      expect(pkg.build.mac.entitlements).toContain('entitlements.mac.plist')
    })
  })
})

// ============================================================
// .gitignore 配置
// ============================================================

describe('.gitignore — Windows 构建产物排除', () => {
  let gitignore: string

  beforeEach(() => {
    gitignore = readGitignore()
  })

  it('应该排除 release/ 目录', () => {
    expect(gitignore).toContain('release/')
  })

  it('应该排除 *.exe 文件', () => {
    expect(gitignore).toContain('*.exe')
  })

  it('应该保留原有的排除规则', () => {
    expect(gitignore).toContain('node_modules/')
    expect(gitignore).toContain('dist/')
    expect(gitignore).toContain('dist-electron/')
  })
})

// ============================================================
// build-win.mjs 脚本
// ============================================================

describe('scripts/build-win.mjs — 构建脚本', () => {
  const scriptPath = join(projectRoot, 'scripts', 'build-win.mjs')

  it('文件应该存在', () => {
    expect(fileExists(scriptPath)).toBe(true)
  })

  it('应该包含 vite build 命令', () => {
    const content = readFile(scriptPath)
    expect(content).toContain('vite build')
  })

  it('应该包含 electron-builder --win 命令', () => {
    const content = readFile(scriptPath)
    expect(content).toContain('electron-builder --win')
  })

  it('应该设置国内镜像源加速', () => {
    const content = readFile(scriptPath)
    expect(content).toContain('ELECTRON_MIRROR')
    expect(content).toContain('npmmirror.com')
  })

  it('应该检查 Node.js 环境', () => {
    const content = readFile(scriptPath)
    expect(content).toContain('node --version')
  })

  it('应该检查 ffmpeg 环境', () => {
    const content = readFile(scriptPath)
    expect(content).toContain('ffmpeg')
  })

  it('应该安装项目依赖', () => {
    const content = readFile(scriptPath)
    expect(content).toContain('yarn install')
  })

  it('应该更新版本号和 CHANGELOG', () => {
    const content = readFile(scriptPath)
    expect(content).toContain('bump-version')
    expect(content).toContain('update-changelog')
  })

  it('构建产物路径应为 dist/', () => {
      const content = readFile(scriptPath)
      expect(content).toContain('dist/')
    })
})

// ============================================================
// vite.config.electron.ts — Electron 构建配置
// ============================================================

describe('vite.config.electron.ts — 构建配置', () => {
  const configPath = join(projectRoot, 'vite.config.electron.ts')

  it('应该使用 esbuild 压缩', () => {
    const content = readFile(configPath)
    expect(content).toContain('minify')
    expect(content).toContain('esbuild')
  })

  it('sourcemap 应为 false', () => {
    const content = readFile(configPath)
    // 构建和插件中都应该禁用 sourcemap
    const sourcemapFalseCount = (content.match(/sourcemap:\s*false/g) || []).length
    expect(sourcemapFalseCount).toBeGreaterThanOrEqual(2)
  })
})
