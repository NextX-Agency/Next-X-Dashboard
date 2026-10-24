"""Tiny local HTTP server for deploy/vps/tests/run-tests.sh. Test fixture only.

Usage: python mock_server.py <port> <state_dir> <expected_bearer>
  GET  /health            body from <state_dir>/health.json, status code from <state_dir>/health.code
  GET  /api/cron/<job>    200 {"ok":true} only with 'Authorization: Bearer <expected_bearer>', else 401
  POST /alert             appends the request body to <state_dir>/alerts.log, 200
"""
import http.server
import os
import sys

PORT = int(sys.argv[1])
STATE = sys.argv[2]
BEARER = sys.argv[3]


class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            code = int(open(os.path.join(STATE, "health.code")).read().strip() or 200)
            self._send(code, open(os.path.join(STATE, "health.json")).read())
        elif self.path.startswith("/api/cron/"):
            if self.headers.get("Authorization") == "Bearer " + BEARER:
                self._send(200, '{"ok":true,"job":"%s"}' % self.path.rsplit("/", 1)[1])
            else:
                self._send(401, '{"error":"Unauthorized"}')
        else:
            self._send(404, "{}")

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode(errors="replace")
        with open(os.path.join(STATE, "alerts.log"), "a") as fh:
            fh.write(self.path + " | " + body + "\n")
        self._send(200, "{}")

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
