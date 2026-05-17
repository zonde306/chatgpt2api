from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTER_CARD = ROOT / "web" / "src" / "app" / "register" / "components" / "register-card.tsx"
SETTINGS_STORE = ROOT / "web" / "src" / "app" / "settings" / "store.ts"
CODEX_POC = ROOT / "scripts" / "codex_oauth_poc.py"


class RegisterHeroSmsConfigTests(unittest.TestCase):
    def test_default_register_config_contains_hero_sms_defaults(self) -> None:
        from services.register_service import _default_config

        cfg = _default_config()

        self.assertEqual(
            cfg["hero_sms"],
            {
                "enabled": False,
                "api_key": "",
                "service": "dr",
                "country": 16,
                "operator": "any",
                "wait_timeout": 1200,
                "poll_interval": 5,
            },
        )

    def test_normalize_preserves_and_sanitizes_hero_sms_config(self) -> None:
        from services.register_service import _normalize

        cfg = _normalize(
            {
                "hero_sms": {
                    "enabled": True,
                    "api_key": "  hero-key  ",
                    "service": "",
                    "country": "187",
                    "operator": "",
                    "wait_timeout": "0",
                    "poll_interval": "2",
                }
            }
        )

        self.assertEqual(cfg["hero_sms"]["enabled"], True)
        self.assertEqual(cfg["hero_sms"]["api_key"], "hero-key")
        self.assertEqual(cfg["hero_sms"]["service"], "dr")
        self.assertEqual(cfg["hero_sms"]["country"], 187)
        self.assertEqual(cfg["hero_sms"]["operator"], "any")
        self.assertEqual(cfg["hero_sms"]["wait_timeout"], 1200)
        self.assertEqual(cfg["hero_sms"]["poll_interval"], 2)

    def test_register_ui_exposes_hero_sms_fields(self) -> None:
        source = REGISTER_CARD.read_text(encoding="utf-8")

        self.assertIn("HeroSMS 接码配置", source)
        self.assertIn("setHeroSmsField", source)
        self.assertIn("config.hero_sms.api_key", source)
        self.assertIn("config.hero_sms.country", source)
        self.assertIn("config.hero_sms.operator", source)

    def test_register_store_saves_hero_sms_config(self) -> None:
        source = SETTINGS_STORE.read_text(encoding="utf-8")

        self.assertIn("setRegisterHeroSmsField", source)
        self.assertIn("hero_sms: registerConfig.hero_sms", source)

    def test_codex_poc_reads_hero_sms_config_without_printing_key(self) -> None:
        source = CODEX_POC.read_text(encoding="utf-8")

        self.assertIn("config.get(\"hero_sms\")", source)
        self.assertIn("HeroSMS enabled", source)
        self.assertIn("api_key", source)
        self.assertNotIn("hero_sms['api_key']", source)


if __name__ == "__main__":
    unittest.main()
