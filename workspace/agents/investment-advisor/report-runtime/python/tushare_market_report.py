#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

try:
    import tushare as ts
    import tushare.pro.client as client
except ImportError as error:  # pragma: no cover
    raise SystemExit(f"tushare import failed: {error}")

TZ = ZoneInfo("Asia/Shanghai")
INDEX_CODES = [
    ("000001.SH", "上证指数"),
    ("399001.SZ", "深证成指"),
    ("399006.SZ", "创业板指"),
]
GLOBAL_CODES = [
    ("IXIC", "纳斯达克指数"),
    ("SPX", "标普500"),
    ("HSI", "恒生指数"),
]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, choices=["morning", "quotes", "kline"])
    parser.add_argument("--trading-date", dest="trading_date")
    parser.add_argument("--lookback", type=int, default=30)
    return parser.parse_args()


def now_local():
    return datetime.now(TZ)


def iso_text(dt):
    return dt.astimezone(TZ).isoformat(timespec="seconds")


def resolve_trading_date(value):
    if value:
        return value.replace("-", "")
    return now_local().strftime("%Y%m%d")


def build_client():
    token = (
        os.environ.get("INVESTMENT_TUSHARE_TOKEN")
        or os.environ.get("TUSHARE_TOKEN")
    )
    if not token:
        raise RuntimeError(
            "Missing INVESTMENT_TUSHARE_TOKEN or TUSHARE_TOKEN for Tushare live fetch."
        )

    base_url = (
        os.environ.get("INVESTMENT_TUSHARE_BASE_URL")
        or os.environ.get("TUSHARE_BASE_URL")
        or "http://tushare.xyz"
    )
    client.DataApi._DataApi__http_url = base_url
    return ts.pro_api(token)


def ensure_frame(frame, label):
    if frame is None or frame.empty:
        raise RuntimeError(f"{label} returned no rows")
    return frame


def latest_row(frame):
    rows = frame.to_dict("records")
    if not rows:
        raise RuntimeError("no rows available")
    return rows[0]


def resolve_previous_open_trade_date(pro, trading_date):
    start_date = (datetime.strptime(trading_date, "%Y%m%d") - timedelta(days=10)).strftime("%Y%m%d")
    calendar = ensure_frame(
        pro.trade_cal(
            exchange="SSE",
            start_date=start_date,
            end_date=trading_date,
            fields="cal_date,is_open,pretrade_date",
        ),
        "trade_cal",
    )
    rows = [row for row in calendar.to_dict("records") if str(row.get("cal_date")) == trading_date]
    if not rows:
        raise RuntimeError(f"trade_cal missing {trading_date}")
    return rows[0].get("pretrade_date") or trading_date


def fetch_index_daily_row(pro, ts_code, trade_date):
    start_date = (datetime.strptime(trade_date, "%Y%m%d") - timedelta(days=10)).strftime("%Y%m%d")
    frame = ensure_frame(
        pro.index_daily(ts_code=ts_code, start_date=start_date, end_date=trade_date),
        f"index_daily {ts_code}",
    )
    return latest_row(frame)


def fetch_index_series(pro, ts_code, start_date, end_date, limit):
    frame = ensure_frame(
        pro.index_daily(ts_code=ts_code, start_date=start_date, end_date=end_date),
        f"index_daily series {ts_code}",
    )
    frame = frame.sort_values("trade_date").tail(limit)
    points = []
    for row in frame.to_dict("records"):
        points.append(
            {
                "tradeDate": str(row["trade_date"]),
                "open": float(row.get("open") or 0),
                "high": float(row.get("high") or 0),
                "low": float(row.get("low") or 0),
                "close": float(row.get("close") or 0),
                "volume": float(row.get("vol") or 0),
                "amount": float(row.get("amount") or 0),
            }
        )
    return points


def fetch_global_row(pro, ts_code, trade_date):
    start_date = (datetime.strptime(trade_date, "%Y%m%d") - timedelta(days=10)).strftime("%Y%m%d")
    frame = ensure_frame(
        pro.index_global(ts_code=ts_code, start_date=start_date, end_date=trade_date),
        f"index_global {ts_code}",
    )
    return latest_row(frame)


