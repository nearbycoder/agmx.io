"""AGMX — email inboxes for AI agents.

    from agmx import Agmx
    agmx = Agmx(api_key="agmx_agt_...")
    result = agmx.wait_for_code(from_="github.com", timeout=60)
    print(result["code"] if result else "no code")

Pure standard library (urllib + json). Every failure raises ``AgmxError`` with a
stable ``tag`` (e.g. "QuotaExceeded", "NotFound") you can branch on.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Union
from urllib import error as urlerror
from urllib import parse, request

__all__ = ["Agmx", "AgmxError", "__version__"]
__version__ = "0.1.0"

DEFAULT_BASE_URL = "https://agmx.io"
Json = Dict[str, Any]
Recipients = Union[str, List[str]]


class AgmxError(Exception):
    """An API or client error. ``tag`` mirrors the API's ``_tag``."""

    def __init__(self, tag: str, message: str, status: int = 0, body: Optional[Json] = None) -> None:
        super().__init__(f"{tag}: {message}")
        self.tag = tag
        self.message = message
        self.status = status
        self.body = body or {}


def _clean(values: Json) -> Json:
    return {k: v for k, v in values.items() if v is not None}


def _http(method: str, url: str, *, headers: Optional[Dict[str, str]] = None, body: Any = None,
          query: Optional[Json] = None, timeout: float = 30.0) -> Any:
    if query:
        params = {k: ("true" if v is True else "false" if v is False else v) for k, v in _clean(query).items()}
        if params:
            url = f"{url}?{parse.urlencode(params)}"
    data = None
    all_headers = {"accept": "application/json", "user-agent": f"agmx-python/{__version__}", **(headers or {})}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        all_headers["content-type"] = "application/json"
    req = request.Request(url, data=data, method=method, headers=all_headers)
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urlerror.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw) if raw else {}
        except ValueError:
            payload = {"message": raw.decode("utf-8", "replace")}
        if not isinstance(payload, dict):
            payload = {}
        raise AgmxError(str(payload.get("_tag", "HttpError")), str(payload.get("message", exc.reason)), exc.code, payload) from None
    except urlerror.URLError as exc:
        raise AgmxError("NetworkError", f"Network error: {exc.reason}") from None
    except TimeoutError:
        raise AgmxError("Timeout", f"Request timed out: {method} {url}") from None


