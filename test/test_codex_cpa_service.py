from __future__ import annotations

import base64
import json
import unittest


def jwt_with_payload(payload: dict) -> str:
    def encode(value: dict) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return f"{encode({'alg': 'none'})}.{encode(payload)}.signature"


class CodexCpaServiceTests(unittest.TestCase):
    def test_build_codex_auth_file_uses_access_exp_and_id_token_account_id(self):
        from services.codex_cpa_service import build_codex_auth_payload

        access_token = jwt_with_payload({"exp": 1779237817, "iat": 1779198844})
        id_token = jwt_with_payload(
            {
                "email": "User@Example.com",
                "https://api.openai.com/auth.account_id": "account-from-id-token",
                "chatgpt_account_id": "fallback-account",
            }
        )

        payload = build_codex_auth_payload(
            {
                "email": "User@Example.com",
                "access_token": access_token,
                "refresh_token": "refresh-token",
                "id_token": id_token,
            }
        )

        self.assertEqual(payload["type"], "codex")
        self.assertEqual(payload["email"], "User@Example.com")
        self.assertEqual(payload["access_token"], access_token)
        self.assertEqual(payload["refresh_token"], "refresh-token")
        self.assertEqual(payload["id_token"], id_token)
        self.assertEqual(payload["account_id"], "account-from-id-token")
        self.assertEqual(payload["expired"], "2026-05-20T00:43:37.000+08:00")
        self.assertFalse(payload["disabled"])

    def test_build_codex_auth_file_falls_back_to_access_profile_email_and_account_id(self):
        from services.codex_cpa_service import build_codex_auth_payload

        access_token = jwt_with_payload(
            {
                "exp": 1779237817,
                "https://api.openai.com/profile": {"email": "from-token@example.com"},
                "https://api.openai.com/auth": {"user_id": "user-from-access"},
            }
        )

        payload = build_codex_auth_payload(
            {
                "access_token": access_token,
                "refresh_token": "refresh-token",
                "id_token": "bad-token",
            }
        )

        self.assertEqual(payload["email"], "from-token@example.com")
        self.assertEqual(payload["account_id"], "user-from-access")

    def test_build_codex_upload_file_uses_email_filename(self):
        from services.codex_cpa_service import build_codex_upload_file

        access_token = jwt_with_payload({"exp": 1779237817})
        filename, body = build_codex_upload_file(
            {
                "email": "User@Example.com",
                "access_token": access_token,
                "refresh_token": "refresh-token",
                "id_token": "id-token",
            }
        )

        self.assertEqual(filename, "User@Example.com.json")
        self.assertIn(b'"type": "codex"', body)
        self.assertIn(b'"refresh_token": "refresh-token"', body)


if __name__ == "__main__":
    unittest.main()
