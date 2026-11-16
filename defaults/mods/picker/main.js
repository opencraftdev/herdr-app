// Go to a tab. Drops from the Terminals layout's space chip (popup, at: "top"). Spaces with
// something that needs you come first, quiet spaces (no agent running)
// fold into "earlier". Type to filter, ↑/↓ and Enter to go, ctrl+d to close
// a tab, Esc to leave. Last rows: new work (a tab here, a space on this
// computer or on each connected machine).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, spaces, terminals, run, hc, theme, settings, props, closeOverlay, openOverlay, shared, setShared } from "herdr";

const MARK = { ansi6: "#81b0fa", ansi3: "#e5b567", ansi4: "#40c977", ansi5: "#ad7bf9", ansi2: "#fc8d8b", ansi1: "#9fb4c2" };
const BADGE = { blocked: "INPUT", working: "RUN", done: "DONE", idle: "READY" };
// The list's most height, px.
const LIST = 420;

// Space colors, kept by space id in shared "space.colors": a theme
// color name ("ansi6") or a picked #rrggbb. A space seen without one gets
// the theme color fewest spaces use, once; every mod does the same in the
// same order, so they agree, and adding or renaming spaces moves nothing.
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
function spaceColors() {
  const ids = new Set(spaces().map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PROJECT_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function spaceColor(t, p) {
  if (p.name === "~") return t.dim;
  const c = spaceColors()[p.id] ?? PROJECT_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

export default class Picker extends View {
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Go to a tab, space or agent…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = this.filter ? Math.max(0, this.rows().filter(r => r.kind !== "head").findIndex(r => r.kind === "ctx")) : 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.go(this.rows().filter(r => r.kind !== "head")[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.at = null;
    this.scroll = 0;
    this.showEarlier = false;
    this.machines = [];
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => m.state === "connected" && !m.temporary).map((m) => m.name);
      } catch {}
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  rows() {
    const f = this.filter.toLowerCase();
    const all = agents();
    const live = terminals().filter((x) => x.state === "live");
    const teamOf = (addrs) => {
      let n = 0;
      const walk = (a) => live.filter((x) => x.parent === a).forEach((k) => (n++, walk(k.address)));
      addrs.forEach(walk);
      return n;
    };
    const groups = spaces().map((w) => {
      const ctxs = w.tabs
        .map((ctx) => {
          const mine = all.filter((a) => a.tab === ctx.id);
          return { w, ctx, mine, team: teamOf(mine.map((a) => a.address)) };
        })
        .filter((c) => !f || [w.name, c.ctx.name, ...c.mine.map((a) => a.program?.name ?? "")].join(" ").toLowerCase().includes(f));
      return { w, ctxs };
    });
    const busy = groups.filter((p) => p.w.status && p.ctxs.length);
    const quiet = groups.filter((p) => !p.w.status && p.ctxs.length);
    busy.sort((a, b) => (b.w.status === "blocked") - (a.w.status === "blocked"));
    const out = [];
    const add = (p) => {
      out.push({ kind: "head", w: p.w, count: p.ctxs.length });
      for (const c of p.ctxs) out.push({ kind: "ctx", ...c });
    };
    busy.forEach(add);
    if (quiet.length) {
      out.push({ kind: "earlier", count: quiet.length });
      if (this.showEarlier || f) quiet.forEach(add);
    }
    out.push({ kind: "new" });
    out.push({ kind: "space", machine: null });
    for (const m of this.machines) out.push({ kind: "space", machine: m });
    return out;
  }

  go(r, cx) {
    if (!r) return;
    if (r.kind === "earlier") {
      this.at = this.rows().filter(r => r.kind !== "head").findIndex(r => r.kind === "earlier");
      this.showEarlier = !this.showEarlier;
      this.input.focus();
      cx.notify();
      return;
    }
    this.close();
    if (r.kind === "ctx") run("tab.select", { id: r.ctx.id });
    else if (r.kind === "new") run("tab.new");
    else if (r.kind === "space") run("space.new", { machine: r.machine ?? "" });
  }

  // A tab's state as a tinted caps badge; an unknown one is a dashed dash.
  badge(t, st) {
    const word = BADGE[st];
    const pill = h_flex().flex_none().h(20).px(6).rounded(6).items_center().text_size(11).font_semibold();
    if (!word) return pill.w(28).justify_center().border_1().border_color(t.input).text_color(t.dim).child("—");
    const color = st === "idle" ? t.dim : t[st];
    return pill.bg(st === "idle" ? t.hover : color + "24").text_color(color).child(word);
  }

  // The tab's first agent's mark on a raised tile, else a terminal glyph.
  tile(t, program) {
    const mark = !program?.icon ? svg("icons/shell.svg").size(14).text_color(t.dim)
      : program.tint ? svg(program.icon).size(16).text_color(t.foreground) : image(program.icon).size(16);
    return h_flex().size(28).flex_none().rounded(6).bg(t.raised).items_center().justify_center().child(mark);
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const pickable = rows.filter((r) => r.kind !== "head");
    // Opens on where you are.
    if (this.at === null) this.at = Math.max(0, pickable.findIndex((r) => r.kind === "ctx" && r.w.active && r.ctx.active));
    this.at = Math.min(this.at, pickable.length - 1);
    const sel = pickable[this.at];
    // One continuous strip: each row (and the group title before it) at a fixed
    // y. Scrolling moves the strip only as far as it takes to keep the selected
    // row in view, so the arrows can't run the selection off the list.
    const H = { head: 32, earlier: 35, new: 38, ctx: 52, space: 34 };
    const tops = [];
    let y = 0;
    rows.forEach((r) => { tops.push(y); y += H[r.kind] ?? 32; });
    const total = y;
    const height = Math.min(LIST, this.listHeight ?? LIST);
    const fixed = total > height;
    const maxScroll = Math.max(0, total - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const si = rows.indexOf(sel);
    if (si >= 0) {
      if (tops[si] < this.scroll) this.scroll = tops[si];
      if (tops[si] + (H[sel.kind] ?? 32) > this.scroll + height) this.scroll = tops[si] + (H[sel.kind] ?? 32) - height;
    }
    const place = (el, i) =>
      fixed
        ? el.absolute().left(0).right(0).top(tops[i] - this.scroll).bottom(height - (tops[i] + (H[rows[i].kind] ?? 32) - this.scroll))
        : el;
    const visible = (i) => !fixed || (tops[i] + (H[rows[i].kind] ?? 32) > this.scroll && tops[i] < this.scroll + height);

    const row = (r) => {
      if (r.kind === "head") {
        return h_flex()
          .px(12)
          .pt(12)
          .pb(4)
          .gap(8)
          .items_center()
          .text_size(11)
          .font_semibold()
          .text_color(t.dim)
          .child(svg("mods/workspace-chrome/folder.svg").size(14).flex_none().text_color(spaceColor(t, r.w)))
          .child(div().flex_1().truncate().child(r.w.name.toUpperCase()))
          .child(div().flex_none().child(String(r.count)));
      }
      if (r.kind === "earlier") {
        return h_flex()
          .id("pk-earlier")
          .mt(6)
          .px(10)
          .py(6)
          .border_t(1)
          .border_color(t.border)
          .text_size(12)
          .text_color(t.dim)
          .cursor_pointer()
          .when(r === sel, (el) => el.bg(t.hover).text_color(t.foreground))
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => this.go(r, cx))
          .child(`earlier: ${r.count} quiet space${r.count > 1 ? "s" : ""} ${this.showEarlier ? "▴" : "▾"}`);
      }
      const on = r === sel;
      if (r.kind === "new" || r.kind === "space") {
        const label = r.kind === "new" ? "new tab" : r.machine ? `new space on ${r.machine}` : "new space";
        return h_flex()
          .id(r.kind === "new" ? "pk-new" : `pk-space-${r.machine ?? "here"}`)
          .mx(4)
          .when(r.kind === "new", (el) => el.mt(4))
          .px(12)
          .h(34)
          .items_center()
          .rounded(8)
          .gap(12)
          .text_size(14)
          .text_color(t.muted)
          .cursor_pointer()
          .when(on, (el) => el.bg(t.hover).text_color(t.foreground))
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.go(r))
          .child(h_flex().w(28).flex_none().justify_center().child(svg("mods/workspace-chrome/plus.svg").size(16).text_color(t.dim)))
          .child(label[0].toUpperCase() + label.slice(1));
      }
      const who = r.mine.map((a) => a.program?.name ?? "agent").join(" · ");
      const here = r.w.active && r.ctx.active;
      return h_flex()
        .id(`pk-${r.ctx.id}`)
        .mx(4)
        .px(12)
        .h(52)
        .rounded(8)
        .gap(12)
        .items_center()
        .cursor_pointer()
        .when(on, (el) => el.bg(t.hover))
        .hover((s) => s.bg(t.hover))
        .on_click(() => this.go(r))
        .child(this.tile(t, r.mine[0]?.program))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().gap(8).items_center()
            .child(div().min_w(0).truncate().text_size(14).font_medium().text_color(t.foreground).child(r.ctx.name))
            .when(here, (el) => el.child(div().flex_none().text_size(11).font_semibold().text_color(t.accent).child("SELECTED"))))
          .child(div().truncate().text_size(13).text_color(t.dim).child([who || "terminal", r.w.name].join(" · ") + (r.team ? `  +${r.team}` : ""))))
        .child(this.badge(t, r.ctx.status));
    };

    return v_flex()
      .id("picker")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") this.at = (this.at + 1) % pickable.length;
        else if (k === "up") this.at = (this.at + pickable.length - 1) % pickable.length;
        else if (k === "d" && e.modifiers.control) {
          if (sel?.kind === "ctx") {
            this.close();
            run("tab.close", { id: sel.ctx.id });
          }
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().flex_none().p(12).gap(8).items_center().border_b(1).border_color(t.border)
        .child(h_flex().flex_1().h(34).px(12).gap(8).items_center().rounded(8).border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground)))
        .child(div().id("picker-esc").size(34).flex_none().flex().items_center().justify_center().rounded(8).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Close (Esc)").on_click(() => this.close())
          .child(svg("mods/workspace-chrome/x.svg").size(16))))
      .child(
        v_flex()
          .id("pk-list")
          .on_size_change((size, cx) => {
            this.listHeight = size.height / settings().zoom;
            cx.notify();
          })
          .h(Math.min(LIST, total))
          .min_h(0)
          .my(4)
          .when(fixed, (el) =>
            el.overflow_hidden().on_scroll_wheel((e, cx) => {
              this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
              // The selection follows the wheel, so the next frame doesn't scroll back to it.
              while (this.at < pickable.length - 1 && tops[rows.indexOf(pickable[this.at])] < this.scroll) this.at++;
              while (this.at > 0 && tops[rows.indexOf(pickable[this.at])] + (H[pickable[this.at].kind] ?? 32) > this.scroll + height) this.at--;
              cx.notify();
            }))
          .children(rows.map((r, i) => (visible(i) ? place(row(r), i) : null)).filter(Boolean)),
      )
      .child(this.footer(t));
  }

  // Where you are on the left, the keys on the right.
  footer(t) {
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((c) => c.active);
    const key = (k) => h_flex().h(18).min_w(18).px(4).flex_none().justify_center().items_center().rounded(6).border_1().border_color(t.input).text_size(11).child(k);
    const hint = (keys, label) => h_flex().gap(4).items_center().children([...keys.map(key), div().child(label)]);
    return h_flex().flex_none().px(12).py(8).gap(12).items_center().border_t(1).border_color(t.border).text_size(12).text_color(t.dim)
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(space ? `${space.name} › ${tab?.name ?? ""}` : ""))
      .child(hint(["↑", "↓"], "Move"))
      .child(hint(["↵"], "Go"))
      .child(hint(["Esc"], "Close"));
  }
}
