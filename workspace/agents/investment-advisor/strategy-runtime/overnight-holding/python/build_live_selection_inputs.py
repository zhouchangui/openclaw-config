#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import math
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MAX_TECHNICAL_CANDIDATES = 50
FILTERS = [
    "drop-st",
    "drop-halted",
    "drop-invalid-rows",
    "overnight-holding-technical",
]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", required=True, choices=["tushare", "akshare", "web"])
    parser.add_argument("--trading-date", dest="trading_date", required=True)
    return parser.parse_args()


def symbol_to_ts_code(symbol):
    if symbol.startswith(("600", "601", "603", "605", "688")):
        return f"{symbol}.SH"
    return f"{symbol}.SZ"


def ts_code_to_symbol(ts_code):
    return str(ts_code).split(".")[0].zfill(6)


def normalize_symbol(symbol):
    return str(symbol or "").split(".")[0].strip().zfill(6)


def resolve_name(name, symbol):
    resolved = str(name or "").strip()
    return resolved or normalize_symbol(symbol)


def is_st_name(name):
    normalized = str(name or "").upper().replace("*", "")
    return "ST" in normalized


def to_float(value, default=0.0):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(numeric) or math.isinf(numeric):
        return default
    return numeric


def mean(values):
    return sum(values) / len(values) if values else 0.0


def minmax(values):
    if not values:
        return {}
    low = min(values)
    high = max(values)
    if math.isclose(high, low):
        return {value: 1.0 for value in values}
    return {value: (value - low) / (high - low) for value in values}


def clamp(value, lower=0.0, upper=100.0):
    return max(lower, min(upper, value))


def normalize_history_rows(rows):
    normalized = []
    for row in rows:
        close = to_float(row.get("close"))
        open_price = to_float(row.get("open"))
        high = to_float(row.get("high"))
        low = to_float(row.get("low"))
        pre_close = to_float(row.get("pre_close"), close)
        pct = to_float(row.get("pct"))
        amount = to_float(row.get("amount"))
        turnover_rate = to_float(row.get("turnover_rate"))
        volume_ratio = to_float(row.get("volume_ratio"))
        if close <= 0 or high <= 0 or low <= 0 or amount <= 0:
            continue
        amplitude = ((high - low) / pre_close) * 100 if pre_close else 0
        close_position = 100.0 if math.isclose(high, low) and pct >= 0 else (
            50.0 if math.isclose(high, low) else ((close - low) / (high - low)) * 100
        )
        normalized.append(
            {
                "trade_date": str(row.get("trade_date")),
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "pre_close": pre_close,
                "pct": pct,
                "amount": amount,
                "turnover_rate": turnover_rate,
                "volume_ratio": volume_ratio,
                "amplitude": amplitude,
                "close_position": clamp(close_position),
            }
        )
    return normalized


def filter_full_market_rows(rows):
    filtered = []
    for row in rows:
        symbol = normalize_symbol(row.get("symbol"))
        name = resolve_name(row.get("name"), symbol)
        amount = to_float(row.get("amount"))
        close = to_float(row.get("close"))
        high = to_float(row.get("high"))
        low = to_float(row.get("low"))
        if not symbol or len(symbol) != 6:
            continue
        if is_st_name(name):
            continue
        if bool(row.get("halted")):
            continue
        if amount <= 0 or close <= 0 or high <= 0 or low <= 0:
            continue
        filtered.append(
            {
                **row,
                "symbol": symbol,
                "name": name,
            }
        )
    return filtered


