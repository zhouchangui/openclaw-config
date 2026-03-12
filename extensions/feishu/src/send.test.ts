import { describe, expect, it, vi } from "vitest";

vi.mock("openclaw/plugin-sdk", () => ({}));
vi.mock("openclaw/plugin-sdk/account-id", () => ({
  DEFAULT_ACCOUNT_ID: "default",
  normalizeAccountId: (value: string) => value,
}));
vi.mock("./accounts.js", () => ({
  resolveFeishuAccount: vi.fn(),
}));
vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(),
}));
vi.mock("./mention.js", () => ({
  buildMentionedMessage: vi.fn(),
  buildMentionedCardContent: vi.fn((_, text: string) => text),
}));
vi.mock("./runtime.js", () => ({
  getFeishuRuntime: vi.fn(),
}));
vi.mock("./targets.js", () => ({
  normalizeFeishuTarget: vi.fn(),
  resolveReceiveIdType: vi.fn(),
}));

import { buildMarkdownCard } from "./send.js";

describe("buildMarkdownCard", () => {
  it("builds a report summary card with action button when text looks like a report digest", () => {
    const card = buildMarkdownCard([
      "A股收盘报告｜2026-03-12",
      "结论：今天A股整体呈现成长领先，创业板指+1.31%，主线集中在逆变器。",
      "- 指数结构：创业板指+1.31%，上证指数+0.27%。",
      "- 板块主线：逆变器+8.30%居前。",
      "- 技术确认：创业板指当前处于强势修复。",
      "链接：https://reports.bothub.run/reports/closing/2026-03-12/index.html?v=abc123",
    ].join("\n"));

    expect(card).toMatchObject({
      schema: "2.0",
      header: {
        title: {
          content: "A股收盘报告｜2026-03-12",
        },
      },
    });

    expect(card.body).toMatchObject({
      elements: expect.arrayContaining([
        expect.objectContaining({
          tag: "markdown",
        }),
        expect.objectContaining({
          tag: "action",
          actions: expect.arrayContaining([
            expect.objectContaining({
              tag: "button",
              type: "primary",
              url: "https://reports.bothub.run/reports/closing/2026-03-12/index.html?v=abc123",
            }),
          ]),
        }),
      ]),
    });
  });

  it("builds a report card from the live three-line scheduled summary format", () => {
    const card = buildMarkdownCard([
      "A股早盘报告｜2026-03-12",
      "今天开盘前更偏向先看成长制造承接，再用 A50、汇率与流动性信号确认风险偏好是否延续。",
      "完整报告：https://reports.bothub.run/reports/morning/2026-03-12/index.html?v=live123",
    ].join("\n"));

    expect(card).toMatchObject({
      schema: "2.0",
      header: {
        title: {
          content: "A股早盘报告｜2026-03-12",
        },
      },
      body: {
        elements: expect.arrayContaining([
          expect.objectContaining({
            tag: "action",
            actions: expect.arrayContaining([
              expect.objectContaining({
                url: "https://reports.bothub.run/reports/morning/2026-03-12/index.html?v=live123",
              }),
            ]),
          }),
        ]),
      },
    });
  });
});
