#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(webDirectory, "..");
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

export function sanitizeDocument(value) {
  if (typeof value === "string") {
    return value.replace(webUrl, sanitizeUrl);
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(item && typeof item === "object" && item.key === "proposalType"))
      .map(sanitizeDocument);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "proposalType")
        .map(([key, child]) => [key, sanitizeDocument(child)]),
    );
  }
  return value;
}

export async function buildTemplateTestData(sourcePath, outputPath) {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const sanitized = sanitizeDocument(source);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  return sanitized;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const sourcePath = resolve(process.argv[2] ?? resolve(repositoryRoot, "../outputs/template-test-data.json"));
  const outputPath = resolve(process.argv[3] ?? resolve(repositoryRoot, "data/template-test-data.json"));
  const sanitized = await buildTemplateTestData(sourcePath, outputPath);

  console.log(
    `WROTE: ${outputPath} (${sanitized.issues?.length ?? 0} issues, ${sanitized.pullRequests?.length ?? 0} pull requests)`,
  );
}