def build_feature_rows_from_history(trading_date, rows_by_symbol):
    feature_rows = []
    target_trade_date = trading_date.replace("-", "")
    raw_universe_count = len(rows_by_symbol)
    for symbol, payload in rows_by_symbol.items():
        history = normalize_history_rows(payload.get("history", []))
        if len(history) < 3:
            continue
        latest = history[-1]
        if str(latest.get("trade_date")) != target_trade_date:
            continue
        closes = [item["close"] for item in history]
        amounts = [item["amount"] for item in history]
        ret3_base = closes[-4] if len(closes) >= 4 else closes[0]
        ret5_base = closes[-6] if len(closes) >= 6 else closes[0]
        prior_window = closes[-11:-1] if len(closes) >= 11 else closes[:-1]
        breakout_base = max(prior_window) if prior_window else latest["pre_close"]
        feature_rows.append(
            {
                "symbol": normalize_symbol(symbol),
                "name": resolve_name(payload.get("name"), symbol),
                "tradeDate": trading_date,
                "pct": latest["pct"],
                "ret3": ((latest["close"] / ret3_base) - 1) * 100 if ret3_base else 0,
                "ret5": ((latest["close"] / ret5_base) - 1) * 100 if ret5_base else 0,
                "avgAmount5": mean(amounts[-5:]) if amounts else latest["amount"],
                "amount": latest["amount"],
                "turnoverRate": latest["turnover_rate"],
                "volumeRatio": latest["volume_ratio"],
                "closePosition": latest["close_position"],
                "amplitude": latest["amplitude"],
                "breakoutPct": ((latest["close"] / breakout_base) - 1) * 100 if breakout_base else 0,
                "close": latest["close"],
                "open": latest["open"],
                "high": latest["high"],
                "low": latest["low"],
                "preClose": latest["pre_close"],
            }
        )
    filtered_rows = filter_full_market_rows(feature_rows)
    return filtered_rows, {
        "rawUniverseCount": raw_universe_count,
        "tradableUniverseCount": len(filtered_rows),
    }


def build_feature_rows_from_snapshot(trading_date, rows):
    normalized = []
    raw_universe_count = len(rows)
    for row in filter_full_market_rows(rows):
        pre_close = to_float(row.get("pre_close"), to_float(row.get("close")))
        close = to_float(row.get("close"))
        normalized.append(
            {
                "symbol": row["symbol"],
                "name": row["name"],
                "tradeDate": trading_date,
                "pct": to_float(row.get("pct")),
                "ret3": to_float(row.get("pct")) * 0.7,
                "ret5": to_float(row.get("pct")) * 0.9,
                "avgAmount5": to_float(row.get("amount")),
                "amount": to_float(row.get("amount")),
                "turnoverRate": to_float(row.get("turnover_rate")),
                "volumeRatio": to_float(row.get("volume_ratio")),
                "closePosition": clamp(to_float(row.get("close_position"))),
                "amplitude": to_float(row.get("amplitude")),
                "breakoutPct": ((close / pre_close) - 1) * 100 if pre_close else 0,
                "close": close,
                "open": to_float(row.get("open")),
                "high": to_float(row.get("high")),
                "low": to_float(row.get("low")),
                "preClose": pre_close,
            }
        )
    return normalized, {
        "rawUniverseCount": raw_universe_count,
        "tradableUniverseCount": len(normalized),
    }


