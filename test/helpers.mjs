// Shared test utilities: corpus + golden loading.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Load every corpus case. Committed cases live in test/corpus; cases derived
 * from professor materials live in the gitignored test/corpus-local and are
 * included automatically when present (local runs) and absent in CI.
 */
export function loadCorpusCases({ includeLocal = true } = {}) {
  const cases = [];
  const dirs = [join(TEST_DIR, "corpus")];
  if (includeLocal) dirs.push(join(TEST_DIR, "corpus-local"));

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json") || file.startsWith("python-golden")) continue;
      const data = loadJson(join(dir, file));
      for (const c of data.cases) cases.push(c);
    }
  }
  return cases;
}

