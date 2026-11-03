#!/usr/bin/env python3
"""Loopback-only static course preview. No account/API service; Python stdlib only."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class StaticHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        requested = Path(self.translate_path(self.path)).resolve()
        if not requested.is_relative_to(Path(self.directory).resolve()):
            self.send_error(403, "Path outside static site")
            return None
        if requested.is_dir():
            for filename in ("index.html", "index.htm"):
                index = requested / filename
                if index.exists() and not index.resolve().is_relative_to(Path(self.directory).resolve()):
                    self.send_error(403, "Index outside static site")
                    return None
        # Reproducible archives normalize mtimes. Different releases can therefore
        # share Last-Modified; never allow stale conditional 304s for the app/SW.
        for name in ("If-Modified-Since", "If-None-Match"):
            if name in self.headers:
                del self.headers[name]
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Directory listing disabled")
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--directory", default=str(Path(__file__).resolve().parent / "site"))
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535")
    site = Path(args.directory).absolute()
    if (site / "index.html").is_symlink() or not (site / "index.html").is_file():
        parser.error("Directory must contain the extracted static site's index.html")
    with ThreadingHTTPServer(("127.0.0.1", args.port), partial(StaticHandler, directory=str(site))) as server:
        print(f"Local course: http://127.0.0.1:{server.server_port}/ (Ctrl+C to stop)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