def build_candidate_rows(trading_date, feature_rows, universe_stats=None):
    if not feature_rows:
        raise RuntimeError("provider returned no tradable rows")

    pct_norm = minmax([row["pct"] for row in feature_rows])
    ret5_norm = minmax([row["ret5"] for row in feature_rows])
    breakout_norm = minmax([row["breakoutPct"] for row in feature_rows])
    liq_values = [math.log(max(row["avgAmount5"], 1)) for row in feature_rows]
    liq_norm = minmax(liq_values)
    turnover_norm = minmax([row["turnoverRate"] for row in feature_rows])
    volume_ratio_norm = minmax([row["volumeRatio"] for row in feature_rows])

    candidates = []
    for row, liq_value in zip(feature_rows, liq_values):
        liquidity = round(
            clamp(40 + (liq_norm[liq_value] * 40) + (turnover_norm[row["turnoverRate"]] * 20)),
            2,
        )
        trend = round(
            clamp((ret5_norm[row["ret5"]] * 55) + (breakout_norm[row["breakoutPct"]] * 45)),
            2,
        )
        afternoon_support = round(clamp(row["closePosition"]), 2)
        amplitude_component = clamp(100 - min(row["amplitude"] * 7, 100))
        board_leadership = round(
            clamp((pct_norm[row["pct"]] * 65) + (volume_ratio_norm[row["volumeRatio"]] * 35)),
            2,
        )
        theme_resonance = round(
            clamp((ret5_norm[row["ret5"]] * 35) + (breakout_norm[row["breakoutPct"]] * 35) + (pct_norm[row["pct"]] * 30)),
            2,
        )
        next_day_realizability = round(
            clamp(
                (liquidity * 0.26)
                + (trend * 0.24)
                + (afternoon_support * 0.20)
                + (amplitude_component * 0.15)
                + (volume_ratio_norm[row["volumeRatio"]] * 100 * 0.15)
            ),
            2,
        )
        technical_score = round(
            (board_leadership * 0.20)
            + (theme_resonance * 0.22)
            + (liquidity * 0.12)
            + (trend * 0.18)
            + (afternoon_support * 0.10)
            + (next_day_realizability * 0.18),
            4,
        )
        candidates.append(
            {
                "symbol": row["symbol"],
                "name": row["name"],
                "boardLeadership": board_leadership,
                "themeResonance": theme_resonance,
                "liquidityStability": liquidity,
                "trendIntegrity": trend,
                "afternoonSupport": afternoon_support,
                "nextDayRealizability": next_day_realizability,
                "raw": {
                    "tradeDate": trading_date,
                    "pct": row["pct"],
                    "ret3": row["ret3"],
                    "ret5": row["ret5"],
                    "breakoutPct": row["breakoutPct"],
                    "amount": row["amount"],
                    "avgAmount5": row["avgAmount5"],
                    "turnoverRate": row["turnoverRate"],
                    "volumeRatio": row["volumeRatio"],
                    "amplitude": row["amplitude"],
                    "closePosition": row["closePosition"],
                    "decisionPrice": row["close"],
                    "close": row["close"],
                    "open": row["open"],
                    "high": row["high"],
                    "low": row["low"],
                    "preClose": row["preClose"],
                    "technicalScore": technical_score,
                },
            }
        )

    candidates.sort(key=lambda item: item["raw"]["technicalScore"], reverse=True)
    technical_candidates = candidates[:MAX_TECHNICAL_CANDIDATES]
    prefilter_summary = {
        "scope": "full-market",
        "filters": FILTERS,
        "rawUniverseCount": int((universe_stats or {}).get("rawUniverseCount") or len(feature_rows)),
        "tradableUniverseCount": int((universe_stats or {}).get("tradableUniverseCount") or len(feature_rows)),
        "technicalCandidatesCount": len(technical_candidates),
        "maxTechnicalCandidates": MAX_TECHNICAL_CANDIDATES,
        "universeCount": int((universe_stats or {}).get("rawUniverseCount") or len(feature_rows)),
        "eligibleRows": int((universe_stats or {}).get("tradableUniverseCount") or len(feature_rows)),
    }
    return technical_candidates, prefilter_summary


def build_market_snapshot(trading_date, candidates):
    sorted_by_theme = sorted(candidates, key=lambda item: item["themeResonance"], reverse=True)
    sorted_by_leadership = sorted(candidates, key=lambda item: item["boardLeadership"], reverse=True)
    raw_by_symbol = {item["symbol"]: item["raw"] for item in candidates}
    positive_ratio = (
        sum(1 for item in candidates if raw_by_symbol[item["symbol"]]["pct"] > 0) / len(candidates)
        if candidates
        else 0
    )
    top_two_pct = [raw_by_symbol[item["symbol"]]["pct"] for item in sorted_by_theme[:2]]
    top_three_support = [item["afternoonSupport"] for item in sorted_by_leadership[:3]]
    leader = sorted_by_leadership[0]
    return {
        "mainThemeClarity": round(mean([item["themeResonance"] for item in sorted_by_theme[:2]]), 2),
        "sectorBreadthConcentration": round(max(0, min(100, (positive_ratio * 60) + (mean(top_two_pct) * 4))), 2),
        "afternoonStrengthRetention": round(mean(top_three_support), 2),
        "coreLeaderConfirmation": round(
            max(0, min(100, (leader["boardLeadership"] * 0.6) + (leader["afternoonSupport"] * 0.4))),
            2,
        ),
        "provenance": {
            "tradeDate": trading_date,
            "method": "derived from full-market overnight technical screening",
            "candidateBasket": [item["symbol"] for item in candidates],
            "leaderSymbol": leader["symbol"],
        },
    }


