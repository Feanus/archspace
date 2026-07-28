#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const snapshotPath = resolve(process.argv[2] || "data/template-test-data.json");
const expectedRepository = String(process.argv[3] || "RmZeta2718/arch-test").replace(/\/+$/, "");
const maximumAgeMilliseconds = 15 * 60 * 1000;
const futureToleranceMilliseconds = 5 * 60 * 1000;

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const actualRepository = String(snapshot.source?.repo || "").replace(/\/+$/, "");
if (actualRepository !== expectedRepository) {
  throw new Error(
    `Unexpected refreshed snapshot source: ${snapshot.source?.repo || "(missing)"}`,
  );
}

const fetchedAt = Date.parse(snapshot.source?.fetchedAt || "");
const age = Date.now() - fetchedAt;
if (!Number.isFinite(fetchedAt)
  || age > maximumAgeMilliseconds
  || age < -futureToleranceMilliseconds) {
  throw new Error(`Refreshed snapshot timestamp is stale or invalid: ${snapshot.source?.fetchedAt}`);
}

if (!Array.isArray(snapshot.issues) || !Array.isArray(snapshot.pullRequests)) {
  throw new Error("Refreshed snapshot must contain Issue and Pull Request arrays");
}

console.log(
  `SNAPSHOT_OK ${actualRepository} `
  + `(${snapshot.issues.length} issues, ${snapshot.pullRequests.length} pull requests)`,
);
