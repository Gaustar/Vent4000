import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "./config.js";

// Sans ce lien, une publication qui oublie de renommer le cache laisse les téléphones sur l'ancien code.
test("le cache du service worker et package.json portent la version de l'app", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes(`"vent4000-v${VERSION}"`));
  assert.equal(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version, VERSION);
});