def fetch_tushare_feature_rows(trading_date):
    try:
        import tushare as ts
        import tushare.pro.client as client
    except ImportError as error:  # pragma: no cover
        raise RuntimeError(f"tushare import failed: {error}") from error

    token = os.environ.get("INVESTMENT_TUSHARE_TOKEN") or os.environ.get("TUSHARE_TOKEN")
    if not token:
        raise RuntimeError("Missing INVESTMENT_TUSHARE_TOKEN or TUSHARE_TOKEN")

    base_url = (
        os.environ.get("INVESTMENT_TUSHARE_BASE_URL")
        or os.environ.get("TUSHARE_BASE_URL")
        or "http://tushare.xyz"
    )
    client.DataApi._DataApi__http_url = base_url
    pro = ts.pro_api(token)

    end_date = trading_date.replace("-", "")
    start_date = (datetime.strptime(trading_date, "%Y-%m-%d") - timedelta(days=35)).strftime("%Y%m%d")

    stock_basic = pro.stock_basic(
        exchange="",
        list_status="L",
        fields="ts_code,symbol,name",
    )
    daily = pro.daily(
        start_date=start_date,
        end_date=end_date,
        fields="ts_code,trade_date,open,high,low,close,pre_close,pct_chg,amount",
    )
    if daily is None or daily.empty:
        raise RuntimeError("tushare returned no daily rows")
    basic = pro.daily_basic(
        trade_date=end_date,
        fields="ts_code,turnover_rate,volume_ratio",
    )

    names = {}
    if stock_basic is not None and not stock_basic.empty:
        for row in stock_basic.to_dict("records"):
            names[str(row["ts_code"])] = row.get("name")

    basic_map = {}
    if basic is not None and not basic.empty:
        for row in basic.to_dict("records"):
            basic_map[str(row["ts_code"])] = {
                "turnover_rate": row.get("turnover_rate"),
                "volume_ratio": row.get("volume_ratio"),
            }

    rows_by_symbol = {}
    grouped = daily.sort_values(["ts_code", "trade_date"]).groupby("ts_code")
    for ts_code, frame in grouped:
        symbol = ts_code_to_symbol(ts_code)
        history = []
        latest_basic = basic_map.get(str(ts_code), {})
        for row in frame.to_dict("records"):
            history.append(
                {
                    "trade_date": row.get("trade_date"),
                    "open": row.get("open"),
                    "high": row.get("high"),
                    "low": row.get("low"),
                    "close": row.get("close"),
                    "pre_close": row.get("pre_close"),
                    "pct": row.get("pct_chg"),
                    "amount": row.get("amount"),
                    "turnover_rate": latest_basic.get("turnover_rate"),
                    "volume_ratio": latest_basic.get("volume_ratio"),
                }
            )
        rows_by_symbol[symbol] = {
            "name": names.get(str(ts_code), symbol),
            "history": history,
        }

    feature_rows, universe_stats = build_feature_rows_from_history(trading_date, rows_by_symbol)
    return feature_rows, {
        "featureMode": "full-market-history",
        "historyStartDate": start_date,
        "historyEndDate": end_date,
        **universe_stats,
    }, []


def fetch_akshare_feature_rows(trading_date):
    try:
        import akshare as ak
    except ImportError as error:  # pragma: no cover
        raise RuntimeError(f"akshare import failed: {error}") from error

    frame = ak.stock_zh_a_spot_em()
    if frame is None or frame.empty:
        raise RuntimeError("akshare returned no full-market snapshot")

    rows = []
    for row in frame.to_dict("records"):
        close = to_float(row.get("最新价"))
        open_price = to_float(row.get("今开"))
        high = to_float(row.get("最高"))
        low = to_float(row.get("最低"))
        pre_close = to_float(row.get("昨收"), close)
        amplitude = ((high - low) / pre_close) * 100 if pre_close else 0
        close_position = 100.0 if math.isclose(high, low) and close >= pre_close else (
            50.0 if math.isclose(high, low) else ((close - low) / (high - low)) * 100
        )
        rows.append(
            {
                "symbol": row.get("代码"),
                "name": row.get("名称"),
                "pct": row.get("涨跌幅"),
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "pre_close": pre_close,
                "amount": row.get("成交额"),
                "turnover_rate": row.get("换手率"),
                "volume_ratio": row.get("量比"),
                "amplitude": amplitude,
                "close_position": close_position,
                "halted": close <= 0 or to_float(row.get("成交额")) <= 0,
            }
        )

    feature_rows, universe_stats = build_feature_rows_from_snapshot(trading_date, rows)
    return feature_rows, {
        "featureMode": "full-market-snapshot",
        "snapshotProvider": "akshare",
        **universe_stats,
    }, []


