import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Form,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { randomUUID } from "node:crypto";
import { useCallback, useEffect, useState } from "react";
import { patternToRegex, readableLabel } from "./patterns";
import { BlockRule, BlockState, readState, saveState } from "./state";

type SiteFormValues = { pattern: string };

function SiteForm({ site, onSave }: { site?: BlockRule; onSave: (site: BlockRule) => Promise<void> }) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string>();

  async function submit({ pattern }: SiteFormValues) {
    try {
      const trimmed = pattern.trim();
      const regex = patternToRegex(trimmed);
      await onSave({ id: site?.id ?? randomUUID(), pattern: trimmed, regex, enabled: site?.enabled ?? true });
      await showToast({ style: Toast.Style.Success, title: site ? "Website updated" : "Website added" });
      pop();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <Form
      navigationTitle={site ? "Edit Blocked Website" : "Add Blocked Website"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={site ? "Save Website" : "Block Website"} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Block an entire site (reddit.com) or just a URL path (https://www.youtube.com/shorts/*). An * in a path matches any characters." />
      <Form.TextField
        id="pattern"
        title="Website or URL"
        placeholder="reddit.com or https://www.youtube.com/shorts/*"
        defaultValue={site?.pattern}
        error={error}
        onChange={() => setError(undefined)}
        autoFocus
      />
      <Form.Description text="Website-only entries cover subdomains. URL paths match the specified host, keeping other pages on the site available." />
    </Form>
  );
}

export default function ManageBlockedWebsites() {
  const [state, setState] = useState<BlockState>();
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setState(await readState());
    } catch (cause) {
      await showToast({ style: Toast.Style.Failure, title: "Could not load blocklist", message: String(cause) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(async (mutate: (current: BlockState) => BlockState) => {
    try {
      const newState = await saveState(mutate(await readState()));
      setState(newState);
    } catch (cause) {
      await showToast({ style: Toast.Style.Failure, title: "Could not save blocklist", message: String(cause) });
      throw cause;
    }
  }, []);

  async function saveSite(site: BlockRule) {
    if (
      state?.rules.some((other) => other.id !== site.id && other.pattern.toLowerCase() === site.pattern.toLowerCase())
    ) {
      throw new Error("This website is already on your blocklist.");
    }
    await update((current) => ({
      ...current,
      rules: current.rules.some((item) => item.id === site.id)
        ? current.rules.map((item) => (item.id === site.id ? site : item))
        : [...current.rules, site],
    }));
  }

  async function deleteSite(site: BlockRule) {
    const approved = await confirmAlert({
      title: `Remove ${readableLabel(site.pattern)}?`,
      message: "This website will no longer be blocked.",
      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
    });
    if (approved) {
      await update((current) => ({ ...current, rules: current.rules.filter((item) => item.id !== site.id) }));
    }
  }

  const active = state?.rules.filter((rule) => rule.enabled).length ?? 0;

  return (
    <List isLoading={loading} searchBarPlaceholder="Find a blocked website...">
      {state && (
        <>
          <List.Section title="Focus Mode">
            <List.Item
              icon={{
                source: state.enabled ? Icon.Shield : Icon.Circle,
                tintColor: state.enabled ? Color.Green : Color.SecondaryText,
              }}
              title={state.enabled ? "Blocking is ON" : "Blocking is OFF"}
              subtitle={state.enabled ? `${active} website rules active` : "All websites temporarily allowed"}
              keywords={["enable", "disable", "toggle", "focus"]}
              actions={
                <ActionPanel>
                  <Action
                    icon={state.enabled ? Icon.Pause : Icon.Play}
                    title={state.enabled ? "Turn Blocking off" : "Turn Blocking on"}
                    onAction={() => void update((current) => ({ ...current, enabled: !current.enabled }))}
                  />
                  <Action.Push
                    title="Add Website"
                    icon={Icon.Plus}
                    target={<SiteForm onSave={saveSite} />}
                    shortcut={Keyboard.Shortcut.Common.New}
                  />
                </ActionPanel>
              }
            />
          </List.Section>
          <List.Section title="Blocked Websites" subtitle={`${state.rules.length} rules`}>
            {state.rules.map((site) => (
              <List.Item
                key={site.id}
                title={readableLabel(site.pattern)}
                subtitle={site.pattern}
                icon={{
                  source: site.enabled ? Icon.CheckCircle : Icon.Circle,
                  tintColor: site.enabled ? Color.Green : Color.SecondaryText,
                }}
                accessories={[{ text: site.enabled ? "Blocked" : "Paused" }]}
                actions={
                  <ActionPanel>
                    <Action
                      title={site.enabled ? "Allow This Website" : "Block This Website"}
                      icon={site.enabled ? Icon.Eye : Icon.Shield}
                      onAction={() =>
                        void update((current) => ({
                          ...current,
                          rules: current.rules.map((item) =>
                            item.id === site.id ? { ...item, enabled: !item.enabled } : item,
                          ),
                        }))
                      }
                    />
                    <Action.Push
                      title="Add Website"
                      icon={Icon.Plus}
                      target={<SiteForm onSave={saveSite} />}
                      shortcut={Keyboard.Shortcut.Common.New}
                    />
                    <Action.Push
                      title="Edit Website"
                      icon={Icon.Pencil}
                      target={<SiteForm site={site} onSave={saveSite} />}
                      shortcut={Keyboard.Shortcut.Common.Edit}
                    />
                    <Action.CopyToClipboard title="Copy Website Pattern" content={site.pattern} />
                    <Action
                      title="Remove Website"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      onAction={() => void deleteSite(site)}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    />
                  </ActionPanel>
                }
              />
            ))}
            {state.rules.length === 0 && (
              <List.Item
                title="Nothing blocked yet"
                subtitle="Add a website to get started"
                icon={Icon.Plus}
                actions={
                  <ActionPanel>
                    <Action.Push title="Add Website" target={<SiteForm onSave={saveSite} />} />
                  </ActionPanel>
                }
              />
            )}
          </List.Section>
        </>
      )}
    </List>
  );
}
