from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from api.app import create_app


AUTH_HEADERS = {"Authorization": "Bearer test-admin"}


class CpaOutputRemovalTests(unittest.TestCase):
    def test_register_config_no_longer_exposes_cpa_auto_import(self) -> None:
        from services.register_service import _default_config

        config = _default_config()

        self.assertNotIn("cpa_auto_import", config)

    def test_accounts_api_no_longer_exposes_cpa_export_route(self) -> None:
        app = create_app()
        client = TestClient(app)

        for method in ("post", "get"):
            request = getattr(client, method)
            kwargs = {"headers": AUTH_HEADERS}
            if method == "post":
                kwargs["json"] = {"access_tokens": ["token-one"]}
            response = request("/api/accounts/export/cpa", **kwargs)
            with self.subTest(method=method):
                self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
