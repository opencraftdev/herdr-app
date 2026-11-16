// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "pane" } } } }
// Shows the agent's name or the terminal's title, the folder (in the accent
// while the pane is focused), and the agent's status; buttons split, zoom and
// close this pane. Props from the app: { pane, terminal }. Click: focus the pane.
//
// Chat | Terminal: an agent pane can show its conversation (the `ovis-chat` mod)
// in place of its terminal, read from an Ovis server on herdr-core
// (shared("ovis.server"), default http://127.0.0.1:7318). The switch shows only
// while ovis-chat is installed and that server knows this pane.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, appHome, readTextFile, shared, checking } from "herdr";

const OVIS_DEFAULT = "http://127.0.0.1:7318";
const CHAT = "ovis-chat";

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// Working breathes, blocked asks, done is a dot; idle shows nothing.
function status(t, st) {
  if (st === "working") return div().size(8).flex_none().rounded(4).bg(t.working).loop("opacity", { from: 1, to: 0.5, period: 2000 });
  if (st === "blocked") return div().flex_none().text_size(13).font_bold().text_color(t.blocked).child("?");
  if (st === "done") return div().size(8).flex_none().rounded(4).bg(t.done);
  return null;
}

export function ovisServer() {
  return String(shared("ovis.server") || OVIS_DEFAULT).replace(/\/+$/, "");
}

// ponytail: one probe for every header copy, at most every 4 s (module scope is shared by copies).
let probe = { at: 0, server: "", answer: null };

/** Ovis's panes ({pane_id, terminal_id}) when ovis-chat is installed and the server answers, else null. */
async function ovisPanes(server) {
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

export default class Pane extends View {
  init(_props, cx) {
    this.hovered = false;
    this.chatPane = null; // the Ovis pane id, while the switch can show
    if (checking()) return;
    this.check(cx);
    cx.timer.every(5000, (cx) => this.check(cx));
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  check(cx) {
    const p = this.me();
    // only panes on this Mac: a remote pane (machine/…) is another core's; Ovis tells which hold an agent
    const local = p && p.terminal && !p.pane.includes("/");
    if (!local) {
      if (this.chatPane !== null) { this.chatPane = null; cx.notify(); }
      return;
    }
    cx.spawn(async (cx) => {
      const next = ovisPaneId(await ovisPanes(ovisServer()), p.pane, p.terminal);
      if (next !== this.chatPane) { this.chatPane = next; cx.notify(); }
    });
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .size(28)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(8)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  // Chat | Terminal as two icons beside split, zoom and close: chat shows the conversation, terminal goes
  // back. Shown while the chat can open (and always while it is open, so the way back stays).
  switcher(t, p) {
    const chat = p.view === CHAT;
    if (!chat && !this.chatPane) return null;
    const pane = p.pane;
    const toggle = (id, icon, active, tip, args) => div()
      .id(id)
      .size(28)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(8)
      .tooltip(tip)
      .when(active, (el) => el.bg(t.hover).text_color(t.foreground))
      .when(!active, (el) => el.text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        if (!active) run("pane.view", args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
    return h_flex()
      .flex_none()
      .gap(2)
      .child(toggle(`ph-chat-${pane}`, "chat", chat, "Chat", { pane, mod: CHAT, props: { server: ovisServer(), paneId: this.chatPane ?? pane } }))
      .child(toggle(`ph-term-${pane}`, "terminal", !chat, "Terminal", { pane }));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const mark = status(t, p.status);
    const pane = p.pane;
    const switcher = this.switcher(t, p);
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(8)
      .gap(4)
      .items_center()
      .bg(t.background)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .child(div().flex_none().truncate().max_w(260).text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(p.focused ? t.accent : t.dim).child(folder(p.cwd)))
      .when(Boolean(mark), el => el.child(h_flex().w(20).flex_none().justify_center().child(mark)))
      .when(Boolean(switcher), el => el.child(switcher))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
