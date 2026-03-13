---
name: article-writer
description: |
  Multi-style WeChat article creation skill. Supports 5 writing styles (deep analysis, practical guide, story-driven, opinion, news brief),
  including complete workflow: material collection → outline → content → formatting → auto-images → cover. Activated when users mention "write article", "write WeChat post", "create", or "draft".
---

# Multi-Style Article Creation

## Use Cases

- User says "write an article about XX"
- User says "help me write a WeChat post"
- User selects a topic from the content calendar to start writing
- User specifies a writing style (e.g., "write with deep analysis", "write a tutorial")

## Script Directory

This skill's scripts are located in `${SKILL_DIR}/scripts/`, where `SKILL_DIR` is the directory containing this SKILL.md.

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/fetch_cover.py` | Cover image retrieval | `python3 ${SKILL_DIR}/scripts/fetch_cover.py [--custom "/path/to/image.jpg"]` |
| `scripts/polish_text.py` | Text polishing | `python3 ${SKILL_DIR}/scripts/polish_text.py` |
| `scripts/start_article.py` | Article initialization | `python3 ${SKILL_DIR}/scripts/start_article.py` |


## 5 Writing Styles

| Style ID | Name | Characteristics | Word Count | Use Cases |
|----------|------|-----------------|------------|-----------|
| `deep-analysis` | Deep Analysis | Rigorous structure, data-backed, multi-angle argumentation | 2000-4000 words | Trend analysis, in-depth reporting, complex topic breakdown |
| `practical-guide` | Practical Guide | Clear steps, screenshots, highly actionable | 1500-3000 words | Tool tutorials, methodologies, how-to guides |
| `story-driven` | Story-Driven | Conversational, character narrative, emotional resonance | 1500-2500 words | Personal stories, case reviews, experience sharing |
| `opinion` | Opinion | Sharp opening, pros/cons argumentation, strong conclusion | 1000-2000 words | Hot takes, controversial topics, phenomenon observation |
| `news-brief` | News Brief | Inverted pyramid structure, concise, fact-focused | 500-1000 words | Breaking news, event reports, information roundups |

## Workflow

### Step 1: Read the Brief

Obtain topic information from the following sources (priority from high to low):

1. Entries with status `planned` in `content_calendar.json`
2. Topic description directly provided by the user

Extract key information:
- Topic direction / title
- Target audience
- Writing style (if not specified, recommend based on topic content)
- Reference material URLs

### Step 2: Determine Writing Style

If the user hasn't specified a style, recommend based on topic content:

| Topic Characteristics | Recommended Style |
|----------------------|-------------------|
| Involves data, trends, underlying causes | `deep-analysis` |
| "How to", "tutorial", "steps" | `practical-guide` |
| Involves people, experiences, insights | `story-driven` |
| Involves controversy, hot topic commentary | `opinion` |
| Breaking events, quick information | `news-brief` |

Confirm the style choice with the user.

**Account-specific recommendation for `wechat-lobster`:**
- When the goal is to promote `盯钉喵-一人公司智能搭子`, default to **case-led, result-driven promotion**.
- Preferred fallback style is usually `story-driven`, because it best supports "specific audience + blocked workflow + product takes over + outcome".
- Even when using `practical-guide` or `deep-analysis`, keep the center of gravity on **user value and workflow takeover**, not detailed step-by-step teaching.

### Step 3: Material Collection

Use content-planner's search script to collect reference materials:

```bash
node skills/content-planner/scripts/search_wechat.js "topic keywords" -n 10
```

If `browser` tool is available, also browse relevant web pages to collect materials.

Organize material list:
- Citable data/statistics
- Reference cases/stories
- Facts that need verification

### Step 4: Generate Outline

Generate an outline based on the selected style using the corresponding structure template.

**Title rule:** `frontmatter.title` is the single source of truth. The outline/body must start from `##` sections and must not repeat the same article title as a Markdown `#` heading.

#### deep-analysis Outline Template

```markdown
## Introduction (200-300 words)
- Hook: Start with a counter-intuitive data point or phenomenon
- Problem definition: What question will this article answer

## Background (300-500 words)
- Context of the event/phenomenon
- Key timeline or data

## Analysis Dimension 1 (400-600 words)
- Core argument
- Data support
- Case evidence

## Analysis Dimension 2 (400-600 words)
- Core argument
- Comparison/counter-argument
- Expert opinions

## Analysis Dimension 3 (400-600 words)
- Core argument
- Underlying causes
- Impact projection

## Conclusion & Outlook (200-300 words)
- Core viewpoint summary (1-2 sentences)
- Insights for readers
- CTA
```

