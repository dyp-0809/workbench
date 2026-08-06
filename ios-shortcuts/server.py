#!/usr/bin/env python3
"""Serve the H5 application over the local Tailscale interface."""

from __future__ import annotations

import os
import shutil
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "h5"
PORT = int(os.environ.get("SHORTCUT_PORT", "8765"))


def tailscale_ip() -> str:
    configured = os.environ.get("SHORTCUT_HOST")
    if configured:
        return configured
    tailscale = shutil.which("tailscale")
    if tailscale:
        result = subprocess.run([tailscale, "ip", "-4"], check=False, capture_output=True, text=True)
        address = result.stdout.strip().splitlines()
        if address:
            return address[0]
    return "127.0.0.1"


class H5Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    host = tailscale_ip()
    handler = partial(H5Handler, directory=str(ROOT))
    server = ThreadingHTTPServer((host, PORT), handler)
    print(f"Serving {ROOT}")
    print(f"iPhone URL: http://{host}:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping")
    finally:
        server.server_close()
