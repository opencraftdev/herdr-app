// Chat | Terminal beside the tab bar's + button: the open tab's focused pane can show its
// conversation (the `ovis-chat` mod) in place of its terminal, read from an Ovis server on
// herdr-core: on this computer shared("ovis.server") (default http://127.0.0.1:7318), on another
// machine its own Ovis, shared("ovis.servers")[machine] (none set: no icons there). The icons show
// while ovis-chat is installed and that Ovis sees an agent in the pane (and always while the chat
// is shown, so the way back stays).

import { appHome, readTextFile, shared } from "herdr";

export const CHAT = "ovis-chat";
const OVIS_DEFAULT = "http://127.0.0.1:7318";

/** The Ovis for a machine ("" = this computer), or null when that machine has none set. */
export function ovisServer(machine = "") {
  const url = machine ? shared("ovis.servers")?.[machine] : shared("ovis.server") || OVIS_DEFAULT;
  return url ? String(url).replace(/\/+$/, "") : null;
}

/** An app id split at its machine: "m/p1" is {machine: "m", id: "p1"}; this computer's is machine "". */
export function onMachine(id) {
  const at = String(id ?? "").indexOf("/");
  return at < 0 ? { machine: "", id } : { machine: id.slice(0, at), id: id.slice(at + 1) };
}

// ponytail: one probe per server at most every 4 s.
const probes = new Map();

/** Ovis's panes ({pane_id, terminal_id, agent}) when ovis-chat is installed and the server answers, else null. */
export async function ovisPanes(server) {
  if (!server) return null;
  const hit = probes.get(server);
  if (hit && Date.now() - hit.at < 4000) return hit.answer;
  const probe = {
    at: Date.now(),
    answer: (async () => {
      if ((await readTextFile(`${appHome()}/mods/${CHAT}/mod.json`).catch(() => null)) === null) return null;
      try {
        const response = await fetch(`${server}/api/session`);
        if (response.status !== 200) return null;
        return (await response.json())?.snapshot?.panes ?? null;
      } catch {
        return null;
      }
    })(),
  };
  probes.set(server, probe);
  return probe.answer;
}

/**
 * The Ovis pane for a herdr-app pane, when Ovis sees an agent in it: on herdr-core its pane_id is the
 * layout node id (without the app's machine/ prefix: that Ovis runs on the machine); a terminal no tab
 * places goes by terminal. Ovis decides what is an agent (from the
 * pane's processes): an agent that reports no status to herdr (Claude Code without its hook) still counts.
 */
export function ovisPaneId(ovis, appPane, appTerminal) {
  const pane = onMachine(appPane).id, terminal = appTerminal && onMachine(appTerminal).id;
  const found = ovis?.find((o) => o.pane_id === pane) ?? ovis?.find((o) => terminal && o.terminal_id === terminal);
  return found?.agent ? found.pane_id : null;
}

/** The pane the icons act on: the open tab's focused pane, else its first, when it holds a terminal. */
export function chatTarget(all, tab) {
  const inTab = (all ?? []).filter((p) => p.tab === tab);
  const p = inTab.find((x) => x.focused) ?? inTab[0];
  return p && p.terminal ? p : null;
}