#### practical-guide Outline Template

```markdown
## Opening (100-200 words)
- Pain point resonance: "Have you ever encountered..."
- Promise: What readers will gain after reading

## Prerequisites (200-300 words)
- Required tools/conditions
- Key concept explanations

## Step 1: [Action] (300-500 words)
- Specific operations
- Screenshots/illustrations
- Common pitfalls

## Step 2: [Action] (300-500 words)
- Specific operations
- Key parameter explanations
- Precautions

## Step 3: [Action] (300-500 words)
- Specific operations
- Verification methods

## Advanced Tips (200-300 words)
- 2-3 advanced techniques

## Summary (100-200 words)
- Review steps
- FAQ
- CTA
```

#### story-driven Outline Template

```markdown
## Opening (150-200 words)
- Scene entry: A specific moment/dialogue/image
- Suspense: Why tell this story

## Background Setup (200-300 words)
- Character/background introduction
- What is the conflict/challenge

## Turning Point 1 (300-400 words)
- First key event
- Feelings and thoughts at the time
- Lessons/insights

## Turning Point 2 (300-400 words)
- How the situation changed
- New attempts/decisions
- Results

## Climax (200-300 words)
- The most critical moment
- Core insight

## Ending (150-200 words)
- Story conclusion
- Inspiration for readers
- CTA
```

#### opinion Outline Template

```markdown
## Sharp Opening (100-150 words)
- State opinion directly (one sentence)
- Why most people's views are wrong

## Phenomenon Description (200-300 words)
- What everyone is saying
- What is the mainstream view

## Positive Argumentation (300-400 words)
- My viewpoint + argument 1
- Data/case support

## Counter-response (200-300 words)
- Expected rebuttals
- Why rebuttals don't hold up

## Deep Thinking (200-300 words)
- What is the essence of this issue
- Impact on industry/individuals

## Summary (100-150 words)
- Reinforce viewpoint (rephrase and restate)
- CTA
```

#### news-brief Outline Template

```markdown
## Core Information (100-200 words)
- What: What happened (one sentence)
- When/Where: Time/location
- Who: Key people/organizations

## Event Details (200-300 words)
- Specific process
- Key data

## Background Context (100-200 words)
- Why it matters
- What happened before

## Reactions (100-200 words)
- Official/authoritative statements
- Industry perspectives

## Editorial Comment (50-100 words)
- One-sentence commentary
- What to watch for next
```

### Step 5: User Approval of Outline

**This is a mandatory approval gate and cannot be skipped.**

Present the outline to the user and ask for confirmation or modification requests. After modifications, confirmation is required again.

### Step 6: Write the Content

After approval, write the content paragraph by paragraph following the outline.

**Universal Writing Rules (applicable to all styles):**

1. **Use stories instead of preaching**
   - ❌ "Risk management is important, emergency plans should be made"
   - ✅ "Last year, my startup team nearly collapsed when a core employee left because we had no backup plan."

2. **Use analogies and metaphors effectively**
   - ❌ "Distributed systems are complex"
   - ✅ "A distributed system is like a chain restaurant—each branch needs to collaborate while operating independently."

3. **Support with data but don't pile it on**
   - ❌ "According to IDC report, global AI market grew 45% in 2023, expected to reach $100 billion by 2025..."
   - ✅ "The AI market is growing like crazy—doubling every year. But behind this growth, fewer than 5 companies are actually making money."

4. **State opinions directly, avoid ambiguity**
   - ❌ "Some people think... others think... both have their merits"
   - ✅ "Honestly, I think XX's approach is wrong, because..."

5. **Use short sentences and line breaks**
   - ❌ "Today I want to share a very important viewpoint, which is that in the process of entrepreneurship, we need to constantly learn and adapt to market changes..."
    - ✅ "Today I want to make a point.\n\nThe scariest thing about entrepreneurship isn't failure.\nIt's failing and still not knowing why."

6. **For promotional articles, lead with outcomes**
   - ❌ "This product includes content planning, image generation, and publishing orchestration."
   - ✅ "What used to take a creator half a day can now be handed off as one continuous workflow."