def classify_change(value):
    return "positive" if value >= 0 else "negative"


def format_change(value):
    prefix = "+" if value >= 0 else ""
    return f"{prefix}{value:.2f}%"


def build_market_note(name, pct_change):
    if pct_change >= 1:
        return f"{name}隔夜走强，风险偏好保持活跃。"
    if pct_change >= 0:
        return f"{name}表现偏稳，外部环境没有明显转弱。"
    return f"{name}回落，盘前需要留意外部扰动。"


def build_focus_areas(index_rows):
    sh = index_rows["000001.SH"]["pctChange"]
    sz = index_rows["399001.SZ"]["pctChange"]
    cyb = index_rows["399006.SZ"]["pctChange"]

    if cyb - sh >= 0.5:
        return [
            {"title": "成长制造开盘优先级更高", "bias": "偏多", "text": "创业板相对上证继续占优，盘前更值得优先跟踪高弹性成长制造的承接力度。"},
            {"title": "主板权重是否同步修复", "bias": "观察", "text": "若主板权重不拖后腿，今天的风险偏好扩散会更顺畅。"},
            {"title": "指数强弱继续看创业板相对优势", "bias": "观察", "text": "若创业板继续跑赢，说明市场更愿意为高弹性资产定价。"},
        ]
    if sh >= 0 and sz >= 0:
        return [
            {"title": "权重与顺周期稳住盘前框架", "bias": "偏多", "text": "大盘与深市同步偏强，说明盘前整体风险偏好并未走坏。"},
            {"title": "成长方向看是否跟随扩散", "bias": "观察", "text": "若成长方向同步放量，今天主线可能从权重修复扩散到高弹性品种。"},
            {"title": "指数结构优先看沪深共振", "bias": "观察", "text": "若沪深继续同向，盘前判断更接近稳中偏强。"},
        ]
    return [
        {"title": "先看承接，再决定进攻方向", "bias": "中性", "text": "指数分化明显时，盘前不宜过早预设单边主线，应先看承接质量。"},
        {"title": "高弹性方向先看冲高后的回落力度", "bias": "观察", "text": "如果高弹性方向冲高回落偏快，说明今天更适合防守和等待。"},
        {"title": "指数先看低开后的修复能力", "bias": "观察", "text": "若指数快速修复，说明盘前扰动对全天影响可能有限。"},
    ]


