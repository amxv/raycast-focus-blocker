import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import defaultState from "../defaults/state.json";
import { patternToRegex } from "./patterns";

export type BlockRule = { id: string; pattern: string; regex: string; enabled: boolean };
export type BlockState = { version: 1; revision: number; enabled: boolean; rules: BlockRule[] };

export const STATE_DIR = process.env.FOCUS_BLOCKER_HOME || path.join(homedir(), ".config", "focus-blocker");
export const STATE_FILE = path.join(STATE_DIR, "state.json");
export const BRIDGE_URL = "http://127.0.0.1:47846";

// Both the release installer and Raycast start with the same empty blocklist.
const initialState = defaultState as BlockState;

export async function readState(): Promise<BlockState> {
  try {
    const json: unknown = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    if (!isState(json)) throw new Error("Your blocklist is invalid; it was not overwritten.");
    return json;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
    try {
      await fs.writeFile(STATE_FILE, JSON.stringify(initialState, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      return structuredClone(initialState);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "EEXIST") return readState();
      throw cause;
    }
  }
}

function isState(value: unknown): value is BlockState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BlockState>;
  return (
    item.version === 1 &&
    Number.isSafeInteger(item.revision) &&
    typeof item.enabled === "boolean" &&
    Array.isArray(item.rules) &&
    item.rules.every(
      (rule) =>
        rule &&
        typeof rule.id === "string" &&
        typeof rule.pattern === "string" &&
        typeof rule.regex === "string" &&
        rule.regex === patternToRegex(rule.pattern) &&
        typeof rule.enabled === "boolean",
    )
  );
}

export async function saveState(next: BlockState): Promise<BlockState> {
  const previous = await readState();
  const value: BlockState = { ...next, version: 1, revision: previous.revision + 1 };
  const temp = `${STATE_FILE}.${randomUUID()}.tmp`;
  await fs.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    await fs.rename(temp, STATE_FILE);
  } finally {
    await fs.rm(temp, { force: true });
  }
  // Only signals the already-running local bridge; state remains usable when
  // the bridge or browser is closed. Browsers additionally poll on startup.
  try {
    await fetch(`${BRIDGE_URL}/changed`, { method: "POST", signal: AbortSignal.timeout(350) });
  } catch {
    // LaunchAgent may be stopped; the next browser sync reads the file.
  }
  return value;
}