7. **Use one audience scenario per article**
   - ❌ "This works for everyone."
   - ✅ "If you're a tech blogger who spends mornings chasing topics and afternoons patching drafts, this is the workflow to replace first."

**Rules for not fabricating data and citations:**
- If specific data is needed but uncertain, mark `[data to be confirmed]` and confirm with user
- Use `web-search` (if available) or search scripts to verify key facts
- Can tell reasonable fictional stories using "I've seen..." or "A friend of mine...", but don't fabricate specific data

### Step 7: Formatting Optimization

**WeChat Formatting Hard Rules:**

1. **Paragraphs no more than 4 lines** (mobile screen visible range)
2. **Insert a subheading or bold sentence every 3-4 paragraphs**
3. **Must have a hook within the first 3 lines** (question, data, story, counter-intuitive viewpoint)
4. **Must have a clear CTA at the end** (follow/share/comment prompt)

**Markdown Formatting Standards:**

```markdown
---
title: Article Title
---

## Subheading (Section Divider)

**Bold emphasis** on keywords

> Quote important viewpoints or data

- List item 1
- List item 2

---
Divider (major content separation)
```

**Formatting Checklist:**
- Paragraph length 3-5 lines
- No first-line indentation, use blank lines to separate paragraphs
- Maximum 2 heading levels (`##`), no deep nesting
- Bold only the 1-2 most important words
- Use quotes for data, golden sentences, or important viewpoints
- Lists maximum 5 items

### Step 8: AI-Powered Image Insertion

**This is a mandatory decision step. Before moving to cover generation, the agent must either insert inline images or explicitly state why images are skipped.**

**Completion contract:**
- The agent must always perform an image decision after the article draft is complete
- The agent must not skip this step silently
- Step 8 is complete only when one of the following is true:
  1. Inline images have been inserted into the Markdown draft
  2. A skip reason has been explicitly recorded

#### 8.1 Analyze Article Content

Read through the completed article and analyze:

1. **Article Theme** - What is the core topic? (e.g., job anxiety, career growth, tech trends)
2. **Emotional Tone** - What feeling should images convey? (anxious, hopeful, professional, warm)
3. **Content Structure** - Which sections would benefit from visual breaks?
4. **Visual Style** - What color palette matches the theme?

#### 8.2 Determine Image Strategy

**Not by word count, but by content needs:**

| Content Type | Image Need | Example |
|-------------|-----------|---------|
| Opening story/scene | 1 emotion-setting image | "Person scrolling phone late at night, worried expression" |
| Data/statistics | 1 infographic-style image | "Modern data visualization, charts showing trends" |
| How-to/tutorial | 1 step-by-step illustration | "Clean checklist or process diagram" |
| Case study | 1 narrative scene | "Cinematic scene matching the story" |
| Action guide | 1 motivational image | "Person taking first step, path forward" |

**Rules:**
- 0-1 image for news briefs (< 800 words)
- 2-3 images for feature articles (800-2000 words)
- 3-5 images for deep dives (> 2000 words)
- For non-news articles, default to at least 1 image unless there is a clear skip reason
- **Quality over quantity** - skip only when there is a concrete reason

**Account-specific default for `wechat-lobster`:**
- Prefer **2-3 case-card style images** for standard promotional articles
- Preferred order:
  1. `流程替代卡` — what the user used to do manually vs what the workflow now takes over
  2. `结果收益卡` — time saved, output stability, reduced interruption, higher frequency
  3. `适用人群卡` — who should immediately relate to this article
- Do not add decorative atmosphere images unless they strengthen the reader's understanding of value

**Allowed skip reasons:**
- User explicitly said no inline images
- No semantically suitable insertion point after evaluation
- EasyClaw image API unavailable
- AI generation failed
- News brief / very short article does not need images

#### 8.3 Select Positions Semantically

Choose positions where images enhance reading:

**Good positions:**
- After an emotional opening paragraph (breaks tension)
- After a heavy data section (visual relief)
- Before a key insight or tip (emphasis)
- Between major sections (transition)

**Avoid:**
- Mid-sentence or mid-paragraph
- Right after a heading (let heading breathe)
- In code blocks or blockquotes
- Too close together (< 300 chars apart)

#### 8.4 Generate Detailed Prompts

**Prompt structure:**

```
[Subject/Scene], [Action/Emotion], [Setting/Environment], [Style/Mood], [Technical specs]
```

