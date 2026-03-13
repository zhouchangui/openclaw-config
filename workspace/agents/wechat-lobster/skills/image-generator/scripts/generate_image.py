#!/usr/bin/env python3
"""
文章插图生成器

使用 EasyClaw 内置 Seedream 5.0 Lite 生成图片。
认证优先从 ~/.openclaw/ 获取，无需额外配置 API Key。

Usage:
    # AI 生成
    python3 generate_image.py --prompt "AI助手在工作" -o image.jpg

    # 指定尺寸
    python3 generate_image.py --prompt "数据图表" --size 800*800 -o chart.jpg

    # 指定风格
    python3 generate_image.py --prompt "团队会议" --style warm -o meeting.jpg

    # 跳过生成
    python3 generate_image.py --prompt "任意" --no-ai -o image.jpg
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from openai import OpenAI
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

MODEL_NAME = "bytepluses.seedream-5.0-lite"
PLACEHOLDER_API_KEY = "easyclaw-placeholder"
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUT_DIR = WORKSPACE_ROOT / "output" / "images"
DEFAULT_SIZE = "800*600"

# size → aspect-ratio 映射
SIZE_TO_ASPECT = {
    "800*600": "4:3",
    "600*800": "3:4",
    "800*800": "1:1",
    "1280*720": "16:9",
    "720*1280": "9:16",
    "1200*630": "16:9",
}

# 风格预设
STYLE_ENHANCEMENTS = {
    "modern": "clean minimalist professional lighting",
    "tech": "futuristic blue purple tones digital elements",
    "minimal": "simple shapes plenty whitespace muted colors",
    "warm": "warm lighting cozy atmosphere soft colors",
    "bold": "high contrast vibrant colors dramatic",
}

SUPPORTED_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]


# ---------------------------------------------------------------------------
# EasyClaw 运行时配置
# ---------------------------------------------------------------------------

class ConfigError(RuntimeError):
    """Raised when required EasyClaw configuration is missing or invalid."""


def resolve_state_dir(home_dir: Path | None = None) -> Path:
    return (home_dir or Path.home()) / ".openclaw"


def load_json_file(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ConfigError(f"Missing required file: {path}") from error
    except json.JSONDecodeError as error:
        raise ConfigError(f"Invalid JSON in file: {path}") from error


def normalize_base_url(value: str) -> str:
    trimmed = value.strip().rstrip("/")
    if not trimmed:
        raise ConfigError("easyclaw baseUrl must be a non-empty string")
    return trimmed


def extract_base_url_from_config(config_data: object) -> str:
    env_base_url = normalize_base_url((__import__("os").environ.get("OPENCLAW_EASYCLAW_BASE_URL") or "").strip()) if (__import__("os").environ.get("OPENCLAW_EASYCLAW_BASE_URL") or "").strip() else None
    if env_base_url:
        return env_base_url

    if not isinstance(config_data, dict):
        raise ConfigError("easyclaw config must be a JSON object")

    models = config_data.get("models")
    if not isinstance(models, dict):
        raise ConfigError("easyclaw config missing models.providers.easyclaw.baseUrl")

    providers = models.get("providers")
    if not isinstance(providers, dict):
        raise ConfigError("easyclaw config missing models.providers.easyclaw.baseUrl")

    easyclaw = providers.get("easyclaw")
    if not isinstance(easyclaw, dict):
        raise ConfigError("easyclaw config missing models.providers.easyclaw.baseUrl")

    base_url_val = easyclaw.get("baseUrl")
    if not isinstance(base_url_val, str) or not base_url_val.strip():
        raise ConfigError("easyclaw config missing models.providers.easyclaw.baseUrl")

    return normalize_base_url(base_url_val)


def extract_auth_from_userinfo(userinfo_data: object) -> tuple[str, str]:
    if not isinstance(userinfo_data, dict):
        raise ConfigError("easyclaw userinfo must be a JSON object")

    uid = userinfo_data.get("uid")
    token = userinfo_data.get("token")
    if not isinstance(uid, str) or not uid.strip():
        raise ConfigError("easyclaw userinfo invalid: uid must be a non-empty string")
    if not isinstance(token, str) or not token.strip():
        raise ConfigError("easyclaw userinfo invalid: token must be a non-empty string")
    return uid.strip(), token.strip()


def extract_auth_from_device_auth(device_auth_data: object) -> tuple[str, str]:
    if not isinstance(device_auth_data, dict):
        raise ConfigError("openclaw device-auth must be a JSON object")

    device_id = device_auth_data.get("deviceId")
    tokens = device_auth_data.get("tokens")
    if not isinstance(device_id, str) or not device_id.strip():
        raise ConfigError("openclaw device-auth invalid: deviceId must be a non-empty string")
    if not isinstance(tokens, dict):
        raise ConfigError("openclaw device-auth invalid: tokens must be an object")
    operator = tokens.get("operator")
    if not isinstance(operator, dict):
        raise ConfigError("openclaw device-auth invalid: tokens.operator missing")
    token = operator.get("token")
    if not isinstance(token, str) or not token.strip():
        raise ConfigError("openclaw device-auth invalid: operator token must be a non-empty string")
    return device_id.strip(), token.strip()


def load_easyclaw_runtime_config(state_dir: Path) -> tuple[str, str, str]:
    base_url = None
    config_candidates = [
        state_dir / "easyclaw.json",
        state_dir / "openclaw.json",
    ]
    for config_path in config_candidates:
        if not config_path.exists():
            continue
        try:
            base_url = extract_base_url_from_config(load_json_file(config_path))
            break
        except ConfigError:
            continue

    if not base_url:
        raise ConfigError(
            f"Missing EasyClaw baseUrl in {config_candidates[0]} or {config_candidates[1]}; "
            "or set OPENCLAW_EASYCLAW_BASE_URL"
        )

    auth_candidates = [
        ("userinfo", state_dir / "identity" / "easyclaw-userinfo.json"),
        ("userinfo", state_dir / "identity" / "openclaw-userinfo.json"),
        ("device-auth", state_dir / "identity" / "device-auth.json"),
    ]
    for auth_kind, auth_path in auth_candidates:
        if not auth_path.exists():
            continue
        try:
            data = load_json_file(auth_path)
            if auth_kind == "device-auth":
                uid, token = extract_auth_from_device_auth(data)
            else:
                uid, token = extract_auth_from_userinfo(data)
            return base_url, uid, token
        except ConfigError:
            continue

    raise ConfigError(
        f"Missing auth info in {state_dir / 'identity'}; expected easyclaw-userinfo.json, "
        "openclaw-userinfo.json, or device-auth.json"
    )


def build_openai_client(base_url: str, uid: str, token: str) -> OpenAI:
    return OpenAI(
        api_key=PLACEHOLDER_API_KEY,
        base_url=normalize_base_url(base_url),
        default_headers={
            "X-Auth-Uid": uid,
            "X-Auth-Token": token,
        },
    )


# ---------------------------------------------------------------------------
# size → aspect-ratio 转换
# ---------------------------------------------------------------------------

def size_to_aspect_ratio(size: str) -> str:
    """将 宽*高 尺寸转换为 aspect-ratio 字符串。"""
    if size in SIZE_TO_ASPECT:
        return SIZE_TO_ASPECT[size]

    # 不在映射表中：计算宽高比取最接近的
    try:
        w, h = (int(x) for x in size.split("*"))
    except ValueError:
        return "4:3"  # fallback

    ratio = w / h
    candidates = {
        "1:1": 1.0,
        "3:4": 3 / 4,
        "4:3": 4 / 3,
        "2:3": 2 / 3,
        "3:2": 3 / 2,
        "9:16": 9 / 16,
        "16:9": 16 / 9,
        "21:9": 21 / 9,
    }
    return min(candidates, key=lambda k: abs(candidates[k] - ratio))


# ---------------------------------------------------------------------------
# 图片保存
# ---------------------------------------------------------------------------

def save_image_from_response(response: object, output_path: Path) -> bool:
    data = getattr(response, "data", None)
    if not isinstance(data, list) or not data:
        return False

    for item in data:
        image_b64 = getattr(item, "b64_json", None)
        image_url = getattr(item, "url", None)
        if isinstance(image_b64, str) and image_b64.strip():
            output_path.write_bytes(base64.b64decode(image_b64))
            return True
        if isinstance(image_url, str) and image_url.strip():
            download_file(image_url, output_path)
            return True
    return False


def download_file(url: str, output_path: Path) -> None:
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            output_path.write_bytes(response.read())
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Download failed ({error.code}): {payload}") from error


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        trial = current + char
        bbox = draw.textbbox((0, 0), trial, font=font)
        if current and (bbox[2] - bbox[0]) > max_width:
            lines.append(current)
            current = char
        else:
            current = trial
    if current:
        lines.append(current)
    return lines[:4]


def build_local_card_payload(
    prompt: str,
    card_type: str | None = None,
    title: str | None = None,
    bullets: list[str] | None = None,
) -> dict[str, object]:
    clean_bullets = [item.strip() for item in (bullets or []) if item and item.strip()]
    if clean_bullets:
        bullet_items = clean_bullets[:3]
    else:
        prompt_bits = [part.strip(" ,.;:") for part in prompt.replace("，", ",").split(",") if part.strip(" ,.;:")]
        bullet_items = prompt_bits[:3] or ["流程接手", "减少打断", "稳定产出"]

    return {
        "tag": (card_type or "价值卡片").strip(),
        "title": (title or prompt[:18] or "把碎事交给流程").strip(),
        "bullets": bullet_items,
        "footer": "适合公众号正文中的案例说明与结果展示。",
    }


def create_local_card(
    prompt: str,
    style: str,
    output_path: Path,
    size: str,
    card_type: str | None = None,
    title: str | None = None,
    bullets: list[str] | None = None,
) -> bool:
    try:
        width, height = (int(x) for x in size.split("*"))
    except ValueError:
        width, height = 800, 600

    payload = build_local_card_payload(prompt, card_type=card_type, title=title, bullets=bullets)
    bg = (248, 250, 255)
    accent = {
        "tech": (92, 107, 255),
        "minimal": (114, 124, 140),
        "warm": (224, 144, 88),
        "bold": (196, 63, 78),
    }.get(style, (82, 104, 220))
    image = Image.new("RGB", (width, height), color=bg)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((30, 30, width - 30, height - 30), radius=28, fill=(255, 255, 255), outline=accent, width=4)
    draw.rounded_rectangle((50, 50, width - 50, 130), radius=20, fill=accent)

    title_font = _font(max(22, width // 20))
    body_font = _font(max(16, width // 32))
    badge_font = _font(max(14, width // 40))

    draw.text((72, 78), f"盯钉喵 / {payload['tag']}", fill="white", font=badge_font)
    draw.text((72, 170), str(payload["title"]), fill=accent, font=body_font)

    y = 230
    for idx, bullet in enumerate(payload["bullets"], start=1):
        lines = _wrap_text(draw, f"{idx}. {bullet}", title_font, width - 144)
        for line in lines:
            draw.text((72, y), line, fill=(25, 33, 52), font=title_font)
            y += title_font.size + 12
        y += 10

    draw.text((72, height - 120), str(payload["footer"]), fill=(110, 118, 136), font=body_font)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, "JPEG", quality=92)
    print(f"[OK] 本地 fallback 插图已保存：{output_path}")
    return True


# ---------------------------------------------------------------------------
# AI 生成
# ---------------------------------------------------------------------------

def generate_ai(prompt: str, style: str, size: str, output_path: Path) -> bool:
    """调用 EasyClaw Seedream 5.0 Lite 生成图片。"""
    try:
        state_dir = resolve_state_dir()
        base_url, uid, token = load_easyclaw_runtime_config(state_dir)
        client = build_openai_client(base_url, uid, token)
    except ConfigError as e:
        print(f"[AI] EasyClaw 配置不可用：{e}")
        return False

    # 增强 prompt
    enhanced_prompt = prompt
    if style and style in STYLE_ENHANCEMENTS:
        enhanced_prompt = f"{prompt}, {STYLE_ENHANCEMENTS[style]}"

    aspect_ratio = size_to_aspect_ratio(size)

    print(f"[AI] 调用 EasyClaw Seedream 5.0 Lite...")
    print(f"[AI] Prompt: {enhanced_prompt[:80]}...")
    print(f"[AI] Aspect ratio: {aspect_ratio}")

    try:
        response = client.images.generate(
            model=MODEL_NAME,
            prompt=enhanced_prompt,
            size="2K",
            response_format="b64_json",
            extra_body={
                "watermark": False,
                "aspect_ratio": aspect_ratio,
                "sequential_image_generation": "disabled",
                "stream": False,
            },
        )
    except Exception as e:
        print(f"[AI] API 调用失败：{e}")
        return False

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if save_image_from_response(response, output_path):
        print(f"[OK] 图片已保存：{output_path}")
        return True

    print("[AI] 响应中未包含图片数据")
    return False


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="文章插图生成器（EasyClaw Seedream 5.0 Lite）"
    )
    parser.add_argument("--prompt", required=True, help="图片描述（必填）")
    parser.add_argument("--size", default=DEFAULT_SIZE,
                        help=f"图片尺寸，格式 宽*高（默认 {DEFAULT_SIZE}），内部转换为 aspect-ratio")
    parser.add_argument("--style", default="modern",
                        choices=list(STYLE_ENHANCEMENTS),
                        help="风格预设（默认 modern）")
    parser.add_argument("-o", "--output", default=None,
                        help="输出路径（默认 output/images/img_时间戳.jpg）")
    parser.add_argument("--no-ai", action="store_true",
                        help="跳过插图生成，不输出图片")
    parser.add_argument("--context", default="",
                        help="文章上下文（用于增强 prompt）")
    parser.add_argument("--card-type", default="",
                        help="本地卡片标签，例如 流程替代卡 / 结果收益卡 / 适用人群卡")
    parser.add_argument("--card-title", default="",
                        help="本地卡片标题")
    parser.add_argument("--card-point", action="append", default=[],
                        help="本地卡片要点，可重复传入 1-3 次")
    args = parser.parse_args()

    # 确定输出路径
    if args.output:
        output_path = Path(args.output)
    else:
        DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = DEFAULT_OUTPUT_DIR / f"img_{ts}.jpg"

    # 增强 prompt
    prompt = args.prompt
    if args.context:
        prompt = f"{args.prompt}, {args.context}"

    if args.no_ai:
        print("[Skip] 已指定 --no-ai，跳过插图生成")
        sys.exit(0)

    # 尝试 AI 生成
    success = generate_ai(prompt, args.style, args.size, output_path)

    if not success:
        print("[Fallback] AI 生成失败，改用本地信息卡片...")
        success = create_local_card(
            prompt,
            args.style,
            output_path,
            args.size,
            card_type=args.card_type or None,
            title=args.card_title or None,
            bullets=args.card_point or None,
        )
        if not success:
            print("[Error] 图片生成失败")
            sys.exit(1)


if __name__ == "__main__":
    main()
