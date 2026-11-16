// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "pane" } } } }
// Shows the agent's name or the terminal's title, the folder (in the accent
// while the pane is focused), and the agent's status; buttons split, zoom and
// close this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home } from "herdr";

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

export default class Pane extends View {
  init() {
    this.hovered = false;
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
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

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const mark = status(t, p.status);
    const pane = p.pane;
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
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
