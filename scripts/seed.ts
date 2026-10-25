import { readState } from "../src/state";

readState()
  .then((state) => {
    console.log(`Focus Blocker state ready: ${state.rules.length} rule(s), blocking ${state.enabled ? "on" : "off"}.`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
