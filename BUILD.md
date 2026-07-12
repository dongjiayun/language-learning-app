# 构建与发布流程

## 环境要求

| 工具 | 用途 | 验证命令 |
|---|---|---|
| Node.js 18+ | 构建基础 | `node -v` |
| Xcode CLI | macOS 签名 & 打包 | `xcode-select -p` |
| Android SDK | Android APK 构建 | `ls ~/Library/Android/sdk/` |
| Java 17+ | Android Gradle | `java -version` |
| gh CLI | GitHub Release 创建 | `gh auth status` |

### 环境变量

```bash
# Android
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home)

# Electron 镜像（加速下载）
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
```

> electron-builder 自带 wine/NSIS 缓存（`~/Library/Caches/electron-builder/`），macOS 上也可交叉编译 Windows EXE。

---

## 完整发布流程（一键脚本）

```bash
# 1. 确保 gh CLI 已登录
gh auth status

# 2. 运行一键发布脚本
bash scripts/release.sh
```

`release.sh` 自动完成：
1. 运行测试
2. 选择版本升级类型（patch/minor/major）
3. 更新 CHANGELOG（自动从 git log 总结）
4. 构建 macOS DMG + Windows EXE + Linux AppImage
5. 构建 Web 版（`docs/app/`）
6. 更新官网（`docs/index.html` 版本号 + 下载链接 + 更新日志）
7. 提交 Git、打 Tag、推送 GitHub
8. 创建 GitHub Release 并上传安装包

---

## 分步手动流程

### 1. 前置检查

```bash
# 检查分支
git branch --show-current    # 应在 main 分支

# 检查未提交修改
git status --short           # 应干净

# 检查与远程同步
git fetch origin
git rev-list --count HEAD..origin/main   # 应返回 0

# 确保 gh 已登录
gh auth status
```

### 2. 更新版本号 + CHANGELOG

```bash
# 手动更新 package.json 中的 version 字段
# 手动编辑 CHANGELOG.md 添加版本条目

# 或使用脚本
node scripts/bump-version.mjs patch   # patch | minor | major
node scripts/update-changelog.mjs
```

### 3. 构建客户端（macOS + Windows）

```bash
# 清理旧的产物
rm -f release/*.dmg release/*.exe release/*.apk release/*.blockmap release/*.yml
rm -rf release/win-unpacked release/*.7z

# 设置镜像
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

# Vite 构建 Electron 应用
npx vite build --config vite.config.electron.ts

# Electron Builder 打包
npx electron-builder --mac --win --x64 --arm64 --publish never
```

**产物位置**：`release/`
- macOS: `LanguageLearner-<version>-arm64.dmg`
- Windows: `LanguageLearner-Setup-<version>.exe`
- blockmap 文件（增量更新用）

### 4. 构建 Android APK

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home)

# 同步 Capacitor web 资源
npx cap sync android

# 构建 APK
cd android && ./gradlew assembleRelease && cd ..

# 复制到 release 目录
cp android/app/build/outputs/apk/debug/app-debug.apk release/LanguageLearner-<version>.apk
# 或使用签名后的 release APK（需配置 keystore）
```

> `/gradlew assembleRelease` 产出未签名的 APK（`app-release-unsigned.apk`）。  
> 如需分发，请使用 debug 签名 APK（`app-debug.apk`）或配置 keystore 签名。

### 5. 构建 Web 版

```bash
npx vite build
# 产物: docs/app/
```

### 6. 更新官网

```bash
# 更新 docs/index.html 中的：
# - Hero 徽章版本号: v1.11.x
# - 下载链接中的版本号（DMG / EXE / APK）
# - 更新日志板块（新增 changelog-entry）
```

### 7. 提交 + 推送

```bash
git add -A
git commit -m "chore: release v<version>"
git tag -a "v<version>" -m "v<version>"
git push origin main
git push origin "v<version>"
```

### 8. 创建 GitHub Release

```bash
# 获取 CHANGELOG 对应版本的内容作为 Release Notes
RELEASE_NOTES=$(sed -n "/^## v<version>/,/^---/p" CHANGELOG.md | head -n -1)

