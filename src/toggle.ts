import { showHUD } from "@raycast/api";
import { readState, saveState } from "./state";

export default async function ToggleWebsiteBlocking() {
  try {
    const current = await readState();
    const next = await saveState({ ...current, enabled: !current.enabled });
    await showHUD(next.enabled ? "🛡 Website blocking ON" : "🔓 Website blocking OFF");
  } catch (error) {
    await showHUD(`⚠️ Could not toggle blocking: ${String(error)}`);
  }
}
