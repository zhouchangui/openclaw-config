#!/usr/bin/env bash
# wechat-publisher: 发布 Markdown 到微信公众号草稿箱
# Usage: ./publish.sh <markdown-file> [theme] [highlight]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
DEFAULT_THEME="lapis"
DEFAULT_HIGHLIGHT="solarized-light"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# 检查 wenyan-cli 是否安装
check_wenyan() {
    if ! command -v wenyan &> /dev/null; then
        echo -e "${RED}❌ wenyan-cli 未安装！${NC}"
        echo -e "${YELLOW}正在安装 wenyan-cli...${NC}"
        npm install -g @wenyan-md/cli
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ wenyan-cli 安装成功！${NC}"
        else
            echo -e "${RED}❌ 安装失败！请手动运行: npm install -g @wenyan-md/cli${NC}"
            exit 1
        fi
    fi
}

# 从 project secrets 读取环境变量
load_credentials() {
    if [ -z "$WECHAT_APP_ID" ] || [ -z "$WECHAT_APP_SECRET" ]; then
        local secrets_candidates=(
            "$PROJECT_ROOT/.secrets/wechat-config.json"
            "$(pwd)/.secrets/wechat-config.json"
        )
        local secrets_path
        for secrets_path in "${secrets_candidates[@]}"; do
            [ -f "$secrets_path" ] || continue
            creds_output="$(python3 - "$secrets_path" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
app_id = data.get("appid") or data.get("appId") or data.get("WECHAT_APP_ID") or ""
app_secret = data.get("secret") or data.get("appSecret") or data.get("WECHAT_APP_SECRET") or ""
print(app_id)
print(app_secret)
PY
)"
            app_id="$(printf '%s\n' "$creds_output" | sed -n '1p')"
            app_secret="$(printf '%s\n' "$creds_output" | sed -n '2p')"
            if [ -n "${app_id:-}" ] && [ -n "${app_secret:-}" ]; then
                export WECHAT_APP_ID="$app_id"
                export WECHAT_APP_SECRET="$app_secret"
                break
            fi
        done
    fi
}

# 检查环境变量
check_env() {
    load_credentials
    
    if [ -z "$WECHAT_APP_ID" ] || [ -z "$WECHAT_APP_SECRET" ]; then
        echo -e "${RED}❌ 环境变量未设置！${NC}"
        echo -e "${YELLOW}请先检查项目 secrets：${NC}"
        echo ""
        echo "  $PROJECT_ROOT/.secrets/wechat-config.json"
        echo ""
        echo -e "${YELLOW}或者手动设置环境变量：${NC}"
        echo "  export WECHAT_APP_ID=your_app_id"
        echo "  export WECHAT_APP_SECRET=your_app_secret"
        exit 1
    fi
}

# 检查文件是否存在
check_file() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ 文件不存在: $file${NC}"
        exit 1
    fi
}

# 发布函数
publish() {
    local file="$1"
    local theme="${2:-$DEFAULT_THEME}"
    local highlight="${3:-$DEFAULT_HIGHLIGHT}"
    
    echo -e "${GREEN}📝 准备发布文章...${NC}"
    echo "  文件: $file"
    echo "  主题: $theme"
    echo "  代码高亮: $highlight"
    echo ""
    
    # 执行发布
    wenyan publish -f "$file" -t "$theme" -h "$highlight"
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ 发布成功！${NC}"
        echo -e "${YELLOW}📱 请前往微信公众号后台草稿箱查看：${NC}"
        echo "  https://mp.weixin.qq.com/"
    else
        echo ""
        echo -e "${RED}❌ 发布失败！${NC}"
        echo -e "${YELLOW}💡 常见问题：${NC}"
        echo "  1. IP 未在白名单 → 添加到公众号后台"
        echo "  2. Frontmatter 缺失 → 文件顶部添加 title + cover"
        echo "  3. API 凭证错误 → 检查 .secrets/wechat-config.json 或环境变量"
        echo "  4. 封面尺寸错误 → 需要 1080×864 像素"
        exit 1
    fi
}

# 显示帮助
show_help() {
    echo "Usage: $0 <markdown-file> [theme] [highlight]"
    echo ""
    echo "Examples:"
    echo "  $0 article.md"
    echo "  $0 article.md lapis"
    echo "  $0 article.md lapis solarized-light"
    echo ""
    echo "Available themes:"
    echo "  default, lapis, phycat, ..."
    echo "  Run 'wenyan theme -l' to see all themes"
    echo ""
    echo "Available highlights:"
    echo "  atom-one-dark, atom-one-light, dracula, github-dark, github,"
    echo "  monokai, solarized-dark, solarized-light, xcode"
}

# 主函数
main() {
    # 检查参数
    if [ $# -eq 0 ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
        show_help
        exit 0
    fi
    
    local file="$1"
    local theme="$2"
    local highlight="$3"
    
    # 执行检查
    check_wenyan
    check_env
    check_file "$file"
    
    # 发布文章
    publish "$file" "$theme" "$highlight"
}

# 运行
main "$@"
