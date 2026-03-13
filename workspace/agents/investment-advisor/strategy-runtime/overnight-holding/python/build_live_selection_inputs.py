#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import math
import os
from datetime import datetime, timedelta

import pandas as pd

DEFAULT_SYMBOL_NAMES = {
    "300750": "宁德时代",
    "002594": "比亚迪",
    "601991": "大唐发电",
    "600121": "郑州煤电",
    "600519": "贵州茅台",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", required=True, choices=["tushare", "akshare"])
    parser.add_argument("--trading-date", dest="trading_date", required=True)
    parser.add_argument("--symbols", required=True)
    return parser.parse_args()


def symbol_to_ts_code(symbol):
    if symbol.startswith(("600", "601", "603", "605", "688")):
        return f"{symbol}.SH"
    return f"{symbol}.SZ"


def ts_code_to_symbol(ts_code):
    return str(ts_code).split(".")[0]


def resolve_symbols(symbols_text):
    return [item.strip() for item in str(symbols_text).split(",") if item.strip()]


def resolve_name(symbol):
    return DEFAULT_SYMBOL_NAMES.get(symbol, symbol)


def normalize_rows(rows):
    normalized = []
    for row in rows:
        close = float(row["close"])
        open_price = float(row["open"])
        high = float(row["high"])
        low = float(row["low"])
        pre_close = float(row["pre_close"]) if row.get("pre_close") not in (None, "") else close
        pct = float(row["pct"])
        amount = float(row["amount"])
        turnover_rate = float(row.get("turnover_rate") or 0)
        amplitude = (
            ((high - low) / pre_close) * 100 if pre_close else 0
        )
        if high == low:
            close_position = 100.0 if pct >= 0 else 50.0
        else:
            close_position = ((close - low) / (high - low)) * 100
        normalized.append(
            {
                "trade_date": str(row["trade_date"]),
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "pre_close": pre_close,
                "pct": pct,
                "amount": amount,
                "turnover_rate": turnover_rate,
                "amplitude": amplitude,
                "close_position": max(0.0, min(100.0, close_position)),
            }
        )
    return normalized


def fetch_tushare_rows(symbols, trading_date):
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

    start_date = (datetime.strptime(trading_date, "%Y-%m-%d") - timedelta(days=20)).strftime("%Y%m%d")
    end_date = trading_date.replace("-", "")
    rows_by_symbol = {}
    for symbol in symbols:
        ts_code = symbol_to_ts_code(symbol)
        daily = pro.daily(
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields="ts_code,trade_date,open,high,low,close,pre_close,pct_chg,amount",
        )
        if daily is None or daily.empty:
            continue
        basic = pro.daily_basic(
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields="ts_code,trade_date,turnover_rate",
        )
        merged = daily.merge(
            basic[["trade_date", "turnover_rate"]] if basic is not None and not basic.empty else pd.DataFrame(columns=["trade_date", "turnover_rate"]),
            on="trade_date",
            how="left",
        )
        merged = merged.sort_values("trade_date")
        merged_rows = []
        for row in merged.to_dict("records"):
            merged_rows.append(
                {
                    "trade_date": row["trade_date"],
                    "open": row["open"],
                    "high": row["high"],
                    "low": row["low"],
                    "close": row["close"],
                    "pre_close": row.get("pre_close"),
                    "pct": row.get("pct_chg") or 0,
                    "amount": row.get("amount") or 0,
                    "turnover_rate": row.get("turnover_rate") or 0,
                }
            )
        rows_by_symbol[symbol] = normalize_rows(merged_rows)
    return rows_by_symbol


def fetch_akshare_rows(symbols, trading_date):
    try:
        import akshare as ak
    except ImportError as error:  # pragma: no cover
        raise RuntimeError(f"akshare import failed: {error}") from error

    start_date = (datetime.strptime(trading_date, "%Y-%m-%d") - timedelta(days=20)).strftime("%Y%m%d")
    end_date = trading_date.replace("-", "")
    rows_by_symbol = {}
    for symbol in symbols:
        frame = ak.stock_zh_a_hist(
            symbol=symbol,
            period="daily",
            start_date=start_date,
            end_date=end_date,
            adjust="",
        )
        if frame is None or frame.empty:
            continue
        frame = frame.sort_values("日期")
        normalized_rows = []
        previous_close = None
        for row in frame.to_dict("records"):
            close = float(row["收盘"])
            normalized_rows.append(
                {
                    "trade_date": str(row["日期"]).replace("-", ""),
                    "open": row["开盘"],
                    "high": row["最高"],
                    "low": row["最低"],
                    "close": close,
                    "pre_close": previous_close if previous_close is not None else close,
                    "pct": row.get("涨跌幅") or 0,
                    "amount": row.get("成交额") or 0,
                    "turnover_rate": row.get("换手率") or 0,
                }
            )
            previous_close = close
        rows_by_symbol[symbol] = normalize_rows(normalized_rows)
    return rows_by_symbol


def mean(values):
    return sum(values) / len(values) if values else 0


def minmax(values):
    if not values:
        return {}
    low = min(values)
    high = max(values)
    if high == low:
        return {value: 1.0 for value in values}
    return {value: (value - low) / (high - low) for value in values}


def build_candidates(trading_date, rows_by_symbol):
    rows = []
    for symbol, history in rows_by_symbol.items():
        if not history:
            continue
        closes = [item["close"] for item in history]
        amounts = [item["amount"] for item in history]
        latest = history[-1]
        ret5_base = closes[-6] if len(closes) >= 6 else closes[0]
        ret5 = ((closes[-1] / ret5_base) - 1) * 100 if ret5_base else 0
        rows.append(
            {
                "symbol": symbol,
                "name": resolve_name(symbol),
                "pct": latest["pct"],
                "ret5": ret5,
                "avgAmount5": mean(amounts[-5:]),
                "closePosition": latest["close_position"],
                "amplitude": latest["amplitude"],
                "tradeDate": trading_date,
                "close": latest["close"],
                "open": latest["open"],
                "high": latest["high"],
                "low": latest["low"],
                "turnoverRate": latest["turnover_rate"],
                "amount": latest["amount"],
            }
        )

    if not rows:
        raise RuntimeError("provider returned no tradable rows")

    pct_norm = minmax([item["pct"] for item in rows])
    combo_values = [(item["pct"] * 0.6) + (item["ret5"] * 0.4) for item in rows]
    combo_norm = minmax(combo_values)
    liq_values = [math.log(max(item["avgAmount5"], 1)) for item in rows]
    liq_norm = minmax(liq_values)
    ret5_norm = minmax([item["ret5"] for item in rows])

    candidates = []
    for item, combo_value, liq_value in zip(rows, combo_values, liq_values):
        liquidity = round(45 + liq_norm[liq_value] * 55, 2)
        trend = round(35 + ret5_norm[item["ret5"]] * 65, 2)
        amplitude_component = max(0, 100 - min(item["amplitude"] * 8, 100))
        candidates.append(
            {
                "symbol": item["symbol"],
                "name": item["name"],
                "boardLeadership": round(40 + pct_norm[item["pct"]] * 60, 2),
                "themeResonance": round(30 + combo_norm[combo_value] * 70, 2),
                "liquidityStability": liquidity,
                "trendIntegrity": trend,
                "afternoonSupport": round(item["closePosition"], 2),
                "nextDayRealizability": round(
                    max(
                        0,
                        min(
                            100,
                            (0.45 * liquidity)
                            + (0.25 * trend)
                            + (0.20 * amplitude_component)
                            + (0.10 * item["closePosition"]),
                        ),
                    ),
                    2,
                ),
                "raw": {
                    **item,
                    "decisionPrice": item["close"],
                },
            }
        )
    return candidates


def build_market_snapshot(trading_date, candidates):
    sorted_by_theme = sorted(candidates, key=lambda item: item["themeResonance"], reverse=True)
    sorted_by_leadership = sorted(candidates, key=lambda item: item["boardLeadership"], reverse=True)
    raw_by_symbol = {item["symbol"]: item["raw"] for item in candidates}
    positive_ratio = sum(1 for item in candidates if raw_by_symbol[item["symbol"]]["pct"] > 0) / len(candidates)
    top_two_pct = [raw_by_symbol[item["symbol"]]["pct"] for item in sorted_by_theme[:2]]
    top_three_support = [item["afternoonSupport"] for item in sorted_by_leadership[:3]]
    leader = sorted_by_leadership[0]
    market_snapshot = {
        "mainThemeClarity": round(mean([item["themeResonance"] for item in sorted_by_theme[:2]]), 2),
        "sectorBreadthConcentration": round(max(0, min(100, (positive_ratio * 60) + (mean(top_two_pct) * 4))), 2),
        "afternoonStrengthRetention": round(mean(top_three_support), 2),
        "coreLeaderConfirmation": round(
            max(0, min(100, (leader["boardLeadership"] * 0.6) + (leader["afternoonSupport"] * 0.4))),
            2,
        ),
        "provenance": {
            "tradeDate": trading_date,
            "method": "derived from live daily bars",
            "candidateBasket": [item["symbol"] for item in candidates],
            "leaderSymbol": leader["symbol"],
        },
    }
    return market_snapshot


def main():
    args = parse_args()
    symbols = resolve_symbols(args.symbols)
    if args.provider == "tushare":
        rows_by_symbol = fetch_tushare_rows(symbols, args.trading_date)
    else:
        rows_by_symbol = fetch_akshare_rows(symbols, args.trading_date)
    candidates = build_candidates(args.trading_date, rows_by_symbol)
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
        "symbols": symbols,
        "marketSnapshot": market_snapshot,
        "candidateSnapshot": {
            "sectorContinuityScore": sector_continuity_score,
            "candidates": candidates,
        },
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
