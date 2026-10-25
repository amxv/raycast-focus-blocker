#!/usr/bin/env node
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const browser = JSON.parse(read("browser-extension/manifest.json"));
const cargo = /^version\s*=\s*"([^"]+)"/m.exec(read("bridge/Cargo.toml"));
const versions = {
  raycast: pkg.version,
  lockfile: lock.packages[""].version,
  browser: browser.version,
  rust: cargo?.[1],
};

for (const [component, version] of Object.entries(versions)) {
  if (version !== pkg.version) {
    console.error(`Version mismatch: ${component}=${version}, expected ${pkg.version}`);
    process.exitCode = 1;
  }
}

const requestedTag = process.argv[2];
if (requestedTag && requestedTag !== `v${pkg.version}`) {
  console.error(`Release tag ${requestedTag} must match v${pkg.version}`);
  process.exitCode = 1;
}

if (!process.exitCode) console.log(`All versions agree: ${pkg.version}`);
