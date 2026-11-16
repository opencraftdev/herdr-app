import { beforeEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

// The shipped pane header's Chat | Terminal switch, without a window, a core or an Ovis.
class Element {
  nodes: Element[] = [];
  calls: Record<string, unknown[]> = {};
  constructor() {
    const proxy: Element = new Proxy(this, {
      get: (target, key: string) => key in target ? Reflect.get(target, key) : (...args: unknown[]) => {
        if (key === "child") target.nodes.push(args[0] as Element);
        else if (key === "when") { if (args[0]) (args[1] as (el: Element) => void)(proxy); }
        else target.calls[key] = args;
        return proxy;
      },
    });
    return proxy;
  }
}
const source = await readFile(new URL("../defaults/mods/pane/main.js", import.meta.url), "utf8");
const element = () => new Element();
const ran: [string, unknown][] = [];
let pane: Record<string, unknown> = {};
let server: unknown = null;
const values: Record<string, unknown> = {
  View: class {}, div: element, svg: element, h_flex: element,
  panes: () => [pane], props: () => ({ pane: "p1", terminal: "t1" }), run(command: string, args: unknown) { ran.push([command, args]); },
  theme: () => ({}), home: () => "/home/me", appHome: () => "/home/me/.config/herdr-app",
  readTextFile: async () => "{}", shared: () => server, checking: () => true,
};
const { Pane, ovisPaneId } = new Function(...Object.keys(values), source
  .replace(/^import .*;\n/gm, "")
  .replace(/^export (?=function)/gm, "")
  .replace("export default class Pane", "const Pane = class Pane") + "\nreturn { Pane, ovisPaneId };")(...Object.values(values));

/** Every element under `root` whose `id` call starts with `prefix`. */
function find(root: Element, prefix: string): Element[] {
  if (!(root instanceof Element)) return []; // a text child
  const own = String(root.calls.id?.[0] ?? "").startsWith(prefix) ? [root] : [];
  return [...own, ...root.nodes.flatMap((node) => find(node, prefix))];
}
const click = (el: Element) => (el.calls.on_click![0] as (e: unknown, cx: unknown) => void)({}, { stop_propagation() {} });

beforeEach(() => {
  ran.length = 0;
  server = null;
  pane = { pane: "p1", terminal: "t1", tab: "tb1", cwd: "/home/me/app", status: "idle", program: { agent: true, name: "Claude Code" }, view: null };
});

test("the Ovis pane is the herdr-app pane (its layout node id), else the one showing that terminal", () => {
  const ovis = [{ pane_id: "p1", terminal_id: "t1" }, { pane_id: "hc:loose:t9", terminal_id: "t9" }];
  expect(ovisPaneId(ovis, "p1", "t1")).toBe("p1");
  expect(ovisPaneId(ovis, "p7", "t9")).toBe("hc:loose:t9");
  expect(ovisPaneId(ovis, "p7", "t8")).toBeNull();
  expect(ovisPaneId(null, "p1", "t1")).toBeNull();
});

test("no switch until the Ovis server knows the pane", () => {
  const view = new Pane();
  view.init();
  expect(find(view.render(), "ph-chat-")).toEqual([]);
});

test("Chat shows ovis-chat in place of the terminal, Terminal goes back", () => {
  const view = new Pane();
  view.init();
  view.chatPane = "p1";
  server = "http://127.0.0.1:7400/";
  click(find(view.render(), "ph-chat-")[0]!);
  expect(ran).toEqual([["pane.view", { pane: "p1", mod: "ovis-chat", props: { server: "http://127.0.0.1:7400", paneId: "p1" } }]]);

  ran.length = 0;
  pane.view = "ovis-chat";
  const shown = view.render();
  click(find(shown, "ph-chat-")[0]!); // already shown: nothing
  click(find(shown, "ph-term-")[0]!);
  expect(ran).toEqual([["pane.view", { pane: "p1" }]]);
});

test("while the chat is shown the way back stays, even if the server stopped answering", () => {
  const view = new Pane();
  view.init();
  pane.view = "ovis-chat";
  expect(find(view.render(), "ph-term-")).toHaveLength(1);
});

test("the default server is the Ovis on herdr-core, port 7318", () => {
  const view = new Pane();
  view.init();
  view.chatPane = "p1";
  click(find(view.render(), "ph-chat-")[0]!);
  expect((ran[0]![1] as { props: { server: string } }).props.server).toBe("http://127.0.0.1:7318");
});
