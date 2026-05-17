from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any


CPA_TZ = timezone(timedelta(hours=8))
ACCOUNT_ID_CLAIMS = (
    "https://api.openai.com/auth.account_id",
    "chatgpt_account_id",
    "project_id",
)
INVALID_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|]+')


def decode_jwt_payload(token: str) -> dict[str, Any]:
    try:
        payload = str(token or "").split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def format_cpa_time(timestamp: int | float | str | None = None) -> str:
    if timestamp is None:
        dt = datetime.now(CPA_TZ)
    else:
        dt = datetime.fromtimestamp(float(timestamp), timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000+08:00")


def _first_text(*values: object) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _email_from_payloads(tokens: dict, access_payload: dict, id_payload: dict) -> str:
    profile = access_payload.get("https://api.openai.com/profile")
    profile_email = profile.get("email") if isinstance(profile, dict) else ""
    return _first_text(tokens.get("email"), id_payload.get("email"), access_payload.get("email"), profile_email)


def _account_id_from_payloads(access_payload: dict, id_payload: dict) -> str:
    for claim in ACCOUNT_ID_CLAIMS:
        value = _first_text(id_payload.get(claim), access_payload.get(claim))
        if value:
            return value
    auth = access_payload.get("https://api.openai.com/auth")
    if isinstance(auth, dict):
        return _first_text(auth.get("user_id"), auth.get("account_id"))
    return ""


def build_codex_auth_payload(tokens: dict) -> dict:
    access_token = str(tokens.get("access_token") or "").strip()
    refresh_token = str(tokens.get("refresh_token") or "").strip()
    id_token = str(tokens.get("id_token") or "").strip()
    access_payload = decode_jwt_payload(access_token)
    id_payload = decode_jwt_payload(id_token)
    exp = access_payload.get("exp")
    return {
        "type": "codex",
        "email": _email_from_payloads(tokens, access_payload, id_payload),
        "expired": format_cpa_time(exp),
        "id_token": id_token,
        "account_id": _account_id_from_payloads(access_payload, id_payload),
        "disabled": False,
        "access_token": access_token,
        "last_refresh": format_cpa_time(),
        "refresh_token": refresh_token,
    }


def _safe_filename(email: str) -> str:
    name = INVALID_FILENAME_CHARS.sub("_", str(email or "").strip())
    return f"{name or 'codex-auth'}.json"


def build_codex_upload_file(tokens: dict) -> tuple[str, bytes]:
    payload = build_codex_auth_payload(tokens)
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    return _safe_filename(payload.get("email") or ""), body
