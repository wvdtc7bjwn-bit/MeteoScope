import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const DATABASE_NAME = "meteoscope-notifications";
const RECORD_PREFIX = "early-access-active-fault:";
const CHUNK_SIZE = 48_000;
const sourcePath = resolve(process.argv[2] ?? "");
const remote = process.argv.includes("--remote");

if (!process.argv[2]) {
  console.error("Usage: node scripts/upload-protected-gsj-active-fault.mjs <geojson-path> [--remote]");
  process.exit(1);
}

const source = await readFile(sourcePath);
const parsed = JSON.parse(source.toString("utf8"));
if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
  throw new Error("Input must be a GeoJSON FeatureCollection.");
}

const gzip = gzipSync(source, { level: 9 });
const encoded = gzip.toString("base64");
const chunks = Array.from(
  { length: Math.ceil(encoded.length / CHUNK_SIZE) },
  (_, index) => encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
);
const manifest = {
  encoding: "gzip-base64",
  chunkCount: chunks.length,
  featureCount: parsed.features.length,
  rawBytes: source.length,
  gzipBytes: gzip.length,
  sha256: createHash("sha256").update(source).digest("hex"),
  source: "産総研 地質調査総合センター 活断層データベース",
  updatedAt: new Date().toISOString()
};

const statements = [
  `DELETE FROM app_records WHERE key LIKE '${RECORD_PREFIX.replaceAll("'", "''")}%';`,
  ...chunks.map((chunk, index) => buildUpsert(
    `${RECORD_PREFIX}chunk:${String(index).padStart(4, "0")}`,
    JSON.stringify(chunk)
  )),
  buildUpsert(`${RECORD_PREFIX}manifest`, JSON.stringify(manifest))
];

const temporaryFile = join(tmpdir(), `meteoscope-gsj-active-fault-${process.pid}.sql`);
try {
  await writeFile(temporaryFile, `${statements.join("\n")}\n`, "utf8");
  runWrangler(temporaryFile);
} finally {
  await rm(temporaryFile, { force: true });
}

console.log(JSON.stringify(manifest, null, 2));

function buildUpsert(key, value) {
  return `INSERT INTO app_records (key, value, updated_at)
VALUES ('${escapeSql(key)}', '${escapeSql(value)}', '${new Date().toISOString()}')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`;
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function runWrangler(file) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "wrangler",
    "d1",
    "execute",
    DATABASE_NAME,
    ...(remote ? ["--remote"] : ["--local"]),
    "--file",
    file
  ];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    throw new Error(
      `Wrangler failed while uploading the protected dataset (${result.status ?? "unknown"}): ${result.error?.message ?? "no detail"}`
    );
  }
}
