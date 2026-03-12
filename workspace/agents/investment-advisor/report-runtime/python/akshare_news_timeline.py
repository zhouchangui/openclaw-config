#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import akshare as ak
import pandas as pd

TZ = ZoneInfo("Asia/Shanghai")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", dest="as_of")
    parser.add_argument("--window-hours", dest="window_hours", type=int, default=24)
    return parser.parse_args()


def now_local():
    return datetime.now(TZ)


def resolve_as_of(value):
    if not value:
        return now_local()
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=TZ)
    return parsed.astimezone(TZ)


def clean_text(value):
    if value is None:
      return ""
    text = str(value).replace("\r", " ").replace("\n", " ").strip()
    return " ".join(text.split())


def truncate(text, max_length=160):
    return text if len(text) <= max_length else f"{text[: max_length - 1]}…"


def iso_text(dt):
    return dt.astimezone(TZ).isoformat(timespec="seconds")


def parse_dt_text(value):
    text = clean_text(value)
    if not text:
        return None
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=TZ)
    return parsed.astimezone(TZ)


def fetch_global_em():
    frame = ak.stock_info_global_em()
    items = []
    for record in frame.to_dict("records"):
        published_at = parse_dt_text(record.get("发布时间"))
        title = clean_text(record.get("标题")) or truncate(clean_text(record.get("摘要")), 40)
        summary = clean_text(record.get("摘要")) or title
        if not title or not summary or not published_at:
            continue
        items.append(
            {
                "source": "东方财富全球资讯",
                "title": title,
                "summary": summary,
                "content": summary,
                "publishedAt": iso_text(published_at),
                "url": clean_text(record.get("链接")) or None,
            }
        )
    return items


def fetch_global_cls():
    frame = ak.stock_info_global_cls(symbol="全部")
    items = []
    for record in frame.to_dict("records"):
        published_date = record.get("发布日期")
        publish_time = clean_text(record.get("发布时间"))
        content = clean_text(record.get("内容"))
        title = clean_text(record.get("标题")) or truncate(content, 40)
        if published_date in (None, "") or not publish_time or not content:
            continue
        date_dt = pd.to_datetime(published_date, unit="ms", errors="coerce")
        if pd.isna(date_dt):
            continue
        try:
            hour, minute, second = [int(part) for part in publish_time.split(":")]
        except Exception:
            continue
        published_at = datetime(
            year=int(date_dt.year),
            month=int(date_dt.month),
            day=int(date_dt.day),
            hour=hour,
            minute=minute,
            second=second,
            tzinfo=TZ,
        )
        items.append(
            {
                "source": "财联社快讯",
                "title": title,
                "summary": truncate(content, 160),
                "content": content,
                "publishedAt": iso_text(published_at),
                "url": None,
            }
        )
    return items


def fetch_global_sina():
    frame = ak.stock_info_global_sina()
    items = []
    for record in frame.to_dict("records"):
        published_at = parse_dt_text(record.get("时间"))
        content = clean_text(record.get("内容"))
        title = truncate(content, 40)
        if not content or not published_at:
            continue
        items.append(
            {
                "source": "新浪全球快讯",
                "title": title,
                "summary": truncate(content, 160),
                "content": content,
                "publishedAt": iso_text(published_at),
                "url": None,
            }
        )
    return items


def fetch_cctv_items(as_of):
    items = []
    for date_value in {
        as_of.strftime("%Y%m%d"),
        (as_of - timedelta(days=1)).strftime("%Y%m%d"),
    }:
        frame = ak.news_cctv(date=date_value)
        for record in frame.to_dict("records"):
            title = clean_text(record.get("title"))
            content = clean_text(record.get("content"))
            if not title or not content:
                continue
            items.append(
                {
                    "source": "央视新闻",
                    "date": clean_text(record.get("date")) or date_value,
                    "title": title,
                    "summary": truncate(content, 160),
                }
            )
    return items


def main():
    args = parse_args()
    as_of = resolve_as_of(args.as_of)
    issues = []

    def capture(label, loader):
        try:
            return loader()
        except Exception as error:
            issues.append(f"{label}: {error}")
            return []

    payload = {
        "fetchedAt": iso_text(now_local()),
        "asOf": iso_text(as_of),
        "windowHours": args.window_hours,
        "items": [
            *capture("stock_info_global_em", fetch_global_em),
            *capture("stock_info_global_cls", fetch_global_cls),
            *capture("stock_info_global_sina", fetch_global_sina),
        ],
        "cctv": capture("news_cctv", lambda: fetch_cctv_items(as_of)),
        "issues": issues,
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
