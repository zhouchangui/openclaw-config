#!/usr/bin/env python3
"""
获取微信公众号草稿箱文章列表（标题）

读取 .secrets/wechat-config.json 中的 appid/secret，
获取 access_token 后调用 draft/batchget 接口。

Usage:
    python3 list_articles.py          # 获取最新 20 篇标题
    python3 list_articles.py -n 10    # 获取最新 10 篇
    python3 list_articles.py --json   # JSON 格式输出
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

# 配置文件路径：scripts/ 的上级就是项目根
SCRIPT_DIR = Path(__file__).parent
CONFIG_PATH = SCRIPT_DIR.parent / ".secrets" / "wechat-config.json"

TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token"
FREEPUBLISH_URL = "https://api.weixin.qq.com/cgi-bin/draft/batchget"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(f"[Error] 配置文件不存在：{CONFIG_PATH}", file=sys.stderr)
        sys.exit(1)
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def get_access_token(appid: str, secret: str) -> str:
    url = f"{TOKEN_URL}?grant_type=client_credential&appid={appid}&secret={secret}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"[Error] 获取 token 失败：{e}", file=sys.stderr)
        sys.exit(1)

    if "access_token" not in data:
        print(f"[Error] {data.get('errmsg', '未知错误')}", file=sys.stderr)
        sys.exit(1)

    return data["access_token"]


def fetch_articles(token: str, count: int = 20) -> list:
    """调用 freepublish/batchget，返回文章列表。"""
    url = f"{FREEPUBLISH_URL}?access_token={token}"
    payload = json.dumps({"offset": 0, "count": min(count, 20), "no_content": 1})

    req = urllib.request.Request(
        url,
        data=payload.encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"[Error] 请求失败：{e}", file=sys.stderr)
        sys.exit(1)

    if data.get("errcode"):
        print(f"[Error] API 错误 {data['errcode']}：{data.get('errmsg')}", file=sys.stderr)
        sys.exit(1)

    articles = []
    for item in data.get("item", []):
        for news in item.get("content", {}).get("news_item", []):
            articles.append({
                "title": news.get("title", ""),
                "digest": news.get("digest", ""),
                "url": news.get("url", ""),
            })

    return articles


def main():
    parser = argparse.ArgumentParser(description="获取公众号已发布文章标题")
    parser.add_argument("-n", "--number", type=int, default=20, help="获取数量（最多 20，默认 20）")
    parser.add_argument("--json", action="store_true", dest="as_json", help="JSON 格式输出")
    args = parser.parse_args()

    cfg = load_config()
    token = get_access_token(cfg["appid"], cfg["secret"])
    articles = fetch_articles(token, args.number)

    if not articles:
        print("暂无已发布文章")
        return

    if args.as_json:
        print(json.dumps(articles, ensure_ascii=False, indent=2))
    else:
        print(f"已发布文章（最新 {len(articles)} 篇）\n")
        print("-" * 50)
        for i, a in enumerate(articles, 1):
            print(f"{i:2}. {a['title']}")
        print("-" * 50)


if __name__ == "__main__":
    main()
