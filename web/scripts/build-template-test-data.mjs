import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(webDirectory, "..");
const sourcePath = resolve(process.argv[2] ?? resolve(repositoryRoot, "../outputs/template-test-data.json"));
const outputPath = resolve(process.argv[3] ?? resolve(repositoryRoot, "data/template-test-data.json"));
const credentialKey = /(access.?token|auth|credential|key|secret|signature)/i;
const webUrl = /https?:\/\/[^\s<>"')\]]+/g;

function sanitizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    let changed = false;

    if (url.username || url.password) {
      url.username = "";
      url.password = "";
      changed = true;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (credentialKey.test(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }

    return changed ? url.href : rawUrl;
  } catch {
    return rawUrl;
  }
}

function sanitize(value) {
  if (typeof value === "string") {
    return value.replace(webUrl, sanitizeUrl);
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitize(child)]));
  }
  return value;
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const sanitized = sanitize(source);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");

console.log(
  `WROTE: ${outputPath} (${sanitized.issues?.length ?? 0} issues, ${sanitized.pullRequests?.length ?? 0} pull requests)`,
);
