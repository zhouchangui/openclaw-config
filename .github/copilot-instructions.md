# Copilot Instructions

## Repository shape
- This root is an OpenClaw workspace/home directory, not a single application package.
- The main hand-authored code lives in `extensions/feishu/` and the main hand-authored workflow/docs live in `workspace/agents/*/`.
- Treat `browser/`, `canvas/`, `completions/`, `credentials/`, `delivery-queue/`, `devices/`, `logs/`, `media/`, `memory/`, `settings/`, and similar top-level folders as runtime/state unless the task explicitly targets them.
- `openclaw.json` wires the three agents (`dingding-assistant`, `investment-advisor`, `ops-admin`) to their workspace folders and Feishu channel bindings. Review it before changing routing, but do not blindly rewrite generated config or secrets.

## Build, test, and lint
- There are no repo-root build, lint, or test scripts.
- `extensions/feishu/package.json` is the only checked-in package manifest; it pins `pnpm@9.14.2` and has dependencies, but no `scripts` section.
- Install extension dependencies with `cd extensions/feishu && pnpm install`.
- Tests exist only in the Feishu extension as Vitest-style files under `extensions/feishu/src/*.test.ts` (for example `bot.test.ts`, `channel.test.ts`, `reply-dispatcher.test.ts`, and `media.test.ts`).
- Single-test command: none is checked in. There is no committed `pnpm test`, `pnpm lint`, or per-test script/config to rely on without first wiring the toolchain in `extensions/feishu/`.

## High-level architecture
- `extensions/feishu/openclaw.plugin.json`, `extensions/feishu/package.json`, and `extensions/feishu/index.ts` define how OpenClaw discovers and registers the Feishu extension. `index.ts` registers the Feishu channel plus doc/wiki/drive/perm/bitable tool suites.
- `extensions/feishu/src/channel.ts` is the channel contract: capabilities, pairing behavior, config schema, multi-account handling, and channel-level policy hooks are centralized there.
- `extensions/feishu/src/bot.ts` is the inbound message pipeline. It resolves accounts, de-duplicates messages, parses mentions/media, applies allowlist and group policies, optionally creates dynamic agents, and hands replies to the dispatcher/send layer.
- The rest of `extensions/feishu/src/` is intentionally split by concern: `send.ts` and `reply-dispatcher.ts` handle outbound delivery and streaming/card behavior, `media.ts` handles uploads/downloads, `mention.ts` parses mentions, `policy.ts` and `targets.ts` normalize authorization/targeting, and `docx.ts`/`wiki.ts`/`drive.ts`/`perm.ts` implement tool APIs.
- `workspace/agents/<agent>/` contains agent workspaces rather than application code. `SOUL.md` and `IDENTITY.md` define behavior, `AGENTS.md` defines session startup and memory rules, `skills/*/SKILL.md` defines runnable skills, `MEMORY.md` stores curated long-term memory, and `memory/YYYY-MM-DD.md` stores session logs.
- In `workspace/agents/investment-advisor/`, the reporting pipeline is defined across `skills/*/SKILL.md`, `report-specs/shared-schema.md`, `INVESTMENT_WORKFLOW.md`, and `REPORT_TEMPLATES.md`: skills produce structured report data first, then Markdown, and optionally HTML/publishing outputs.

## Key conventions
- Always read the local `AGENTS.md` before changing anything inside a workspace. `investment-advisor` and `ops-admin` require `SOUL.md` -> `USER.md` -> today's and yesterday's `memory/YYYY-MM-DD.md` -> `MEMORY.md` (main session only); `dingding-assistant` has its own checklist in its local `AGENTS.md`.
- Skill definitions use YAML frontmatter with at least `name` and `description`. This pattern is consistent in both `workspace/agents/*/skills/*/SKILL.md` and `extensions/feishu/skills/*/SKILL.md`.
- Feishu tools use a single-tool-plus-`action` pattern. For example, `extensions/feishu/skills/feishu-doc/SKILL.md` documents one `feishu_doc` tool with actions like `read`, `write`, `append`, `create`, and `list_blocks`, and `extensions/feishu/src/docx.ts` implements that surface.
- In `extensions/feishu/src/`, one file usually owns one concern, validation schemas live in `*-schema.ts`, shared external types live in `types.ts`, and tests sit next to the source as `*.test.ts`.
- For investment-advisor reporting work, keep the existing conclusion-first structure from `REPORT_TEMPLATES.md` and the report skills: one-sentence conclusion, three-point summary, evidence/body, follow-up focus, and risk reminders. The workflow docs explicitly forbid fabricating missing market data.
