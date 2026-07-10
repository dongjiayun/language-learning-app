#!/bin/bash
# 创建 GitHub Release 并上传构建产物
set -e

REPO="dongjiayun/language-learning-app"
TAG="v1.11.5"
RELEASE_DIR="release"

# 检查构建产物
for f in \
  "$RELEASE_DIR/LanguageLearner-1.11.5-arm64.dmg" \
  "$RELEASE_DIR/LanguageLearner-1.11.5-arm64.dmg.blockmap" \
  "$RELEASE_DIR/LanguageLearner-Setup-1.11.5.exe" \
  "$RELEASE_DIR/LanguageLearner-Setup-1.11.5.exe.blockmap" \
  "$RELEASE_DIR/LanguageLearner-1.11.5.apk"; do
  if [ ! -f "$f" ]; then
    echo "❌ 缺少: $f"
    exit 1
  fi
  echo "✅ $(basename $f)"
done

echo ""
echo "=== 输入 GitHub Token（或按回车跳过，手动创建 Release）==="
echo "Token: "
read -s TOKEN

if [ -z "$TOKEN" ]; then
  echo ""
  echo "跳过 Release 创建。请手动在 GitHub 上创建 Release:"
  echo "  1. 访问: https://github.com/$REPO/releases/new?tag=$TAG"
  echo "  2. 上传以下文件:"
  for f in "$RELEASE_DIR"/LanguageLearner-*; do
    echo "     - $(basename $f)"
  done
  exit 0
fi

echo ""
echo "=== 创建 Release ==="

BODY='{"tag_name":"v1.11.5","name":"v1.11.5","body":"### 修复\n- 划词翻译 API Key 已配置仍无法使用（getApiKey 增加 localStorage 回退）\n- 翻译接口 JSON 缺失 translation 字段时返回 \"undefined\" 字符串\n\n### 新增\n- 划词翻译 30 个完整测试用例覆盖","draft":false,"prerelease":false}'

RELEASE_RESP=$(curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/releases" \
  -d "$BODY")

RELEASE_ID=$(echo "$RELEASE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)

if [ -z "$RELEASE_ID" ]; then
  echo "❌ 创建 Release 失败:"
  echo "$RELEASE_RESP"
  exit 1
fi

echo "✅ Release 创建成功 (id: $RELEASE_ID)"

# 上传文件
upload() {
  local FILE="$1"
  local NAME="$2"
  local MIME="$3"
  echo "  上传 $NAME ..."
  curl -s -H "Authorization: token $TOKEN" \
    -H "Content-Type: $MIME" \
    "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$NAME" \
    --data-binary @"$FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('    ✅' if d.get('name') else '    ❌', d.get('name',''))"
}

upload "$RELEASE_DIR/LanguageLearner-1.11.5-arm64.dmg" "LanguageLearner-1.11.5-arm64.dmg" "application/x-apple-diskimage"
upload "$RELEASE_DIR/LanguageLearner-1.11.5-arm64.dmg.blockmap" "LanguageLearner-1.11.5-arm64.dmg.blockmap" "application/octet-stream"
upload "$RELEASE_DIR/LanguageLearner-Setup-1.11.5.exe" "LanguageLearner-Setup-1.11.5.exe" "application/x-msdownload"
upload "$RELEASE_DIR/LanguageLearner-Setup-1.11.5.exe.blockmap" "LanguageLearner-Setup-1.11.5.exe.blockmap" "application/octet-stream"
upload "$RELEASE_DIR/LanguageLearner-1.11.5.apk" "LanguageLearner-1.11.5.apk" "application/vnd.android.package-archive"

echo ""
echo "🎉 发布完成！"
echo "https://github.com/$REPO/releases/tag/$TAG"
