"""Live smoke test: AGMX_API_KEY=agmx_acc_... AGMX_BASE_URL=http://localhost:3100 python3 tests/smoke.py"""
import json
import os
import sys
import threading
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from agmx import Agmx, AgmxError  # noqa: E402

base = os.environ.get("AGMX_BASE_URL", "http://localhost:3100")
agmx = Agmx(os.environ["AGMX_API_KEY"], base)

me = agmx.me()
assert me["auth"]["kind"] == "account_key", me["auth"]
try:
    agmx.get_message("msg_nope")
    raise SystemExit("expected NotFound")
except AgmxError as e:
    assert e.tag == "NotFound" and e.status == 404, e

agent_id = agmx.request("GET", "/agents")[0]["id"]
tmp = agmx.create_inbox(agent_id=agent_id, expires_in=600, max_messages=5, accept_from=["github.com"])
assert tmp["temporary"] is True


def inject():
    time.sleep(0.5)
    body = json.dumps({"from": "GitHub <noreply@github.com>", "to": tmp["address"], "subject": "Code", "text": "Your verification code is 135790"}).encode()
    urllib.request.urlopen(urllib.request.Request(f"{base}/api/dev/inbound", data=body, headers={"content-type": "application/json"}, method="POST"))


threading.Thread(target=inject).start()
got = agmx.wait_for_code(inbox_id=tmp["address"], timeout=20)
assert got and got["code"] == "135790", got
assert got["message"]["security"]["risk"] == "low"

key = "py-fixed-" + str(int(time.time()))
a = agmx.send("nobody@example.com", "Idem", text="x", from_=tmp["address"], idempotency_key=key)
b = agmx.send("nobody@example.com", "Idem", text="x", from_=tmp["address"], idempotency_key=key)
assert a["id"] == b["id"]

draft = agmx.create_draft(from_=tmp["address"], subject="Draft from Python")
draft = agmx.update_draft(draft["id"], to="nobody@example.com", text="hello")
assert draft["status"] == "draft"
assert isinstance(agmx.approvals(), list)
agmx.delete_inbox(tmp["id"])
print("python smoke test: OK")
