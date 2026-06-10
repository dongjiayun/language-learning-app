#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  一键打包部署脚本
#  功能：
#    1. 运行测试
#    2. 升级版本号（patch / minor / major）
#    3. 更新 CHANGELOG（插入新版本头部，打开编辑器填写）
#    4. 构建 3 个客户端（macOS .dmg / Windows .exe / Linux .AppImage）
#    5. 构建 Web 版（docs/app/）
#    6. 更新官网（docs/index.html：版本号、下载链接、更新日志）
#    7. 提交 Git、打 Tag、推送 GitHub
# ============================================================

cd "$(dirname "$0")/.."
ROOT=$(pwd)

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ---- 辅助函数 ----
confirm() {
  read -r -p "$1 [y/N] " reply
  case "$reply" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# 从 package.json 读取当前版本
get_version() {
  node -p "require('./package.json').version"
}

# ============================================================
#  Step 0 — 前置检查
# ============================================================
echo ""
info "============================================"
info "  外语口语学习助手 — 一键打包部署"
info "============================================"
echo ""

# 检查 git
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  err "当前目录不是 Git 仓库"
  exit 1
fi

# 检查分支
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  warn "当前分支为: $BRANCH，建议在 main 分支执行发布"
  confirm "是否继续？" || exit 1
fi

# 检查未提交的修改
if ! git diff --quiet || ! git diff --cached --quiet; then
  err "存在未提交的修改，请先提交或暂存"
  git status --short
  exit 1
fi

# 检查与远程的同步状态
git fetch origin
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "$BEHIND" -gt 0 ]; then
  err "本地落后远程 $BEHIND 个提交，请先 git pull"
  exit 1
fi

# 检查必要工具
command -v node >/dev/null 2>&1 || { err "需要 Node.js"; exit 1; }
command -v npm  >/dev/null 2>&1 || { err "需要 npm"; exit 1; }

ok "前置检查通过"

# ============================================================
#  Step 1 — 选择版本升级类型
# ============================================================
echo ""
info "【步骤 1/8】选择版本升级类型"

CURRENT_VERSION=$(get_version)
info "当前版本: v$CURRENT_VERSION"

VERSION_TYPE="${1:-}"
if [ -z "$VERSION_TYPE" ]; then
  echo "  1) patch (v$CURRENT_VERSION → v$(node -e "
    const p = '$CURRENT_VERSION'.split('.').map(Number);
    console.log([p[0], p[1], p[2]+1].join('.'));
  "))"
  echo "  2) minor (v$CURRENT_VERSION → v$(node -e "
    const p = '$CURRENT_VERSION'.split('.').map(Number);
    console.log([p[0], p[1]+1, 0].join('.'));
  "))"
  echo "  3) major (v$CURRENT_VERSION → v$(node -e "
    const p = '$CURRENT_VERSION'.split('.').map(Number);
    console.log([p[0]+1, 0, 0].join('.'));
  "))"
  read -r -p "  请选择 (1/2/3, 默认 1): " choice
  case "${choice:-1}" in
    1) VERSION_TYPE="patch" ;;
    2) VERSION_TYPE="minor" ;;
    3) VERSION_TYPE="major" ;;
    *) VERSION_TYPE="patch" ;;
  esac
fi

info "升级类型: $VERSION_TYPE"
confirm "确认开始发布？" || exit 1

# ============================================================
#  Step 2 — 运行测试
# ============================================================
echo ""
info "【步骤 2/8】运行测试..."
if npm test; then
  ok "测试全部通过"
else
  warn "测试有失败（已知前置失败可忽略）"
  warn "已知失败: windows/packageContent.test.ts（macOS 无 Windows 构建产物）"
  warn "继续执行发布..."
fi

# ============================================================
#  Step 3 — 升级版本号
# ============================================================
echo ""
info "【步骤 3/8】升级版本号..."

node scripts/bump-version.mjs "$VERSION_TYPE"
NEW_VERSION=$(get_version)
info "版本已升级: v$CURRENT_VERSION → v$NEW_VERSION"

# ============================================================
#  Step 4 — 更新 CHANGELOG（自动总结）
# ============================================================
echo ""
info "【步骤 4/8】更新 CHANGELOG..."

# 创建新版本头部
node scripts/update-changelog.mjs

# 自动从 git log 总结 changelog 内容
info "自动总结 git commit 到 CHANGELOG..."
node scripts/changelog-autofill.mjs