def build_morning_payload(pro, trading_date):
    previous_trade_date = resolve_previous_open_trade_date(pro, trading_date)
    global_markets = []
    issues = []

    for ts_code, name in GLOBAL_CODES:
        try:
            row = fetch_global_row(pro, ts_code, previous_trade_date)
            pct_change = float(row.get("pct_chg") or 0)
            close = float(row.get("close") or 0)
            global_markets.append(
                {
                    "name": name,
                    "value": f"{close:.2f}",
                    "change": format_change(pct_change),
                    "changePct": pct_change,
                    "changeClass": classify_change(pct_change),
                    "note": build_market_note(name, pct_change),
                }
            )
        except Exception as error:
            issues.append(f"index_global {ts_code}: {error}")

    index_rows = {}
    for ts_code, name in INDEX_CODES:
        row = fetch_index_daily_row(pro, ts_code, previous_trade_date)
        pct_change = float(row.get("pct_chg") or 0)
        index_rows[ts_code] = {
            "name": name,
            "pctChange": pct_change,
            "close": float(row.get("close") or 0),
        }

    if not global_markets:
        raise RuntimeError("morning report requires at least one global market row")

    focus_areas = build_focus_areas(index_rows)
    strongest = max(index_rows.values(), key=lambda item: item["pctChange"])
    headline = f"盘前先看 {focus_areas[0]['title']}，{strongest['name']}{format_change(strongest['pctChange'])} 对今天风险偏好更有指向性。"

    return {
        "source": "tushare-pro",
        "fetchedAt": iso_text(now_local()),
        "status": "ok" if not issues else "partial",
        "issues": issues,
        "headline": headline,
        "conclusionTags": [focus_areas[0]["title"], strongest["name"]],
        "summary": f"基于上一交易日收盘与隔夜全球指数，盘前更值得跟踪 {focus_areas[0]['title']} 是否得到开盘承接。",
        "globalMarkets": global_markets,
        "focusAreas": focus_areas,
        "premarketBias": [
            f"{strongest['name']}{format_change(strongest['pctChange'])}，说明上一交易日市场对该方向的风险偏好更高。",
            "若隔夜全球指数继续保持偏稳，盘前可以优先观察强势方向是否获得量价确认。",
            "若开盘后强势方向快速回吐，则说明盘前框架需要及时降级。",
        ],
        "policySignals": [
            {"title": "真实行情基线", "text": "晨报基于 Tushare 实时/近端交易日行情构建，不再使用静态 fixture。"},
            {"title": "结构优先", "text": "先看强弱结构，再决定今天应关注成长、权重还是防守。"},
            {"title": "盘前验证", "text": "真正有效的晨报判断仍要以开盘后 30 分钟承接来确认。"},
        ],
        "todayWatch": [
            f"观察 {focus_areas[0]['title']} 是否在开盘后继续得到承接。",
            "观察沪深主指数是否继续同向，避免盘前判断被分化行情快速打断。",
            "观察隔夜偏强资产是否在 A 股开盘后形成映射。 ",
        ],
        "risks": [
            "若强势方向高开低走，盘前偏多框架需要及时降温。",
            "若全球指数与国内强弱结构出现背离，需防止盘前判断失真。",
            "若实时消息流出现新增冲击，盘前报告应让位给盘中事实。",
        ],
        "detailRows": [
            *[
                {
                    "dimension": item["name"],
                    "value": item["value"],
                    "change": item["change"],
                    "interpretation": item["note"],
                }
                for item in global_markets
            ]
        ],
    }


def build_quotes_payload(pro, trading_date):
    indices = []
    for ts_code, name in INDEX_CODES:
        row = fetch_index_daily_row(pro, ts_code, trading_date)
        close = float(row.get("close") or 0)
        pre_close = float(row.get("pre_close") or 0)
        change = float(row.get("change") or (close - pre_close))
        pct_change = float(row.get("pct_chg") or 0)
        indices.append(
            {
                "symbol": ts_code.lower().replace(".sh", "").replace(".sz", ""),
                "name": name,
                "last": close,
                "previousClose": pre_close,
                "open": float(row.get("open") or 0),
                "high": float(row.get("high") or 0),
                "low": float(row.get("low") or 0),
                "change": change,
                "pctChange": pct_change,
                "volume": float(row.get("vol") or 0),
                "turnover": float(row.get("amount") or 0),
            }
        )

    return {
        "source": "tushare-pro-quotes",
        "fetchedAt": iso_text(now_local()),
        "status": "ok",
        "indices": indices,
    }


def build_kline_payload(pro, trading_date, lookback):
    end_date = trading_date
    start_date = (datetime.strptime(trading_date, "%Y%m%d") - timedelta(days=lookback * 2)).strftime("%Y%m%d")
    series = []
    for ts_code, name in INDEX_CODES:
        points = fetch_index_series(pro, ts_code, start_date, end_date, lookback)
        series.append(
            {
                "symbol": ts_code.lower().replace(".sh", "").replace(".sz", ""),
                "name": name,
                "points": points,
            }
        )

    return {
        "source": "tushare-pro-kline",
        "fetchedAt": iso_text(now_local()),
        "status": "ok",
        "series": series,
    }


def main():
    args = parse_args()
    pro = build_client()
    trading_date = resolve_trading_date(args.trading_date)

    if args.dataset == "morning":
        payload = build_morning_payload(pro, trading_date)
    elif args.dataset == "quotes":
        payload = build_quotes_payload(pro, trading_date)
    else:
        payload = build_kline_payload(pro, trading_date, args.lookback)

    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
