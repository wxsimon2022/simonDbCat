#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ─── Colors ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Help ────────────────────────────────────────────────
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<EOF
用法: bash scripts/release.sh [--upload-only] [--yes]

步骤:
  1. 构建前端 (vite build)
  2. 打包桌面应用 (electron-builder)
  3. 创建 Git Tag (格式: v<version>-<timestamp>)
  4. 推送到 GitHub
  5. 创建 GitHub Release 并上传构建产物

选项:
  --upload-only  跳过构建，仅用已有的 release/ 产物创建 Release
  --yes, -y       跳过确认提示，直接发布
  --help, -h     显示帮助

前置条件:
  - gh (GitHub CLI) 已安装并登录 (gh auth login)
  - git remote origin 已配置
EOF
  exit 0
fi

UPLOAD_ONLY="${1:-}"
SKIP_CONFIRM=false
[[ "$*" == *"--yes"* ]] || [[ "$*" == *"-y"* ]] && SKIP_CONFIRM=true

# ─── 检查 gh ─────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  err "未找到 gh (GitHub CLI)，请安装: brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  err "gh 未登录，请运行: gh auth login"
  exit 1
fi

# ─── 检查 git remote ─────────────────────────────────
REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$REMOTE" ]; then
  err "未配置 git remote origin，请先添加"
  exit 1
fi
info "远端仓库: $REMOTE"

# ─── 1. Build Frontend ────────────────────────────────
if [ "$UPLOAD_ONLY" != "--upload-only" ]; then
  info "🧹 清理旧构建..."
  rm -rf dist release

  info "📦 构建前端..."
  npx vite build
  ok "前端构建完成"

  # ─── 2. Package Desktop App ─────────────────────────
  info "🖥️  打包桌面应用..."
  npx electron-builder --config
  ok "桌面应用打包完成"
else
  info "⏭️  跳过构建，只创建 Release"
fi

if [ ! -d "$ROOT_DIR/release" ]; then
  err "未找到 release/ 目录，请先构建"
  exit 1
fi

# ─── 3. Bump version + Prepare Git Tag ────────────
info "🔢 基于最新 GitHub Release 递增版本..."
node scripts/bump-version.cjs patch --no-tag

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

info "🏷️  创建 Tag: $TAG"

# 确保工作区干净
if [ -n "$(git status --porcelain)" ]; then
  warn "工作区有未提交的更改，正在自动提交..."
  git add -A
  git commit -m "chore: release $TAG"
fi

git tag -a "$TAG" -m "release $TAG"
ok "Tag 已创建: $TAG"

# ─── 询问是否发布到 GitHub ────────────────────
if [ "$SKIP_CONFIRM" = false ]; then
  echo ""
  warn "即将推送 tag 和代码并创建 GitHub Release，确认发布?"
  read -p "  发布到 GitHub? [Y/n] " REPLY
  if [ "$REPLY" != "" ] && [ "$REPLY" != "Y" ] && [ "$REPLY" != "y" ] && [ "$REPLY" != "yes" ]; then
    info "⏭️  已跳过 GitHub 发布，本地打包完成 (release/ 目录)"
    echo ""
    echo "  Tag:     $TAG (仅本地)"
    echo "  产物:    release/"
    exit 0
  fi
  echo ""
fi
# ─── 4. Push Tag ─────────────────────────────────────
info "⬆️  推送 Tag 到 GitHub..."
git push origin "$TAG"
ok "Tag 已推送"

# 也推送主分支
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
info "⬆️  推送 $CURRENT_BRANCH 分支..."
git push origin "$CURRENT_BRANCH"
ok "分支已推送"

# ─── 5. Create GitHub Release ────────────────────────
info "📝 创建 GitHub Release..."

# 收集构建产物
ASSETS=()
while IFS= read -r -d '' f; do
  ASSETS+=("$f")
done < <(find "$ROOT_DIR/release" -maxdepth 1 -type f \( -name "*.dmg" -o -name "*.zip" -o -name "*.blockmap" \) -print0)

# 生成 Release 说明
RELEASE_NOTES=$(cat <<EOF
## simonDbCat v${VERSION}

### 构建信息
- 版本: ${VERSION}
- 构建时间: $(date '+%Y-%m-%d %H:%M:%S')
- Tag: ${TAG}

### 安装
- macOS: 下载 \`.dmg\` 文件并安装
- 或下载 \`.zip\` 解压后直接运行

### 更新内容
$(git log "$(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD" --oneline 2>/dev/null || echo "首次发布")
EOF
)

# 创建 Release（先用空的上传，再附加文件）
RELEASE_URL=$(gh release create "$TAG" \
  --title "simonDbCat v${VERSION}" \
  --notes "$RELEASE_NOTES" \
  ${#ASSETS[@]} --raw 2>/dev/null || gh release create "$TAG" \
  --title "simonDbCat v${VERSION}" \
  --notes "$RELEASE_NOTES")

# 上传构建产物
if [ ${#ASSETS[@]} -gt 0 ]; then
  info "⬆️  上传构建产物到 Release..."
  for asset in "${ASSETS[@]}"; do
    echo "  上传: $(basename "$asset") ($(du -h "$asset" | cut -f1))"
    gh release upload "$TAG" "$asset" --clobber
  done
  ok "所有产物已上传"
fi

ok "GitHub Release 创建完成 ✅"
echo ""
echo "  Release: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$TAG"
echo "  Tag:     $TAG"
echo ""