class Agmx:
    """Client for the AGMX REST API."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL, timeout: float = 30.0) -> None:
        if not api_key:
            raise AgmxError("Unauthorized", "An API key is required: Agmx(api_key='agmx_...')")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # -- plumbing -------------------------------------------------------------

    def request(self, method: str, path: str, *, body: Any = None, query: Optional[Json] = None,
                headers: Optional[Dict[str, str]] = None, timeout: Optional[float] = None) -> Any:
        return _http(method, f"{self.base_url}/api/v1{path}", body=body, query=query, timeout=timeout or self.timeout,
                     headers={"authorization": f"Bearer {self.api_key}", **(headers or {})})

    @staticmethod
    def _idem(key: Optional[str]) -> Dict[str, str]:
        return {"idempotency-key": key or str(uuid.uuid4())}

    # -- account --------------------------------------------------------------

    def me(self) -> Json:
        """Account, plan limits, usage, and which agent this key belongs to."""
        return self.request("GET", "/me")

    # -- inboxes --------------------------------------------------------------

    def inboxes(self, agent_id: Optional[str] = None) -> List[Json]:
        return self.request("GET", "/inboxes", query={"agentId": agent_id})

    def create_inbox(self, username: Optional[str] = None, *, display_name: Optional[str] = None,
                     domain: Optional[str] = None, agent_id: Optional[str] = None, expires_in: Optional[int] = None,
                     max_messages: Optional[int] = None, accept_from: Optional[List[str]] = None) -> Json:
        """Create an inbox. ``expires_in`` (seconds) makes it temporary; ``accept_from`` locks it to senders/domains."""
        return self.request("POST", "/inboxes", body=_clean({
            "username": username, "displayName": display_name, "domain": domain, "agentId": agent_id,
            "expiresIn": expires_in, "maxMessages": max_messages, "acceptFrom": accept_from,
        }))

    def delete_inbox(self, inbox_id: str) -> Json:
        return self.request("DELETE", f"/inboxes/{parse.quote(inbox_id, safe='')}")

    # -- messages -------------------------------------------------------------

    def messages(self, *, inbox_id: Optional[str] = None, folder: Optional[str] = None, unread: Optional[bool] = None,
                 q: Optional[str] = None, limit: int = 25, cursor: Optional[str] = None) -> Json:
        return self.request("GET", "/messages", query={
            "inboxId": inbox_id, "folder": folder, "unread": unread, "q": q, "limit": limit, "cursor": cursor})

    def get_message(self, message_id: str, *, mark_read: Optional[bool] = None) -> Json:
        """Full message. Read ``safeText`` (visible text only) and check ``security["risk"]``."""
        return self.request("GET", f"/messages/{parse.quote(message_id, safe='')}", query={"markRead": mark_read})

    def send(self, to: Recipients, subject: str = "", *, text: Optional[str] = None, html: Optional[str] = None,
             from_: Optional[str] = None, cc: Optional[Recipients] = None, bcc: Optional[Recipients] = None,
             attachments: Optional[List[Json]] = None, send_at: Optional[str] = None,
             idempotency_key: Optional[str] = None) -> Json:
        """Send (or schedule with ``send_at``). Retries are safe: an idempotency key is always sent."""
        body = _clean({"from": from_, "to": to, "cc": cc, "bcc": bcc, "subject": subject, "text": text, "html": html,
                       "attachments": attachments, "sendAt": send_at})
        return self.request("POST", "/messages", body=body, headers=self._idem(idempotency_key))

    def reply(self, message_id: str, *, text: Optional[str] = None, html: Optional[str] = None,
              reply_all: bool = False, send_at: Optional[str] = None, idempotency_key: Optional[str] = None) -> Json:
        return self.request("POST", f"/messages/{parse.quote(message_id, safe='')}/reply",
                            body=_clean({"text": text, "html": html, "replyAll": reply_all or None, "sendAt": send_at}),
                            headers=self._idem(idempotency_key))

    def wait(self, *, inbox_id: Optional[str] = None, from_: Optional[str] = None, subject: Optional[str] = None,
             timeout: int = 30, since: Optional[str] = None) -> Json:
        """Long-poll for the next inbound message (max 60s). Returns ``{"message": ..., "timedOut": bool}``."""
        timeout = max(1, min(int(timeout), 60))
        return self.request("GET", "/messages/wait", timeout=timeout + 15, query={
            "inboxId": inbox_id, "from": from_, "subject": subject, "timeout": timeout, "since": since})

    def wait_for_code(self, *, inbox_id: Optional[str] = None, from_: Optional[str] = None,
                      subject: Optional[str] = None, timeout: int = 60) -> Optional[Json]:
        """Wait for the next email with a verification code. Returns ``{"code", "message"}`` or ``None``."""
        deadline = time.monotonic() + timeout
        since = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        while time.monotonic() < deadline:
            remaining = max(1, min(60, int(deadline - time.monotonic()) or 1))
            result = self.wait(inbox_id=inbox_id, from_=from_, subject=subject, timeout=remaining, since=since)
            message = result.get("message")
            if not message:
                continue
            codes = message.get("extracted", {}).get("codes", [])
            if codes:
                return {"code": codes[0], "message": message}
            since = message["createdAt"]
        return None

    # -- drafts & approvals ---------------------------------------------------

    def create_draft(self, **fields: Any) -> Json:
        """Fields mirror the API (``to``, ``subject``, ``text``, ``replyToMessageId``…); use ``from_`` for ``from``."""
        if "from_" in fields:
            fields["from"] = fields.pop("from_")
        return self.request("POST", "/drafts", body=_clean(fields))

    def update_draft(self, message_id: str, **fields: Any) -> Json:
        if "from_" in fields:
            fields["from"] = fields.pop("from_")
        return self.request("PATCH", f"/drafts/{parse.quote(message_id, safe='')}", body=_clean(fields))

    def send_draft(self, message_id: str, *, send_at: Optional[str] = None) -> Json:
        return self.request("POST", f"/drafts/{parse.quote(message_id, safe='')}/send", body=_clean({"sendAt": send_at}))

    def drafts(self, inbox_id: Optional[str] = None) -> Json:
        return self.request("GET", "/drafts", query={"inboxId": inbox_id})

    def approvals(self) -> List[Json]:
        """Mail held by an agent's send policy (humans and account keys only)."""
        return self.request("GET", "/approvals")

    def approve(self, message_id: str) -> Json:
        return self.request("POST", f"/approvals/{parse.quote(message_id, safe='')}/approve")

    def reject(self, message_id: str, reason: Optional[str] = None) -> Json:
        return self.request("POST", f"/approvals/{parse.quote(message_id, safe='')}/reject", body=_clean({"reason": reason}))

    # -- sign-up --------------------------------------------------------------

    @classmethod
    def signup(cls, name: str, *, username: Optional[str] = None, owner_email: Optional[str] = None,
               description: Optional[str] = None, base_url: str = DEFAULT_BASE_URL,
               on_approval_url: Optional[Callable[[Json], None]] = None, timeout: Optional[float] = None) -> "Agmx":
        """Request an inbox, hand the approval link to your human, and poll until approved.

        Returns a ready client; the key is on ``client.api_key`` (shown once — store it securely)."""
        base = base_url.rstrip("/")
        started = _http("POST", f"{base}/api/v1/signup", body=_clean({
            "name": name, "username": username, "ownerEmail": owner_email, "description": description}))
        (on_approval_url or (lambda s: print(f"Approve this agent at {s['approvalUrl']} (code {s['userCode']})")))(started)
        deadline = time.monotonic() + (timeout if timeout is not None else 31 * 60)
        while time.monotonic() < deadline:
            time.sleep(started["pollIntervalSeconds"])
            status = _http("GET", f"{base}/api/v1/signup/{started['signupId']}", query={"token": started["pollToken"]})
            if status["status"] == "approved" and status.get("apiKey"):
                return cls(status["apiKey"], base)
            if status["status"] == "denied":
                raise AgmxError("SignupDenied", "Your human denied this sign-up request.")
            if status["status"] == "expired":
                raise AgmxError("SignupExpired", "The sign-up request expired. Start again.")
            if status["status"] == "completed":
                raise AgmxError("SignupAlreadyCompleted", "This sign-up already handed out its key.")
        raise AgmxError("Timeout", "Timed out waiting for approval.")
