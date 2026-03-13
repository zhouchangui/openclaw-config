# Known Issues and Troubleshooting

## 1. Search Script Returns No Results or Errors

**Symptom:** `search_wechat.js` returns empty results or network errors

**Causes:**
- Sogou WeChat Search has anti-scraping mechanisms; multiple requests in a short time will be blocked
- Keywords are too obscure or contain too many special characters

**Solutions:**
- Try different keywords with fewer special characters
- Wait 3-5 seconds between searches; avoid continuous high-frequency requests
- If failures persist, wait 10-30 minutes before retrying
- Verify cheerio is installed: `npm install -g cheerio`

---

## 2. Cover / Inline Image Generation Fails

**Symptom:** `generate_cover.py` or `generate_image.py` throws errors

**Possible Causes:**
- OpenClaw runtime not configured for EasyClaw image access (`~/.openclaw/` missing required image config)
- `openai` or `Pillow` package not installed
- Network connectivity issues to EasyClaw API

**Solutions:**
```bash
# Install dependencies
pip3 install openai Pillow

# Verify OpenClaw runtime files exist
ls ~/.openclaw/openclaw.json
ls ~/.openclaw/identity/device-auth.json

# If EasyClaw-compatible image config is not present, use local fallback or set OPENCLAW_EASYCLAW_BASE_URL
# Cover generator will automatically fall back to Picsum Photos and then a local branded cover on failure
```

---

## 3. API Publishing Fails: ip not in whitelist

**Symptom:** WeChat API returns "ip not in whitelist"

**Solutions:**
1. Get your public IP: `curl ifconfig.me`
2. Log in to https://mp.weixin.qq.com → Development → Basic Config → IP Whitelist
3. Add your IP address
4. Retry publishing

---

## 4. API Publishing Fails: invalid credential

**Symptom:** API returns invalid credentials

**Solutions:**
1. Check if appid and secret in `.secrets/wechat-config.json` are correct
2. Log in to https://mp.weixin.qq.com → Development → Basic Config to retrieve them again
3. Confirm AppSecret hasn't been reset (old ones become invalid immediately after reset)

---

## 5. wenyan Publishing Error: Cover Image Not Found

**Symptom:** wenyan publish throws error "未能找到文章封面" (cover image not found)

**Cause:** Markdown file is missing required frontmatter. wenyan-cli requires the `title` field, and `cover` is also recommended.

**Solution:** Ensure the Markdown file has complete frontmatter at the top:

```markdown
---
title: Article Title
cover: ./output/covers/cover.jpg
---
```

---

## 6. Browser Publishing Hangs or Login Fails

**Symptom:** Chrome opens but gets stuck on login page or hangs mid-operation

**Solutions:**
- First run requires manual QR code scanning for login
- Use `--profile ~/.chrome-wechat` parameter to maintain login state and avoid re-login each time
- Ensure Chrome is installed and path is correct
- macOS requires granting Chrome clipboard permissions in System Settings

---

## 7. Paste Operation Fails (Browser Mode)

**Symptom:** Article content or images fail to paste

**Cause:** Insufficient system clipboard permissions

**Solutions:**
- macOS: System Preferences → Privacy & Security → Accessibility → Allow Chrome / Terminal
- Ensure no other programs are using the clipboard
- Don't manually operate the clipboard during publishing

---

## 8. Markdown to HTML Theme Not Applied

**Symptom:** Specified grace/simple theme but output HTML has no styles

**Solutions:**
- Confirm corresponding CSS files exist in `scripts/md/themes/` directory
- Check if htmlPath in JSON output from `md-to-wechat.ts` script is correct
- Try re-running the conversion command

---

## 9. wenyan-cli Not Installed

**Symptom:** Running publish.sh throws error `wenyan: command not found`

**Solution:**
```bash
npm install -g @wenyan-md/cli
wenyan --help  # Verify installation
```

---

## 10. Content Calendar File Conflicts

**Symptom:** content_calendar.json gets overwritten after multiple planning sessions

**Current Status:** Each planning session currently overwrites the entire file

**Recommendation:** Check existing calendar before planning, preserve existing entries, and only append new topics. Long-term suggestion: archive by week (e.g., `calendar_2026-W11.json`).

---

## Feature Gaps (Known Limitations)

| Gap | Description | Workaround |
|------|------|---------|
| Data Analytics | Cannot automatically retrieve views, shares, likes data | Manually check official account backend, or use browser tool to open backend page |
| User Interaction | No comment management, no auto-reply | Handle manually in official account backend |
| Multi-platform Distribution | Can only publish to WeChat Official Account | Manually copy to other platforms |
| Scheduled Publishing | Script can only save to drafts, cannot schedule | Manually set scheduled publishing in official account backend |
| Edit Published Articles | Cannot modify already published articles | Manually edit in official account backend |
