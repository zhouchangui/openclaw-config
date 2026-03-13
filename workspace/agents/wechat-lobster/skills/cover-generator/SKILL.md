# Cover Generator

Generate cover images for WeChat Official Account articles. Prioritizes EasyClaw Seedream 5.0 Lite AI generation; when AI is unavailable, `--no-ai` is specified, or external fallback fails, it falls back to a usable local cover asset.

Authentication is automatically obtained from the OpenClaw runtime (`~/.openclaw/`). No additional API key configuration is needed when that runtime contains EasyClaw-compatible image settings.

## Dependencies

```bash
pip install openai Pillow
```

## Usage

```bash
# Basic usage (uses EasyClaw AI, falls back to Picsum Photos and then local cover on failure)
python3 scripts/generate_cover.py --title "Article Title" -o cover.jpg

# Custom AI prompt
python3 scripts/generate_cover.py --title "Article Title" --prompt "Cyberpunk city night scene, blue-purple tones" -o cover.jpg

# Skip AI and use Picsum random cover
python3 scripts/generate_cover.py --title "Article Title" --no-ai -o cover.jpg

# Specify dimensions
python3 scripts/generate_cover.py --title "Article Title" --size 1200*630 -o cover.jpg
```

## Account-Specific Habits (`wechat-lobster`)

For `盯钉喵-一人公司智能搭子`, covers should default to **brand-first promotion**:

- Use one audience promise or one result promise as the visual center
- Keep the composition clean; don't turn the cover into a dense checklist
- Prefer prompts around AI SaaS, workflow automation, creator productivity, and blue/purple tech tones
- Use random fallback images only as temporary assets; for final publishing, prefer a cover that still looks on-brand

## Parameters

| Parameter | Description | Default |
|---|---|---|
| `--title` | Article title (required) | - |
| `--prompt` | Custom AI prompt | Auto-generated based on title |
| `--size` | Image dimensions (width*height), internally converted to aspect ratio | `1280*720` |
| `-o` | Output path | `output/covers/cover_timestamp.jpg` |
| `--no-ai` | Skip AI and use Picsum random cover directly | false |

## Generation Logic

```
EasyClaw configured?
    ├── Yes → Call Seedream 5.0 Lite → Success → Save
    │                                 → Failure → Fetch random image from Picsum Photos
    └── No → Fetch random image from Picsum Photos
```

`--no-ai` always skips AI and fetches a random image from Picsum Photos first.

For `wechat-lobster`, if AI generation fails and fallback is used, the agent should explicitly note whether the result came from Picsum or the local branded fallback.

## Integration with Other Skills

After generating a cover, specify it when publishing via `publish-orchestrator`:

```bash
npx -y bun skills/publish-orchestrator/scripts/wechat-api.ts article.html \
  --cover cover.jpg
```