# 创建 Release 并上传产物
gh release create "v<version>" \
  --title "v<version>" \
  --notes "$RELEASE_NOTES" \
  release/LanguageLearner-<version>-arm64.dmg \
  release/LanguageLearner-<version>-arm64.dmg.blockmap \
  release/LanguageLearner-Setup-<version>.exe \
  release/LanguageLearner-Setup-<version>.exe.blockmap \
  release/LanguageLearner-<version>.apk
```

---

## 各端产物

| 平台 | 产物 | 构建命令 | 大小参考 |
|---|---|---|---|
| macOS (Apple Silicon) | `LanguageLearner-<version>-arm64.dmg` | `npx electron-builder --mac --arm64` | ~97 MB |
| Windows 10/11 x64 | `LanguageLearner-Setup-<version>.exe` | `npx electron-builder --win --x64` | ~81 MB |
| Android 10+ | `LanguageLearner-<version>.apk` | `npx cap sync android && cd android && ./gradlew assembleRelease` | ~3.7 MB |
| Web | `docs/app/` | `npx vite build` | ~1 MB |

---

## 注意事项

1. **Android 签名**：分发前需要签名 APK。debug APK 可安装调试，不可上架商店
2. **Windows 交叉编译**：macOS 上需 electron-builder 缓存的 wine（`~/Library/Caches/electron-builder/wine-*`）
3. **GitHub Pages**：推送后需等待 1-5 分钟部署生效
4. **gh CLI**：Release 创建依赖 `gh auth login`，Token 需要 `repo` 和 `workflow` 权限

---

## 踩坑记录

### 1. macOS 26+ V8 CodeRange 崩溃

**现象**：App 启动即崩溃，报错 `Fatal process out of memory: Failed to reserve virtual memory for CodeRange`

**原因**：macOS 26 的虚拟内存布局变更，V8 JIT 的 CodeRange 无法分配大块连续虚拟内存。Electron 28 ~ 43 均受影响。

**修复**：在 `package.json` 的 `mac.extendInfo` 中添加：

```json
"ElectronCommandLine.switches": ["--js-flags=jitless"]
```

这会禁用 V8 JIT 编译，绕过 CodeRange 分配。对 UI 应用性能影响可忽略。

> 命令行验证：`/Applications/LanguageLearner.app/Contents/MacOS/LanguageLearner --no-sandbox --js-flags="--jitless"`

### 2. macOS 26+ 签名极慢

**现象**：`electron-builder` 的 `signing` 步骤卡住数分钟。

**原因**：macOS 26 的签名证书验证机制变化，使用 codesign 时会尝试联系 Apple 验证服务器。

**修复**：测试阶段跳过签名：

```bash
npx electron-builder --mac --arm64 --publish never --config.mac.identity=null
```

正式发布时仍需签名（用 `--mac` 不带 `identity=null`），签名的 Mac 上通常很快（< 30 秒）。

### 3. `ElectronCommandLine.switches` vs `LSEnvironment`

**现象**：在 `extendInfo` 中设置 `LSEnvironment.V8_OPTIONS=--jitless` 后双击依然崩溃，但终端运行正常。

**原因**：macOS 启动 App 时 `LSEnvironment` 的环境变量对 Electron 的 V8 初始化不生效。正确方式是通过 `ElectronCommandLine.switches` 传递 V8 参数。

### 4. `git reset --hard` 后 node_modules 过时

**现象**：`git reset --hard origin/main` 后 package.json 回退到旧版，但 `node_modules` 中还是新版 Electron，导致 `electron-builder` 使用的 Electron 版本与 package.json 不匹配。

**修复**：每次切换分支/重置后执行：

```bash
npm install
```

查看 electron-builder 实际使用的版本：

```bash
npx electron-builder --help | grep "electron-version" || echo "check logs for 'electron='"
```
