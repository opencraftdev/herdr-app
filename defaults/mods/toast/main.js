// How notifications look. Anything can post one with notify({ title, body,
// level, icon, action }); replace this mod to restyle them all. Click to
// run its action (e.g. go to the agent) and dismiss it.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme } from "herdr";

// A black droplet in every theme, with its own light text and status colors.
const INK = { bg: "#000000", text: "#f5f5f7", dim: "#f5f5f79e", raised: "#ffffff1a" };
const DOT = { error: "#ff8a80", warning: "#e5b567", success: "#9fd47a" };

export default class Toast extends View {
  render(cx) {
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex()
      .id("toast")
      .size_full()
      .px(16)
      .gap(12)
      .items_center()
      .bg(INK.bg)
      .cursor_pointer()
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      // An agent's alert (it goes to the agent): blocked is an error, finished is info.
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(7).rounded(4).flex_none()
        .bg(p.action?.name === "agent.focus" && p.level === "info" ? DOT.success : DOT[p.level] ?? t.accent))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(div().truncate().font_semibold().text_size(13).text_color(INK.text).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(INK.dim).child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(INK.dim).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(6).bg(INK.raised)
              .text_size(12).text_color(INK.text).cursor_pointer().hover(s => s.opacity(0.8))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      )
      .child(div().id("toast-dismiss").flex_none().text_color(INK.dim).hover(s => s.text_color(INK.text))
        .on_click((_e, cx) => { cx.stop_propagation(); closeOverlay(p.overlay); })
        .child(svg("mods/pane/close.svg").size(14)));
  }
}
