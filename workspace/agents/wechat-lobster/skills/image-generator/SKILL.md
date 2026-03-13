---
name: image-generator
description: |
  Generate images for WeChat articles using EasyClaw Seedream 5.0 Lite. This skill provides
  the image-generation primitive used after the agent decides whether inline images are
  needed. Called by article-writer after article completion. Supports multiple sizes and
  styles for different use cases.
---

# Image Generator

Generate inline images for WeChat Official Account articles. Uses EasyClaw Seedream 5.0 Lite for AI generation. Authentication is automatically obtained from the OpenClaw runtime (`~/.openclaw/`), no additional API key configuration is needed when that runtime contains EasyClaw-compatible image settings. If AI is unavailable, the script falls back to a local info-card image.

This skill does **not** decide by itself whether an article should have images. The agent must make that decision first, then call `generate_image.py` for each approved image.

## Use Cases

- Triggered by article-writer after it decides inline images are needed
- User explicitly requests "add images to this article"
- Generate specific image with custom prompt

## Script Directory

This skill's scripts are located in `${SKILL_DIR}/scripts/`, where `SKILL_DIR` is the directory containing this SKILL.md file.

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/generate_image.py` | Generate single image | `python3 ${SKILL_DIR}/scripts/generate_image.py --prompt "描述" -o output.jpg` |

## Configuration

Authentication is automatically obtained from the OpenClaw runtime (`~/.openclaw/`). No additional API key configuration is needed when that runtime contains EasyClaw-compatible image settings.

## Dependencies

```bash
pip install openai Pillow
```

## Image Sizes

| Size | Use Case | Aspect Ratio |
|------|----------|--------------|
| `800*600` | Default inline image | 4:3 landscape |
| `600*800` | Portrait image | 3:4 portrait |
| `800*800` | Square image | 1:1 square |
| `1280*720` | Cover image (delegates to cover-generator) | 16:9 landscape |

Note: `--size` is specified in `宽*高` format but internally converted to an aspect ratio for the Seedream 5.0 Lite model.

## Workflow

### Mode 1: Agent-Orchestrated Inline Images (Recommended)

After article writing, the **agent must first make an image decision**, then use this skill to generate the approved images.

**Decision protocol:**

1. Analyze article theme, emotional tone, and structure
2. Decide image count and positions based on content needs
3. Choose one of two outcomes:
   - **Generate images** and insert them into Markdown
   - **Skip images** and explicitly state the reason
4. If generating:
   - Create the images directory
   - Call `generate_image.py` once per image
   - Insert `![](./images/img_001.jpg)` into Markdown
5. If skipping:
   - Record the exact reason in the work summary

**Default guidance:**
- News brief / very short article: 0-1 image
- Standard article: usually 1-3 images
- Deep analysis article: usually 2-5 images
- For non-news articles, default to at least 1 image unless there is a clear skip reason

**Account-specific default for `wechat-lobster`:**
- For promotional articles about `盯钉喵-一人公司智能搭子`, prefer 2-3 **case-card style** images
- Recommended card order:
  1. `流程替代卡`
  2. `结果收益卡`
  3. `适用人群卡`
- Prefer simple layouts, white-background cards, clean icons, and strong result labels
- Skip purely decorative images that do not improve the reader's understanding of value

### Mode 2: Single Image Generation

Generate a specific image with custom prompt:

```bash
# Basic usage
python3 ${SKILL_DIR}/scripts/generate_image.py --prompt "AI assistant working on laptop" -o image.jpg

# With custom size
python3 ${SKILL_DIR}/scripts/generate_image.py --prompt "Data visualization chart" --size 800*800 -o chart.jpg

# With style hint
python3 ${SKILL_DIR}/scripts/generate_image.py --prompt "Tech startup office" --style tech -o office.jpg

# Skip generation
python3 ${SKILL_DIR}/scripts/generate_image.py --prompt "anything" --no-ai -o image.jpg
```

## Parameters

### generate_image.py

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--prompt` | Image description (required for AI mode) | - |
| `--size` | Image dimensions (width*height), internally converted to aspect ratio | `800*600` |
| `--style` | Style hint: modern, tech, minimal, warm, bold | `modern` |
| `-o, --output` | Output path | `output/images/img_timestamp.jpg` |
| `--no-ai` | Skip image generation and do not output a file | false |
| `--context` | Article context for better prompt generation | - |

## Style Presets

