import tempfile
import unittest
from pathlib import Path
from unittest import mock

from services.register import domain_reputation, mail_provider, openai_register


class FakeResponse:
    status_code = 201
    text = ""

    def __init__(self, address: str):
        self.address = address

    def json(self):
        return {"data": {"address": self.address, "token": "mail-token"}}


class FakeYydsSession:
    def __init__(self):
        self.payloads = []

    def request(self, method, url, **kwargs):
        payload = kwargs.get("json") or {}
        self.payloads.append(payload)
        domain = payload.get("domain") or "random.example"
        return FakeResponse(f"name@{domain}")


class MailDomainReputationTests(unittest.TestCase):
    def make_store(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        return domain_reputation.DomainReputationStore(Path(tmp.name) / "mail_domain_reputation.json")

    def test_hard_fail_disables_domain_but_soft_fail_does_not(self):
        store = self.make_store()

        hard = store.record_failure("yyds_mail", "bad.example", "user_register_http_400 account_creation_failed")
        soft = store.record_failure("yyds_mail", "slow.example", "等待注册验证码超时")
        store.record_success("yyds_mail", "good.example")

        self.assertTrue(hard["disabled"])
        self.assertEqual(hard["bucket"], "hard")
        self.assertFalse(soft["disabled"])
        self.assertEqual(soft["bucket"], "soft")
        self.assertTrue(store.is_disabled("yyds_mail", "bad.example"))
        self.assertFalse(store.is_disabled("yyds_mail", "slow.example"))
        self.assertEqual(store.good_domains("yyds_mail"), ["good.example"])

    def test_success_reenables_domain_discovered_by_learning(self):
        store = self.make_store()
        store.record_failure("yyds_mail", "recovered.example", "unsupported_email")
        self.assertTrue(store.is_disabled("yyds_mail", "recovered.example"))

        store.record_success("yyds_mail", "recovered.example")

        self.assertFalse(store.is_disabled("yyds_mail", "recovered.example"))
        self.assertEqual(store.preferred_domains("yyds_mail", ["recovered.example"]), ["recovered.example"])

    def test_yyds_provider_skips_disabled_configured_domain(self):
        store = self.make_store()
        store.record_failure("yyds_mail", "bad.example", "unsupported_email")
        provider = mail_provider.YydsMailProvider(
            {"api_base": "https://maliapi.example/v1", "api_key": "key", "domain": ["bad.example", "good.example"]},
            {"request_timeout": 1, "wait_timeout": 1, "wait_interval": 0.2, "user_agent": "ua"},
        )
        provider.session = FakeYydsSession()

        with mock.patch.object(mail_provider.domain_reputation, "store", store):
            mailbox = provider.create_mailbox("name")

        self.assertEqual(mailbox["domain"], "good.example")
        self.assertEqual(provider.session.payloads[0]["domain"], "good.example")

    def test_yyds_provider_uses_learned_good_domains_when_config_domain_empty(self):
        store = self.make_store()
        store.record_success("yyds_mail", "learned.example")
        provider = mail_provider.YydsMailProvider(
            {"api_base": "https://maliapi.example/v1", "api_key": "key", "domain": [], "domain_explore_rate": 0},
            {"request_timeout": 1, "wait_timeout": 1, "wait_interval": 0.2, "user_agent": "ua"},
        )
        provider.session = FakeYydsSession()

        with mock.patch.object(mail_provider.domain_reputation, "store", store):
            mailbox = provider.create_mailbox("name")

        self.assertEqual(mailbox["domain"], "learned.example")
        self.assertEqual(provider.session.payloads[0]["domain"], "learned.example")

    def test_yyds_provider_uses_builtin_seed_domains_when_config_domain_empty(self):
        store = self.make_store()
        provider = mail_provider.YydsMailProvider(
            {"api_base": "https://maliapi.example/v1", "api_key": "key", "domain": [], "domain_explore_rate": 0},
            {"request_timeout": 1, "wait_timeout": 1, "wait_interval": 0.2, "user_agent": "ua"},
        )
        provider.session = FakeYydsSession()

        with mock.patch.object(mail_provider.domain_reputation, "store", store):
            mailbox = provider.create_mailbox("name")

        self.assertIn(mailbox["domain"], mail_provider.YYDS_DEFAULT_DOMAINS)
        self.assertIn(provider.session.payloads[0]["domain"], mail_provider.YYDS_DEFAULT_DOMAINS)

    def test_yyds_provider_explores_random_pool_when_learning_triggers(self):
        store = self.make_store()
        provider = mail_provider.YydsMailProvider(
            {"api_base": "https://maliapi.example/v1", "api_key": "key", "domain": ["seed.example"], "domain_explore_rate": 1},
            {"request_timeout": 1, "wait_timeout": 1, "wait_interval": 0.2, "user_agent": "ua"},
        )
        provider.session = FakeYydsSession()

        with mock.patch.object(mail_provider.domain_reputation, "store", store):
            mailbox = provider.create_mailbox("name")

        self.assertNotIn("domain", provider.session.payloads[0])
        self.assertEqual(mailbox["domain"], "random.example")

    def test_yyds_provider_explores_random_pool_when_all_known_domains_disabled(self):
        store = self.make_store()
        store.record_failure("yyds_mail", "bad.example", "unsupported_email")
        store.record_failure("yyds_mail", "worse.example", "account_creation_failed")
        provider = mail_provider.YydsMailProvider(
            {"api_base": "https://maliapi.example/v1", "api_key": "key", "domain": ["bad.example", "worse.example"], "domain_explore_rate": 0},
            {"request_timeout": 1, "wait_timeout": 1, "wait_interval": 0.2, "user_agent": "ua"},
        )
        provider.session = FakeYydsSession()

        with mock.patch.object(mail_provider.domain_reputation, "store", store):
            mailbox = provider.create_mailbox("name")

        self.assertNotIn("domain", provider.session.payloads[0])
        self.assertEqual(mailbox["domain"], "random.example")

    def test_preferred_domains_prioritizes_success_and_demotes_soft_failures(self):
        store = self.make_store()
        store.record_success("yyds_mail", "winner.example")
        store.record_success("yyds_mail", "tired.example")
        for _ in range(10):
            store.record_failure("yyds_mail", "tired.example", "等待注册验证码超时")

        self.assertEqual(store.preferred_domains("yyds_mail", ["tired.example", "winner.example", "fresh.example"]), ["winner.example"])

    def test_worker_records_success_and_failure_domains(self):
        store = self.make_store()

        with (
            mock.patch.object(openai_register.domain_reputation, "store", store),
            mock.patch.object(openai_register.account_service, "add_accounts"),
            mock.patch.object(openai_register.account_service, "refresh_accounts"),
            mock.patch.object(openai_register.PlatformRegistrar, "close"),
        ):
            with mock.patch.object(openai_register.PlatformRegistrar, "register", return_value={
                "email": "ok@good.example",
                "password": "pw",
                "access_token": "token",
                "refresh_token": "refresh",
                "id_token": "id",
                "mail_provider": "yyds_mail",
                "mail_domain": "good.example",
            }):
                ok = openai_register.worker(1)

            error = openai_register.RegisterAttemptError(
                "create_account_http_400 unsupported_email",
                {"provider": "yyds_mail", "address": "bad@bad.example", "domain": "bad.example"},
            )
            with mock.patch.object(openai_register.PlatformRegistrar, "register", side_effect=error):
                bad = openai_register.worker(2)

        self.assertTrue(ok["ok"])
        self.assertFalse(bad["ok"])
        self.assertEqual(store.good_domains("yyds_mail"), ["good.example"])
        self.assertTrue(store.is_disabled("yyds_mail", "bad.example"))


if __name__ == "__main__":
    unittest.main()
