import assert from "node:assert/strict";
import { test } from "node:test";
import defaultState from "../defaults/state.json";

test("new installations do not block any sites until the user adds a rule", () => {
  assert.equal(defaultState.version, 1);
  assert.equal(defaultState.enabled, true);
  assert.deepEqual(defaultState.rules, []);
});
