// Chat | Terminal beside the tab bar's + button: the open tab's focused pane can show its
// conversation (the `ovis-chat` mod) in place of its terminal, read from an Ovis server on
// herdr-core (shared("ovis.server"), default http://127.0.0.1:7318). The icons show while
// ovis-chat is installed and that Ovis sees an agent in the pane (and always while the chat
// is shown, so the way back stays).

import { appHome, readTextFile, shared } from "herdr";

export const CHAT = "ovis-chat";
const OVIS_DEFAULT = "http://127.0.0.1:7318";

export function ovisServer() {
  return String(shared("ovis.server") || OVIS_DEFAULT).replace(/\/+$/, "");
}

// ponytail: one probe at most every 4 s.
let probe = { at: 0, server: "", answer: null };

/** Ovis's panes ({pane_id, terminal_id, agent}) when ovis-chat is installed and the server answers, else null. */
export async function ovisPanes(server) {
  if (probe.server === server && Date.now() - probe.at < 4000) return probe.answer;
  probe = {
    at: Date.now(),
    server,
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
  return probe.answer;
}

/**
 * The Ovis pane for a herdr-app pane, when Ovis sees an agent in it: on herdr-core its pane_id is the
 * layout node id; a terminal no tab places goes by terminal. Ovis decides what is an agent (from the
 * pane's processes): an agent that reports no status to herdr (Claude Code without its hook) still counts.
 */
export function ovisPaneId(ovis, pane, terminal) {
  const found = ovis?.find((o) => o.pane_id === pane) ?? ovis?.find((o) => terminal && o.terminal_id === terminal);
  return found?.agent ? found.pane_id : null;
}

/** The pane the icons act on: the open tab's focused pane, else its first; only a terminal pane on this Mac (machine/… is another core's). */
export function chatTarget(all, tab) {
  const inTab = (all ?? []).filter((p) => p.tab === tab);
  const p = inTab.find((x) => x.focused) ?? inTab[0];
  return p && p.terminal && !p.pane.includes("/") ? p : null;
}