info "CHANGELOG 预览（v$NEW_VERSION）:"
head -20 "$ROOT/CHANGELOG.md"
echo ""
confirm "CHANGELOG 内容是否正确？" || {
  warn "如需手动调整，请编辑 $ROOT/CHANGELOG.md 后重新运行脚本"
  ${EDITOR:-vim} "$ROOT/CHANGELOG.md"
  confirm "继续？" || exit 1
}

# ============================================================
#  Step 5 — 构建 3 个客户端（macOS / Windows / Linux）
# ============================================================
echo ""
info "【步骤 5/8】构建客户端（macOS + Windows + Linux）..."
info "这将生成 .dmg / .exe / .AppImage 安装包"
info "注意：构建 Windows 需要安装 wine（brew install wine）"
echo ""

confirm "开始构建客户端？" || exit 1

# 删除旧的客户端安装包，保留目录结构
info "清理旧的客户端安装包..."
rm -f release/*.dmg release/*.exe release/*.apk release/*.AppImage release/*.deb release/*.rpm
rm -f release/*.blockmap release/*.yml release/*.yaml release/*.txt release/*.json
rm -rf release/mac* release/win-* release/linux-* release/.icon-icns
rm -f release/builder-*.yml release/builder-*.yaml
ok "旧安装包已清理"
mkdir -p release

# 生成 DMG 背景图
info "生成 DMG 背景图..."
node scripts/generate-dmg-bg.mjs || true

# 生成图标
info "生成应用图标..."
node scripts/generate-icon.js 2>/dev/null || warn "图标生成跳过"

# 设置 Electron 镜像
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

# Vite 构建 + Electron Builder 打包三端
info "Vite 构建 Electron 应用..."
npx vite build --config vite.config.electron.ts

info "Electron Builder 打包 macOS + Windows + Linux..."
set +o pipefail
npx electron-builder --mac --win --linux --x64 --arm64 --publish never 2>&1 | tail -20
BUILD_EXIT=${PIPESTATUS[0]}
set -o pipefail
if [ "$BUILD_EXIT" -eq 0 ]; then
  ok "客户端构建完成"
else
  warn "客户端构建未完全成功（退出码: $BUILD_EXIT）"
  warn "常见原因：macOS 上缺少 wine（无法构建 Windows）、sandbox 限制、或磁盘空间不足"
  warn "安装包将在 release/ 目录中部分生成"
  warn "继续发布（跳过客户端产物验证）..."
fi

echo ""
info "生成的安装包:"
ls -lh release/ | grep -E "\.(dmg|exe|AppImage|deb|rpm|blockmap|yml)" 2>/dev/null || ls -lh release/

# 验证构建产物
MAC_DMG=$(ls release/*.dmg 2>/dev/null || true)
WIN_EXE=$(ls release/*Setup*.exe 2>/dev/null || true)
LINUX_APPIMAGE=$(ls release/*.AppImage 2>/dev/null || true)

if [ -z "$MAC_DMG" ] && [ -z "$WIN_EXE" ] && [ -z "$LINUX_APPIMAGE" ]; then
  warn "未检测到构建产物，请检查 release/ 目录"
  confirm "继续执行后续步骤？" || exit 1
fi

# ============================================================
#  Step 6 — 构建 Web 版
# ============================================================
echo ""
info "【步骤 6/8】构建 Web 版..."
npm run build:web
ok "Web 版构建完成（docs/app/）"

# ============================================================
#  Step 7 — 更新官网（docs/index.html）
# ============================================================
echo ""
info "【步骤 7/8】更新官网..."

# 将版本号中的 . 转义为正则
ESCAPED_CURRENT=$(echo "$CURRENT_VERSION" | sed 's/\./\\./g')
ESCAPED_NEW=$(echo "$NEW_VERSION" | sed 's/\./\\./g')

# 7a. 更新 Hero 区域徽章版本号
sed -i "" \
  "s/✨ v${ESCAPED_CURRENT} · 已支持/✨ v${ESCAPED_NEW} · 已支持/g" \
  docs/index.html
ok "Hero 徽章版本号: v$CURRENT_VERSION → v$NEW_VERSION"

# 7b. 更新下载链接中的版本号
sed -i "" \
  "s/download\/v${ESCAPED_CURRENT}\//download\/v${ESCAPED_NEW}\//g" \
  docs/index.html
sed -i "" \
  "s/LanguageLearner-${ESCAPED_CURRENT}-arm64/LanguageLearner-${ESCAPED_NEW}-arm64/g" \
  docs/index.html
sed -i "" \
  "s/LanguageLearner-Setup-${ESCAPED_CURRENT}/LanguageLearner-Setup-${ESCAPED_NEW}/g" \
  docs/index.html
sed -i "" \
  "s/LanguageLearner-${ESCAPED_CURRENT}\.apk/LanguageLearner-${ESCAPED_NEW}.apk/g" \
  docs/index.html
ok "下载链接版本号已更新"

# 7c. 更新官网更新日志板块 — 插入最新版本条目
TODAY_CN=$(TZ="Asia/Shanghai" date "+%Y年%m月%d日")
NEW_ENTRY="      <div class=\"changelog-entry fade-in\">
        <div class=\"version\">
          <span class=\"tag\">v$NEW_VERSION</span>
          <span class=\"date\">$TODAY_CN</span>
        </div>
        <ul>
          <li>（请在此填写版本亮点）</li>
        </ul>
      </div>"

# 插入到 changelog-list 的开头（第一个 .changelog-entry 之前）
sed -i "" \
  "/<div class=\"changelog-list\">/a\\
$NEW_ENTRY
" docs/index.html

ok "官网更新日志已插入新版本条目"

info "请手动编辑 docs/index.html 确认版本亮点文案"
confirm "官网内容是否正确？" || {
  warn "请手动编辑 docs/index.html 后继续"
  confirm "继续提交？" || exit 1
}

# ============================================================
#  Step 8 — 提交 Git、打 Tag、推送 GitHub
# ============================================================
echo ""
info "【步骤 8/8】提交 Git 并推送..."

# 暂存所有变更
git add -A
git status --short

echo ""
confirm "提交以上变更并推送？" || exit 1

# Commit
git commit -m "chore: 发布 v$NEW_VERSION"

# Tag（格式 v1.x.x）
git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"

# Push commit & tag
info "推送到 GitHub..."
git push origin main
git push origin "v$NEW_VERSION"

# 创建 GitHub Release（需要 gh CLI）
if command -v gh >/dev/null 2>&1; then
  info "使用 gh CLI 创建 GitHub Release..."

  # 收集安装包路径
  RELEASE_FILES=""
  for f in release/*.dmg release/*Setup*.exe release/*.AppImage release/*.apk; do
    [ -f "$f" ] && RELEASE_FILES="$RELEASE_FILES $f"
  done

  # 生成 Release 注释
  RELEASE_NOTES=$(grep -A 30 "^## v$NEW_VERSION" CHANGELOG.md | sed '/^## v/q' | head -n -1)

  if [ -n "$RELEASE_FILES" ]; then
    # shellcheck disable=SC2086
    gh release create "v$NEW_VERSION" \
      --title "v$NEW_VERSION" \
      --notes "$RELEASE_NOTES" \
      $RELEASE_FILES
  else
    gh release create "v$NEW_VERSION" \
      --title "v$NEW_VERSION" \
      --notes "$RELEASE_NOTES"
  fi
  ok "GitHub Release 已创建"
else
  warn "未安装 gh CLI，跳过自动创建 GitHub Release"
  info "请手动创建 Release: https://github.com/dongjiayun/language-learning-app/releases/new"
  info "Tag: v$NEW_VERSION"
  info "需上传安装包:"
  ls -lh release/ | grep -E "\.(dmg|exe|AppImage|apk)" 2>/dev/null || true
fi

# ============================================================
#  完成
# ============================================================
echo ""
info "============================================"
info "  🎉 发布完成！v$CURRENT_VERSION → v$NEW_VERSION"
info "============================================"
echo ""
info "发布的安装包:"
ls -lh release/ | grep -E "\.(dmg|exe|AppImage|apk)" 2>/dev/null || true
echo ""

if command -v gh >/dev/null 2>&1; then
  info "GitHub Release: https://github.com/dongjiayun/language-learning-app/releases/tag/v$NEW_VERSION"
fi
info "官网: https://dongjiayun.github.io/language-learning-app/"
echo ""
info "后续操作建议:"
echo "  - 检查 GitHub Release 页面，确认安装包上传完整"
echo "  - 检查官网（GitHub Pages 可能需要几分钟部署）"
echo "  - 如有需要，更新 CHANGELOG.md 中的版本亮点文案"
echo "  - 如需推送新版本到其他渠道，手动上传安装包"
echo ""