def fetch_json(url, params):
    request = Request(
        f"{url}?{urlencode(params)}",
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://quote.eastmoney.com/",
        },
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310
        return json.loads(response.read().decode("utf-8"))


def fetch_web_feature_rows(trading_date):
    rows = []
    base_url = "https://82.push2.eastmoney.com/api/qt/clist/get"
    fs = "m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23"
    page = 1

    while True:
        payload = fetch_json(
            base_url,
            {
                "pn": page,
                "pz": 500,
                "po": 1,
                "np": 1,
                "ut": "bd1d9ddb04089700cf9c27f6f7426281",
                "fltt": 2,
                "invt": 2,
                "fid": "f3",
                "fs": fs,
                "fields": "f12,f14,f2,f3,f4,f5,f6,f15,f16,f17,f18,f8,f10",
            },
        )
        diff = ((payload or {}).get("data") or {}).get("diff") or []
        if not diff:
            break
        for item in diff:
            close = to_float(item.get("f2"))
            open_price = to_float(item.get("f17"))
            high = to_float(item.get("f15"))
            low = to_float(item.get("f16"))
            pre_close = to_float(item.get("f18"), close)
            amplitude = ((high - low) / pre_close) * 100 if pre_close else 0
            close_position = 100.0 if math.isclose(high, low) and close >= pre_close else (
                50.0 if math.isclose(high, low) else ((close - low) / (high - low)) * 100
            )
            rows.append(
                {
                    "symbol": item.get("f12"),
                    "name": item.get("f14"),
                    "pct": item.get("f3"),
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "pre_close": pre_close,
                    "amount": item.get("f6"),
                    "turnover_rate": item.get("f8"),
                    "volume_ratio": item.get("f10"),
                    "amplitude": amplitude,
                    "close_position": close_position,
                    "halted": close <= 0 or to_float(item.get("f6")) <= 0,
                }
            )
        total = int((((payload or {}).get("data") or {}).get("total") or 0))
        if len(rows) >= total:
            break
        page += 1

    if not rows:
        raise RuntimeError("web returned no full-market snapshot")

    feature_rows, universe_stats = build_feature_rows_from_snapshot(trading_date, rows)
    return feature_rows, {
        "featureMode": "full-market-snapshot",
        "snapshotProvider": "eastmoney-web",
        **universe_stats,
    }, []


def main():
    args = parse_args()
    if args.provider == "tushare":
        feature_rows, provider_meta, exceptions_and_fallbacks = fetch_tushare_feature_rows(args.trading_date)
    elif args.provider == "akshare":
        feature_rows, provider_meta, exceptions_and_fallbacks = fetch_akshare_feature_rows(args.trading_date)
    else:
        feature_rows, provider_meta, exceptions_and_fallbacks = fetch_web_feature_rows(args.trading_date)

    candidates, prefilter_summary = build_candidate_rows(
        args.trading_date,
        feature_rows,
        {
            "rawUniverseCount": provider_meta.get("rawUniverseCount"),
            "tradableUniverseCount": provider_meta.get("tradableUniverseCount"),
        },
    )
    market_snapshot = build_market_snapshot(args.trading_date, candidates)
    sector_continuity_score = round(
        (market_snapshot["mainThemeClarity"] * 0.3)
        + (market_snapshot["sectorBreadthConcentration"] * 0.2)
        + (market_snapshot["afternoonStrengthRetention"] * 0.25)
        + (market_snapshot["coreLeaderConfirmation"] * 0.25)
    )
    payload = {
        "provider": args.provider,
        "tradingDate": args.trading_date,
        "symbols": [item["symbol"] for item in candidates],
        "marketSnapshot": market_snapshot,
        "candidateSnapshot": {
            "sectorContinuityScore": sector_continuity_score,
            "candidates": candidates,
        },
        "prefilterSummary": prefilter_summary,
        "providerMeta": provider_meta,
        "exceptionsAndFallbacks": exceptions_and_fallbacks,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
