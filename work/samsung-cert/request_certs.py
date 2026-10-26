#!/usr/bin/env python3
"""Request Samsung TV author + distributor certificates for a given DUID.

Mirrors Tizen Certificate Manager's Samsung flow (org.tizen.common.cert):
OAuth sign-in -> http://localhost:4794/signin/callback, then multipart POSTs of
the CSRs to svdca.samsungqbe.com. Never prints tokens, keys or passwords.

Usage: request_certs.py <out_dir> <duid> <ca_dir>
  ca_dir must contain author-ca.pem and distributor-ca.pem (public CA certs).
"""
import http.server
import json
import os
import secrets
import subprocess
import sys
import threading
import urllib.parse
import urllib.request

SIGNIN_URL = ("https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h"
              "&actionID=StartOAuth2&accessToken=Y"
              "&redirect_uri=http://localhost:4794/signin/callback")
AUTHOR_URL = "https://svdca.samsungqbe.com/apis/v3/authors"
DIST_URL = "https://svdca.samsungqbe.com/apis/v3/distributors"
AUTHOR_SUBJ = "/C=FI/ST=Uusimaa/L=Helsinki/O=Personal/OU=Home/CN=TARDIS Home"

out_dir, duid, ca_dir = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out_dir, mode=0o700, exist_ok=True)
os.chmod(out_dir, 0o700)
P = lambda name: os.path.join(out_dir, name)


def run(*args, **kw):
    subprocess.run(args, check=True, capture_output=True, **kw)


# --- 1. Sign-in: capture the OAuth callback ---------------------------------
auth = {}
done = threading.Event()


def parse(raw):
    params = dict(urllib.parse.parse_qsl(raw))
    code = params.get("code", raw)
    try:
        data = json.loads(code)
    except ValueError:
        data = dict(urllib.parse.parse_qsl(code))
    data.update({k: v for k, v in params.items() if k != "code"})
    return data


class Handler(http.server.BaseHTTPRequestHandler):
    def _handle(self, body=""):
        query = urllib.parse.urlsplit(self.path).query
        data = parse(query) if query else {}
        if body:
            data.update(parse(body))
        if data.get("access_token") and data.get("userId"):
            auth.update(data)
            msg = b"Signed in. You can close this tab and return to Claude."
            done.set()
        else:
            msg = b"Waiting for Samsung sign-in..."
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(msg)

    def do_GET(self):
        self._handle()

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self._handle(self.rfile.read(n).decode("utf-8", "replace"))

    def log_message(self, *a):
        pass


server = http.server.HTTPServer(("127.0.0.1", 4794), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
subprocess.run(["open", SIGNIN_URL])
print("Opened Samsung sign-in in the browser; waiting for callback...", flush=True)
if not done.wait(900):
    sys.exit("Timed out waiting for Samsung sign-in.")
server.shutdown()
email = urllib.parse.unquote(auth.get("inputEmailID", ""))
print("Signed in; account email:", email or "(not provided)", flush=True)

# --- 2. Keys and CSRs --------------------------------------------------------
for role in ("author", "distributor"):
    run("openssl", "genrsa", "-out", P(role + ".pri"), "2048")
    os.chmod(P(role + ".pri"), 0o600)

run("openssl", "req", "-new", "-sha512", "-key", P("author.pri"),
    "-subj", AUTHOR_SUBJ, "-out", P("author.csr"))

cnf = P("distributor.cnf")
with open(cnf, "w") as f:
    f.write("[req]\ndistinguished_name=dn\nreq_extensions=ext\nprompt=no\n"
            "[dn]\nCN=TizenSDK\nemailAddress=%s\n"
            "[ext]\nsubjectAltName=URI:URN:tizen:packageid=,URI:URN:tizen:deviceid=%s\n"
            % (email, duid))
run("openssl", "req", "-new", "-sha512", "-key", P("distributor.pri"),
    "-config", cnf, "-out", P("distributor.csr"))


# --- 3. Ask Samsung to sign them --------------------------------------------
def post(url, fields, csr_path):
    b = "*****"
    parts = []
    for k, v in fields.items():
        parts.append(("--%s\r\nContent-Type: text/plain; charset=utf-8\r\n"
                      "Content-Disposition: form-data; name=%s\r\n\r\n%s\r\n" % (b, k, v)).encode())
    name = os.path.basename(csr_path)
    parts.append(("--%s\r\nContent-Disposition: form-data; name=csr; filename=%s\r\n\r\n"
                  % (b, name)).encode() + open(csr_path, "rb").read() + b"\r\n")
    parts.append(("--%s--\r\n" % b).encode())
    req = urllib.request.Request(url, data=b"".join(parts), method="POST",
                                 headers={"content-type": 'multipart/form-data; boundary="*****"'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        sys.exit("Samsung server error %s for %s: %s" % (e.code, url, e.read()[:500].decode("utf-8", "replace")))


base = {"access_token": auth["access_token"], "user_id": auth["userId"], "platform": "VD"}
for role, url, extra in (("author", AUTHOR_URL, {}),
                         ("distributor", DIST_URL, {"privilege_level": "Public",
                                                    "developer_type": "Individual"})):
    body = post(url, dict(base, **extra), P(role + ".csr"))
    if "BEGIN CERTIFICATE" not in body:
        sys.exit("Unexpected %s response: %s" % (role, body[:500]))
    with open(P(role + ".crt"), "w") as f:
        f.write(body)
    print("Got", role, "certificate", flush=True)

# --- 4. Package as PKCS#12 with fresh passwords stored in 0600 files ----------
for role in ("author", "distributor"):
    pw_file = P(role + ".password")
    with open(os.open(pw_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        f.write(secrets.token_urlsafe(24))
    run("openssl", "pkcs12", "-export", "-legacy", "-out", P(role + ".p12"),
        "-inkey", P(role + ".pri"), "-in", P(role + ".crt"),
        "-certfile", os.path.join(ca_dir, role + "-ca.pem"),
        "-name", role + "cert", "-passout", "file:" + pw_file)
    os.chmod(P(role + ".p12"), 0o600)
print("Done:", out_dir)
