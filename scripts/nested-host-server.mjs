#!/usr/bin/env node
/**
 * Nested base-path host (GAME-385 / ML-HOST).
 *
 * Serves the production build beneath the exact games-site asset prefix:
 *
 *   /game-assets/motion-lab/<version>/
 *
 * This is how the repository proves it does not depend on domain-root deployment, which is
 * the static-web release contract in games-site `docs/game-release-contract.md` and the
 * Motion Lab RELEASE contract. It deliberately refuses to serve the app at `/`, so a
 * root-relative asset assumption fails here instead of failing in production.
 *
 * Assets are gzipped the way a production static host sends them. That is not decoration:
 * the ML-02 Lighthouse capture measured LCP 9061 ms raw against 1402 ms gzipped for the same
 * build, so serving raw here would turn a base-path test into a test of uncompressed
 * transfer.
 *
 * Usage:  npm run build && npm run serve:nested-host
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { ROOT, assetPrefix, entryFile, releaseVersion } from "./lib/host-identity.mjs";

const DIST = join(ROOT, "dist");
const PREFIX = assetPrefix();
const VERSION = releaseVersion();
const ENTRY = entryFile();
const PORT = Number(process.env.MOTION_LAB_HOST_PORT ?? 4185);

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"],
]);

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".map"]);

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);

  if (pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      `<!doctype html><html lang="en"><body><p>Nested host is running. The game lives at ` +
        `<a href="${PREFIX}/${ENTRY}">${PREFIX}/${ENTRY}</a>.</p></body></html>`
    );
    return;
  }

  if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(
      `404: this host serves the build only beneath ${PREFIX}/. A request for ${pathname} ` +
        `means the build assumed domain-root deployment.`
    );
    return;
  }

  const remainder = pathname.slice(PREFIX.length).replace(/^\/+/, "");
  const candidate = resolve(join(DIST, remainder || ENTRY));

  // Refuse to escape the artifact directory.
  if (!candidate.startsWith(DIST)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("403: path traversal rejected.");
    return;
  }

  // A path that does not resolve to a real file is served the entry document, which is what a
  // static host does for a directory-style build. Assets, by contrast, must exist: silently
  // answering a missing script with HTML is how a broken asset path survives a test.
  const isDocumentRequest = remainder === "" || extname(remainder) === "";
  const filePath =
    existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : isDocumentRequest
        ? join(DIST, ENTRY)
        : undefined;

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(
      `404: ${remainder || ENTRY} is missing from the artifact. Run \`npm run build\`.`
    );
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const headers = {
    "content-type": CONTENT_TYPES.get(extension) ?? "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    vary: "accept-encoding",
  };

  const acceptsGzip = /gzip/.test(request.headers["accept-encoding"] ?? "");
  if (acceptsGzip && COMPRESSIBLE.has(extension)) {
    headers["content-encoding"] = "gzip";
    const body = gzipSync(readFileSync(filePath), { level: 9 });
    response.writeHead(200, headers);
    response.end(body);
    return;
  }

  response.writeHead(200, headers);
  createReadStream(filePath).pipe(response);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`motion-lab nested host serving dist/ at http://127.0.0.1:${PORT}${PREFIX}/`);
  console.log(`  version: ${VERSION}`);
});
