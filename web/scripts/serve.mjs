import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(webDirectory, "..");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  if (url.pathname === "/") {
    response.writeHead(302, { Location: "/web/" });
    response.end();
    return;
  }
  const decodedPath = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, "");
  let relativePath = decodedPath;
  if (decodedPath === "InternSpace" || decodedPath === "InternSpace/") {
    relativePath = "web/index.html";
  } else if (decodedPath.startsWith("InternSpace/")) {
    const pagesPath = decodedPath.slice("InternSpace/".length);
    relativePath = pagesPath.startsWith("data/") || pagesPath.startsWith("web/")
      ? pagesPath
      : join("web", pagesPath);
  }
  const requested = resolve(join(repositoryRoot, relativePath));
  if (!requested.startsWith(`${repositoryRoot}/`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  let filePath = requested;
  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
    if (!statSync(filePath).isFile()) throw new Error("not a file");
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const stream = createReadStream(filePath);
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
}).listen(port, host, () => {
  console.log(`InternSpace Feature Tree: http://${host}:${port}/web/`);
  console.log(`GitHub Pages smoke: http://${host}:${port}/InternSpace/`);
});
