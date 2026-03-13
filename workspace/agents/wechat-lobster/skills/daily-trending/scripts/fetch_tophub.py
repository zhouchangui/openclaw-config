#!/usr/bin/env python3
"""
Fetch trending topics from TopHub Data API.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Iterable


WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SECRETS_PATH = WORKSPACE_ROOT / ".secrets" / "tophub-config.json"
DEFAULT_API_BASE = "https://api.tophubdata.com"
DEFAULT_PLATFORMS = ("weibo", "zhihu", "baidu")

NODE_IDS = {
    "weibo": "KqndgxeLl9",
    "zhihu": "mproPpoq6O",
    "baidu": "Jb0vmloB1G",
    "36kr": "Q1Vd5Ko85R",
    "huxiu": "5VaobgvAj1",
    "thepaper": "wWmoO5Rd4E",
    "52pojie": "NKGoRAzel6",
    "hupu": "G47o8weMmN",
}


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def load_api_key(secrets_path: Path = DEFAULT_SECRETS_PATH) -> str:
    env_key = os.environ.get("TOPHUB_API_KEY", "").strip()
    if env_key:
        return env_key
    if secrets_path.exists():
        data = load_json(secrets_path)
        if isinstance(data, dict):
            for key_name in ("access_key", "api_key", "token"):
                value = data.get(key_name)
                if isinstance(value, str) and value.strip():
                    return value.strip()
    raise RuntimeError(
        f"Missing TopHub API key. Checked TOPHUB_API_KEY and {secrets_path}"
    )


def build_node_url(base_url: str, platform: str) -> str:
    node_id = NODE_IDS.get(platform)
    if not node_id:
        raise ValueError(f"Unsupported platform: {platform}")
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", f"nodes/{node_id}")


def fetch_json(url: str, api_key: str) -> object:
    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Authorization": api_key,
            "Accept": "application/json",
            "User-Agent": "OpenClaw-WeChat-Lobster/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if isinstance(payload, dict) and payload.get("error") is True:
                status = payload.get("status", "unknown")
                message = payload.get("msg") or payload.get("message") or "Unknown TopHub API error"
                raise RuntimeError(f"TopHub API error ({status}): {message}")
            return payload
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"TopHub request failed ({error.code}): {payload}") from error


def _iter_candidate_lists(payload: object) -> Iterable[list[object]]:
    if isinstance(payload, list):
        yield payload
        for item in payload:
            yield from _iter_candidate_lists(item)
    elif isinstance(payload, dict):
        for key in ("data", "items", "list", "records", "news", "children"):
            value = payload.get(key)
            if isinstance(value, list):
                yield value
        for value in payload.values():
            if isinstance(value, (dict, list)):
                yield from _iter_candidate_lists(value)


def extract_titles(payload: object, limit: int) -> list[str]:
    titles: list[str] = []
    seen: set[str] = set()
    for candidates in _iter_candidate_lists(payload):
        for item in candidates:
            if not isinstance(item, dict):
                continue
            raw = (
                item.get("title")
                or item.get("name")
                or item.get("headline")
                or item.get("description")
            )
            if not isinstance(raw, str):
                continue
            title = " ".join(raw.split())
            if not title or title in seen:
                continue
            seen.add(title)
            titles.append(title)
            if len(titles) >= limit:
                return titles
    return titles


def format_output(items_by_platform: dict[str, list[str]]) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    merged: list[str] = []
    seen: set[str] = set()
    for titles in items_by_platform.values():
        for title in titles:
            if title in seen:
                continue
            seen.add(title)
            merged.append(title)
    lines = ["======", "", f"🔥 Today's Trending ({today})", ""]
    for index, title in enumerate(merged[:5], start=1):
        lines.append(f"{index}. {title}")
    lines.extend(["", "======"])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch TopHub daily trending topics")
    parser.add_argument(
        "--platforms",
        default=",".join(DEFAULT_PLATFORMS),
        help="Comma-separated platform ids",
    )
    parser.add_argument("--limit", type=int, default=5, help="Items per platform")
    parser.add_argument("--base-url", default=DEFAULT_API_BASE, help="TopHub API base URL")
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Print raw JSON object keyed by platform instead of formatted text",
    )
    args = parser.parse_args()

    api_key = load_api_key()
    platforms = [part.strip() for part in args.platforms.split(",") if part.strip()]
    results: dict[str, list[str]] = {}

    for platform in platforms:
        url = build_node_url(args.base_url, platform)
        payload = fetch_json(url, api_key)
        results[platform] = extract_titles(payload, args.limit)

    if args.raw:
        json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return

    print(format_output(results))


if __name__ == "__main__":
    main()