**Examples:**

| Article Context | Bad Prompt | Good Prompt |
|----------------|-----------|-------------|
| Opening: 小张深夜刷招聘软件 | "professional illustration modern" | "Young Chinese professional lying in bed at 2 AM, phone screen casting blue glow on worried face, dark bedroom, scattered job rejection emails visible on screen, cinematic lighting, melancholic atmosphere, photorealistic style" |
| Data: 70%应届生焦虑 | "data visualization chart" | "Minimalist infographic showing 70% statistic, young professionals silhouettes, muted blue color palette conveying uncertainty, clean modern design, ample white space" |
| Tutorial: 求职进度表 | "step by step illustration" | "Overhead view of organized desk with notebook, pen, and handwritten job tracking table, warm natural lighting, productivity aesthetic, top-down photography style" |
| Insight: 行动比焦虑重要 | "motivational image" | "Person standing at crossroads at dawn, choosing between two paths, warm sunrise colors, hopeful atmosphere, metaphorical composition, editorial illustration style" |

**Style consistency:**
- All images in same article should share a color palette
- Consider theme: anxiety → cool blues/greys, hope → warm yellows/oranges, professional → neutral tones

#### 8.5 Generate and Insert Images

For each image decision, call `generate_image.py` directly:

```bash
# Create images directory if needed
mkdir -p "$(dirname "$ARTICLE_PATH")/images"

# Generate image with detailed prompt
python3 ${SKILL_DIR}/../image-generator/scripts/generate_image.py \
  --prompt "YOUR DETAILED PROMPT HERE" \
  --style "modern" \
  --size "800*600" \
  -o "$(dirname "$ARTICLE_PATH")/images/img_001.jpg"
```

Then insert into Markdown at the chosen position:

```markdown
![](./images/img_001.jpg)
```

If image generation is skipped or fails, the agent must explicitly record the reason in the work summary instead of pretending this step was completed.

#### 8.6 Example AI Decision Process

```
文章分析：
- 主题：应届毕业生求职焦虑
- 情绪：从焦虑 → 理解 → 行动 → 希望
- 风格：偏理性但温暖，冷色调转暖

插图决策：

【图1】位置：开篇场景后（第5段）
原因：开篇描述小张深夜刷手机，配图强化情绪代入
提示词："Young Chinese professional in 20s lying in bed late night, scrolling phone with worried expression, dim bedroom with only phone screen light, blue-gray color palette, cinematic portrait photography, shallow depth of field"

【图2】位置：数据段落后（"超七成应届生焦虑"后）
原因：数据需要可视化，同时保持情绪连贯
提示词："Minimalist data visualization showing anxiety statistics, abstract silhouettes of young people, muted blue tones transitioning to hints of warm orange, clean infographic style, modern design"

【图3】位置：行动指南前
原因：从焦虑转向行动，需要积极的视觉转折
提示词："Person taking first step on a path forward at dawn, warm golden light breaking through clouds, hopeful atmosphere, editorial illustration style, warm color palette replacing cool tones"

风格统一：冷蓝 → 暖橙，象征从焦虑到希望的转变

#### 8.7 Required Output Summary

Before moving to cover generation, the agent must clearly report one of the following:

1. **Images inserted**
   - Number of images
   - Insertion positions
   - Short purpose for each image

2. **Images skipped**
   - Explicit reason for skipping
   - Whether the reason was content-based, user-requested, or generation-related
```

### Step 9: Get Cover Image

Recommended to use the cover-generator skill in the project root directory to generate covers:

```bash
python3 skills/cover-generator/scripts/generate_cover.py --title "Article Title" -o output/covers/cover.jpg
```

> **Note:** cover-generator supports two modes:
> - **AI Generation** (EasyClaw Seedream 5.0 Lite): Automatically called, generates high-quality covers
> - **Picsum Random Fallback**: Automatically uses Picsum random cover when AI generation fails
>
> Default size 1200x630px, adapted for WeChat official account cover dimensions.

**Account-specific cover habit for `wechat-lobster`:**
- Cover should read like a **brand promise**, not a tutorial poster
- Keep only one main title promise on the cover
- Prefer brand-consistent prompts around AI SaaS, workflow takeover, automation, and blue/purple tech tones
- If only a random fallback image is available, treat it as temporary material rather than the preferred final publication cover