When `--style` is specified, prompt is enhanced with style modifiers:

| Style | Enhancement |
|-------|-------------|
| `modern` | Clean, minimalist, professional lighting |
| `tech` | Futuristic, blue/purple tones, digital elements |
| `minimal` | Simple shapes, plenty whitespace, muted colors |
| `warm` | Warm lighting, cozy atmosphere, soft colors |
| `bold` | High contrast, vibrant colors, dramatic |

Example:
```
--prompt "Team meeting" --style warm
→ Actual prompt: "Team meeting, warm lighting cozy atmosphere soft colors"
```

## Prompt Enhancement

For auto-insert mode, prompts are automatically enhanced based on context:

| Context Type | Base Prompt | Enhancement |
|--------------|-------------|-------------|
| Data/Stats | Abstract data visualization | Modern infographic style, clean charts |
| Tutorial/How-to | Step-by-step illustration | Minimal UI style, clear icons |
| Story/Case | Scene description | Cinematic lighting, professional composition |
| Analysis | Conceptual diagram | Tech style, abstract elements |
| News | Relevant scene | Photojournalism style, realistic |

For `wechat-lobster`, prefer prompts that translate to:
- workflow replacement
- value summary cards
- audience-specific benefit cards

## Output

### generate_image.py Output

```
[AI] 调用 EasyClaw Seedream 5.0 Lite...
[AI] Prompt: ...
[AI] Aspect ratio: 4:3
[OK] 图片已保存：/path/to/image.jpg
```

### Example Agent-Orchestrated Output

```
[决策] 文章评估完成，计划插入 3 张插图
[位置] 第 2 段后 (字符 456)
[位置] 第 4 段后 (字符 1234)
[位置] 第 6 段后 (字符 2100)

[生成] 图片 1/3：AI工具界面示意图
[OK] 保存至 images/img_001.jpg
[插入] ![](./images/img_001.jpg)

[生成] 图片 2/3：数据可视化图表
[OK] 保存至 images/img_002.jpg
[插入] ![](./images/img_002.jpg)

[生成] 图片 3/3：团队协作场景
[OK] 保存至 images/img_003.jpg
[插入] ![](./images/img_003.jpg)

[完成] 插图决策已执行，共插入 3 张插图
```

## Skip / Failure Behavior

### When EasyClaw Is Not Configured

```
[AI] EasyClaw 配置不可用：Missing required file: ...
[Error] 图片生成失败
```

The script falls back to a local info-card image so the workflow can continue for preview and publishing prep.

### When `--no-ai` Is Specified

```
[Skip] 已指定 --no-ai，跳过插图生成
```

The script exits with code `0` and does not create an image file. The caller should treat this as a recorded skip, not as a successful image insertion.

### When API Fails

```
[AI] API 调用失败：timeout
[Error] 图片生成失败
```

The script falls back to a local info-card image so the workflow can continue.

## Integration with Other Skills

- **article-writer**: Makes image decisions in Step 8, then calls `generate_image.py` for each approved image
- **cover-generator**: Delegates cover generation (1280*720 size)
- **publish-orchestrator**: Uploads inline images to WeChat and replaces local paths with media URLs

## Example Usage in article-writer

After article completion and image decision:

```bash
# Step 8: Decide images first
echo "[Step 8] 执行插图决策..."

# Create images directory
mkdir -p "$(dirname "$ARTICLE_PATH")/images"

# Generate one approved image
python3 ${SKILL_DIR}/scripts/generate_image.py \
  --prompt "YOUR DETAILED PROMPT HERE" \
  --style "modern" \
  --size "800*600" \
  -o "$(dirname "$ARTICLE_PATH")/images/img_001.jpg"

# Output
echo "[完成] 插图决策已执行；如生成成功则已插入图片"
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `EasyClaw 配置不可用` | OpenClaw runtime lacks EasyClaw-compatible image config | Check `~/.openclaw/` runtime files or set `OPENCLAW_EASYCLAW_BASE_URL`; local fallback remains available |
| `openai not found` | Package not installed | `pip install openai` |
| No output image generated | `--no-ai` specified or EasyClaw unavailable | Check logs to confirm whether generation was intentionally skipped |
| `API 调用失败` | Network or API error | Check network connectivity and EasyClaw status |
| `Image too dark/bright` | Prompt issue | Add lighting hints to prompt |
| `Image irrelevant` | Prompt too vague | Add more context via `--context` |
