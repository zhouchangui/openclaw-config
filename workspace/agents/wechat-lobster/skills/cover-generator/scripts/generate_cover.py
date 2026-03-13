#!/usr/bin/env python3
"""
封面图生成器

使用 EasyClaw 内置 Seedream 5.0 Lite 生成封面图。
认证优先从 ~/.openclaw/ 获取，无需额外配置 API Key。
EasyClaw API 不可用或显式跳过 AI 时，使用 Picsum Photos 随机图。

Usage:
    # AI 生成
    python3 generate_cover.py --title "文章标题" -o cover.jpg

    # 跳过 AI，直接使用随机图
    python3 generate_cover.py --title "文章标题" --no-ai -o cover.jpg

    # 指定尺寸
    python3 generate_cover.py --title "文章标题" --size 1280*720 -o cover.jpg

    # 自定义 AI 提示词
    python3 generate_cover.py --title "文章标题" --prompt "赛博朋克城市夜景" -o cover.jpg
"""

from __future__ import annotations

import argparse
import base64
import json
import ssl
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
DEFAULT_OUTPUT_DIR = WORKSPACE_ROOT / "output" / "covers"
DEFAULT_SIZE = "1280*720"  # 微信公众号推荐比例

# size → aspect-ratio 映射
SIZE_TO_ASPECT = {
    "800*600": "4:3",
    "600*800": "3:4",
    "800*800": "1:1",
    "1280*720": "16:9",
    "720*1280": "9:16",
    "1200*630": "16:9",
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

    try:
        w, h = (int(x) for x in size.split("*"))
    except ValueError:
        return "16:9"  # 封面默认 16:9

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
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(request, timeout=300, context=ctx) as response:
            output_path.write_bytes(response.read())
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Download failed ({error.code}): {payload}") from error


# ---------------------------------------------------------------------------
# Picsum fallback
# ---------------------------------------------------------------------------

def fetch_picsum(size: str, output_path: Path) -> bool:
    """从 Picsum Photos 下载随机封面图。"""
    try:
        width, height = (int(x) for x in size.split("*"))
    except ValueError:
        print(f"[Picsum] 尺寸格式无效：{size}")
        return False

    url = f"https://picsum.photos/{width}/{height}"
    print(f"[Picsum] 使用随机封面：{url}")

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(url, timeout=30, context=ctx) as resp:
            output_path.write_bytes(resp.read())
        print(f"[OK] Picsum 封面已保存：{output_path}")
        return True
    except Exception as e:
        print(f"[Picsum] 下载失败：{e}")
        return False


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
    return lines[:3]


def build_local_cover_payload(
    title: str,
    eyebrow: str | None = None,
    footer: str | None = None,
) -> dict[str, str]:
    return {
        "badge": "盯钉喵 / 自动化工作流",
        "eyebrow": (eyebrow or "少打扰，多产出").strip(),
        "title": title.strip(),
        "footer": (footer or "把选题、写稿、配图和发布检查，接成一条稳定可复用的内容链路。").strip(),
    }


def create_local_cover(
    title: str,
    output_path: Path,
    size: str,
    eyebrow: str | None = None,
    footer: str | None = None,
) -> bool:
    try:
        width, height = (int(x) for x in size.split("*"))
    except ValueError:
        width, height = 1200, 630

    payload = build_local_cover_payload(title, eyebrow=eyebrow, footer=footer)
    image = Image.new("RGB", (width, height), color=(13, 18, 38))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((40, 40, width - 40, height - 40), radius=36, fill=(26, 35, 78))
    draw.rounded_rectangle((60, 60, width - 60, 150), radius=24, fill=(79, 111, 255))
    draw.rounded_rectangle((60, height - 180, width - 60, height - 60), radius=24, fill=(20, 27, 57))
    draw.ellipse((width - 220, 190, width - 120, 290), fill=(110, 133, 255))
    draw.ellipse((width - 150, 230, width - 80, 300), fill=(143, 90, 255))

    title_font = _font(max(28, width // 18))
    body_font = _font(max(18, width // 34))
    badge_font = _font(max(16, width // 42))

    draw.text((90, 92), payload["badge"], fill="white", font=badge_font)
    draw.text((90, 200), payload["eyebrow"], fill=(170, 186, 255), font=body_font)

    lines = _wrap_text(draw, payload["title"], title_font, width - 250)
    y = 270
    for line in lines:
        draw.text((90, y), line, fill="white", font=title_font)
        y += title_font.size + 18

    draw.text(
        (90, height - 110),
        payload["footer"],
        fill=(200, 208, 235),
        font=body_font,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, "JPEG", quality=92)
    print(f"[OK] 本地 fallback 封面已保存：{output_path}")
    return True


# ---------------------------------------------------------------------------
# AI 生成
# ---------------------------------------------------------------------------

def generate_ai(title: str, prompt: str, size: str, output_path: Path) -> bool:
    """调用 EasyClaw Seedream 5.0 Lite 生成封面图。"""
    try:
        state_dir = resolve_state_dir()
        base_url, uid, token = load_easyclaw_runtime_config(state_dir)
        client = build_openai_client(base_url, uid, token)
    except ConfigError as e:
        print(f"[AI] EasyClaw 配置不可用：{e}")
        return False

    # 构造提示词：优先使用用户自定义 prompt，否则基于标题生成
    if not prompt:
        prompt = (
            f"微信公众号封面图，主题：{title}。"
            "简洁大气，适合公众号文章封面，"
            "高质量摄影风格或插画风格，色彩和谐，无文字水印。"
        )

    aspect_ratio = size_to_aspect_ratio(size)

    print(f"[AI] 调用 EasyClaw Seedream 5.0 Lite，提示词：{prompt[:60]}...")
    print(f"[AI] Aspect ratio: {aspect_ratio}")

    try:
        response = client.images.generate(
            model=MODEL_NAME,
            prompt=prompt,
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
        print(f"[OK] AI 封面已保存：{output_path}")
        return True

    print("[AI] 响应中未包含图片数据")
    return False


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="封面图生成器（EasyClaw Seedream 5.0 Lite；失败时自动使用 Picsum）"
    )
    parser.add_argument("--title", required=True, help="文章标题（必填）")
    parser.add_argument("--prompt", default="", help="自定义 AI 提示词（可选，覆盖自动生成的提示词）")
    parser.add_argument("--size", default=DEFAULT_SIZE,
                        help=f"图片尺寸，格式 宽*高（默认 {DEFAULT_SIZE}）")
    parser.add_argument("-o", "--output", default=None,
                        help="输出路径（默认 output/covers/cover_时间戳.jpg）")
    parser.add_argument("--no-ai", action="store_true",
                        help="跳过 AI，直接使用 Picsum 随机图")
    parser.add_argument("--eyebrow", default="",
                        help="本地品牌封面副标题/眉题")
    parser.add_argument("--footer", default="",
                        help="本地品牌封面底部说明文案")
    args = parser.parse_args()

    # 确定输出路径
    if args.output:
        output_path = Path(args.output)
    else:
        DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = DEFAULT_OUTPUT_DIR / f"cover_{ts}.jpg"

    success = False

    if args.no_ai:
        print("[Skip] 已指定 --no-ai，跳过 AI 生成，改用本地品牌封面")
        success = create_local_cover(
            args.title,
            output_path,
            args.size,
            eyebrow=args.eyebrow or None,
            footer=args.footer or None,
        )
    else:
        # 尝试 AI 生成
        success = generate_ai(args.title, args.prompt, args.size, output_path)

        # AI 失败时优先 fallback 到本地品牌封面
        if not success:
            print("[Fallback] AI 生成失败，改用本地品牌封面...")
            success = create_local_cover(
                args.title,
                output_path,
                args.size,
                eyebrow=args.eyebrow or None,
                footer=args.footer or None,
            )

        if not success:
            print("[Fallback] 本地品牌封面失败，改用随机封面...")
            success = fetch_picsum(args.size, output_path)

    if not success:
        print("[Error] 封面生成失败")
        sys.exit(1)

    print(f"\n下一步：")
    print(f"  将封面上传到微信公众号，或用 publish-orchestrator skill 发布文章时通过 --cover 指定")


if __name__ == "__main__":
    main()
