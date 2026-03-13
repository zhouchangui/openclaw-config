import importlib.util
import tempfile
import unittest
from pathlib import Path


WORKSPACE_ROOT = Path("/Users/zcg/.openclaw/workspace/agents/wechat-lobster")


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class SkillPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cover_module = load_module(
            "wechat_lobster_generate_cover",
            WORKSPACE_ROOT / "skills/cover-generator/scripts/generate_cover.py",
        )
        cls.image_module = load_module(
            "wechat_lobster_generate_image",
            WORKSPACE_ROOT / "skills/image-generator/scripts/generate_image.py",
        )
        cls.article_module = load_module(
            "wechat_lobster_start_article",
            WORKSPACE_ROOT / "skills/article-writer/scripts/start_article.py",
        )

    def test_cover_runtime_state_dir_uses_openclaw(self):
        home_dir = Path("/tmp/wechat-lobster-home")
        self.assertEqual(
            self.cover_module.resolve_state_dir(home_dir),
            home_dir / ".openclaw",
        )

    def test_cover_default_output_dir_is_workspace_level(self):
        self.assertEqual(
            self.cover_module.DEFAULT_OUTPUT_DIR,
            WORKSPACE_ROOT / "output" / "covers",
        )

    def test_image_default_output_dir_is_workspace_level(self):
        self.assertEqual(
            self.image_module.DEFAULT_OUTPUT_DIR,
            WORKSPACE_ROOT / "output" / "images",
        )

    def test_start_article_creates_in_workspace_drafts(self):
        created = Path(self.article_module.create_article("path-audit-title", "audit"))
        try:
            self.assertEqual(created.parent, WORKSPACE_ROOT / "drafts")
        finally:
            if created.exists():
                created.unlink()

    def test_cover_local_payload_is_publish_ready(self):
        payload = self.cover_module.build_local_cover_payload(
            "标题示例",
            eyebrow="少打扰，多产出",
            footer="适合一人公司内容运营",
        )
        combined = " ".join(str(value) for value in payload.values())
        self.assertEqual(payload["badge"], "盯钉喵 / 自动化工作流")
        self.assertEqual(payload["eyebrow"], "少打扰，多产出")
        self.assertEqual(payload["footer"], "适合一人公司内容运营")
        self.assertNotIn("fallback", combined.lower())
        self.assertNotIn("本地", combined)

    def test_image_local_payload_supports_structured_card_copy(self):
        payload = self.image_module.build_local_card_payload(
            prompt="unused prompt",
            card_type="流程替代卡",
            title="把碎事交给流程",
            bullets=["热点抓取", "初稿生成", "发布前检查"],
        )
        self.assertEqual(payload["tag"], "流程替代卡")
        self.assertEqual(payload["title"], "把碎事交给流程")
        self.assertEqual(
            payload["bullets"],
            ["热点抓取", "初稿生成", "发布前检查"],
        )
        combined = " ".join(payload["bullets"]) + payload["title"] + payload["tag"]
        self.assertNotIn("fallback", combined.lower())


if __name__ == "__main__":
    unittest.main()
