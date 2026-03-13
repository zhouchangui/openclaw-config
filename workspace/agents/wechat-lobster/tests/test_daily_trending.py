import importlib.util
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


WORKSPACE_ROOT = Path("/Users/zcg/.openclaw/workspace/agents/wechat-lobster")


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class DailyTrendingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_module(
            "wechat_lobster_daily_trending",
            WORKSPACE_ROOT / "skills/daily-trending/scripts/fetch_tophub.py",
        )

    def test_load_api_key_from_secrets_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            secrets_path = Path(tmpdir) / "tophub-config.json"
            secrets_path.write_text(json.dumps({"access_key": "abc123"}), encoding="utf-8")
            self.assertEqual(self.module.load_api_key(secrets_path), "abc123")

    def test_extract_titles_from_nested_payload(self):
        payload = {
            "data": {
                "list": [
                    {"title": "热点 A"},
                    {"name": "热点 B"},
                    {"headline": "热点 C"},
                ]
            }
        }
        self.assertEqual(
            self.module.extract_titles(payload, limit=3),
            ["热点 A", "热点 B", "热点 C"],
        )

    def test_format_output_uses_expected_delimiter(self):
        result = self.module.format_output({"weibo": ["热点 A", "热点 B"], "zhihu": ["热点 B", "热点 C"]})
        self.assertIn("======", result)
        self.assertIn("1. 热点 A", result)
        self.assertIn("2. 热点 B", result)
        self.assertIn("3. 热点 C", result)

    def test_fetch_json_raises_on_api_error_payload(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps(
                    {
                        "error": True,
                        "status": 100202,
                        "msg": "请求 IP 受限，检查白名单",
                    }
                ).encode("utf-8")

        with patch.object(self.module.urllib.request, "urlopen", return_value=FakeResponse()):
            with self.assertRaisesRegex(RuntimeError, "100202|请求 IP 受限"):
                self.module.fetch_json("https://api.tophubdata.com/nodes/KqndgxeLl9", "demo-key")


if __name__ == "__main__":
    unittest.main()