If you still need to use this skill's built-in simple cover retrieval script (picsum random image), you can also use:

```bash
cd ${SKILL_DIR}
python3 scripts/fetch_cover.py --output "output/covers/cover.jpg"
```

> **Tip:** If you have a more suitable image, you can pass its path directly to the `--custom` parameter to replace the random image:
> ```bash
> python3 scripts/fetch_cover.py --custom "/path/to/your/image.jpg"
> ```
> After publishing, you can also manually replace the cover image in the WeChat official account draft box.

### Step 10: Output Draft

Save the article as a Markdown file to the `drafts/` directory:

Filename format: `drafts/YYYYMMDD_[topic-slug].md`

`frontmatter.title` is the article title source of truth. The body should start directly from `##` or normal paragraphs, and must not repeat the same `# Article Title` heading.

File content format:

```markdown
---
title: Article Title
author: Author Name
date: YYYY-MM-DD
style: deep-analysis
cover: ../output/covers/cover_YYYYMMDD_HHMMSS.jpg
summary: Article summary (within 100 words)
---

## Opening

Content...
```

### Step 11: Output Confirmation

```
Article draft completed!

📝 Article Information
━━━━━━━━━━

Title: [Title]
Style: [Style Name]
Word Count: [Word Count]
Images: [N] inline images
Cover: [Cover Image Path]
File: [Markdown File Path]

Quality Check:
✅ Title — Sparks curiosity or resonance
✅ Opening — First 100 words are engaging
✅ Body — Has 2-3 clear viewpoints
✅ Cases — Uses stories not preaching
✅ Formatting — Easy to read (short paragraphs, bold, subheadings)
✅ Images — Context-aware inline images inserted
✅ Cover — Professional and matches content
✅ Word Count — Within style-specified range
✅ CTA — Ending has action prompt

Next step: Say "publish this article" to trigger publish-orchestrator.
```

If `content_calendar.json` exists, also update the corresponding entry's status to `ready`.

## Title Optimization Process

### Step 1: Generate 10 Candidate Titles

Use the following psychological strategies to generate diverse titles:

| Strategy | Description | Example |
|----------|-------------|---------|
| Suspense | Spark curiosity, make readers want to know the answer | "Why I Quit My $50K Job" |
| Benefit | Clarify reader gains, directly address practical needs | "Master These 3 Tricks, Boost Efficiency 200%" |
| Pain Point | Hit reader anxiety, trigger action desire | "Don't Let This Habit Ruin Your Career" |
| Numbers | Specific and tangible, lower reading barrier | "50% of People Misunderstand This Truth" |
| Rhetorical Question | Stimulate reader thinking, trigger resonance | "Do You Really Understand AI?" |
| Contrast | Create contrast, attract attention | "BAT vs Startups: What's the Difference" |

**Prohibited:**
- ❌ Conclusion-style titles (e.g., "3 Methods for XX") — Too bland, no suspense
- ❌ Overly AI-sounding titles (e.g., "Comprehensive Analysis of XX Development Trends")

### Step 2: Score and Filter

Score the 10 candidate titles on the following dimensions (0-10 points each):

| Dimension | Weight | Evaluation Criteria |
|-----------|--------|---------------------|
| Attractiveness | 40% | Can it spark curiosity or emotional resonance within 0.5 seconds |
| Shareability | 30% | Is it easy to share, does it have social currency attributes |
| SEO Friendliness | 30% | Does it include target keywords, is it suitable for search |

Weighted total score = Attractiveness × 0.4 + Shareability × 0.3 + SEO × 0.3

### Step 3: Output Top 3

Present the top 3 highest-scoring titles to the user:

```
Title Recommendations:

1. 「Title A」 — Overall score 8.5 (Suspense + Pain Point)
2. 「Title B」 — Overall score 8.2 (Numbers + Benefit)
3. 「Title C」 — Overall score 7.9 (Rhetorical Question)

Recommend using #1, reason: [brief explanation]
```

Use the selected title after user confirmation.

## Integration with Other Skills

- **Upstream**: content-planner's `content_calendar.json` provides topic input
- **Parallel**: image-generator provides image generation for Step 8 after the agent completes image decisions
- **Parallel**: cover-generator creates cover images (Step 9)
- **Downstream**: Markdown files in drafts/ are publishing materials for publish-orchestrator
- After writing completion, update the status of the corresponding entry in content_calendar.json
