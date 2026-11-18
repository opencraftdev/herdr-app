import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

// The tab bar's Chat | Terminal icons (defaults/mods/tabs/chat.js + main.js), without a window, a core or an Ovis.
class Element {
  nodes: Element[] = [];
  calls: Record<string, unknown[]> = {};
  constructor() {
    const proxy: Element = new Proxy(this, {
      get: (target, key: string) => key in target ? Reflect.get(target, key) : (...args: unknown[]) => {
        if (key === "child") target.nodes.push(args[0] as Element);
        else if (key === "children") target.nodes.push(...(args[0] as Element[]));
        else if (key === "when") { if (args[0]) (args[1] as (el: Element) => void)(proxy); }
        else target.calls[key] = args;
        return proxy;
      },
    });
    return proxy;
  }
}
const strip = (src: string) => src.replace(/^import .*;\n/gm, "").replace(/^export (?=(function|async function|const))/gm, "");
const chatSrc = await readFile(new URL("../defaults/mods/tabs/chat.js", import.meta.url), "utf8");
let server: unknown = null;
const chat = new Function("appHome", "readTextFile", "shared", strip(chatSrc) + "\nreturn { CHAT, ovisServer, ovisPanes, ovisPaneId, chatTarget, onMachine, voiceLink };")(
  () => "/home/me/.config/herdr-app", async () => "{}", (key: string) => key === "ovis.servers" ? servers : server);
let servers: unknown = null;

test("the Ovis pane is the herdr-app pane (its layout node id), else the one showing that terminal; only agents count", () => {
  const ovis = [{ pane_id: "p1", terminal_id: "t1", agent: "claude-code" }, { pane_id: "hc:loose:t9", terminal_id: "t9", agent: "codex" }, { pane_id: "p2", terminal_id: "t2", agent: null }];
  expect(chat.ovisPaneId(ovis, "p1", "t1")).toBe("p1");
  expect(chat.ovisPaneId(ovis, "p7", "t9")).toBe("hc:loose:t9");
  expect(chat.ovisPaneId(ovis, "p7", "t8")).toBeNull();
  expect(chat.ovisPaneId(ovis, "p2", "t2")).toBeNull();
  expect(chat.ovisPaneId(null, "p1", "t1")).toBeNull();
  // another machine's pane, asked of that machine's own Ovis
  expect(chat.ovisPaneId(ovis, "vm/p1", "vm/t1")).toBe("p1");
  expect(chat.ovisPaneId(ovis, "vm/p7", "vm/t9")).toBe("hc:loose:t9");
});

test("the icons act on the open tab's focused terminal pane, on any machine", () => {
  const all = [{ pane: "p1", terminal: "t1", tab: "tb1" }, { pane: "p2", terminal: "t2", tab: "tb1", focused: true }, { pane: "m/p3", terminal: "m/t3", tab: "m/tb2", focused: true }, { pane: "p4", tab: "tb3" }];
  expect(chat.chatTarget(all, "tb1").pane).toBe("p2");
  expect(chat.chatTarget(all, "m/tb2").pane).toBe("m/p3");
  expect(chat.chatTarget(all, "tb3")).toBeNull();
  expect(chat.chatTarget(all, "none")).toBeNull();
  expect(chat.onMachine("m/p3")).toEqual({ machine: "m", id: "p3" });
  expect(chat.onMachine("p1")).toEqual({ machine: "", id: "p1" });
});

test("the default server is the Ovis on herdr-core, port 7318; shared(\"ovis.server\") changes it", () => {
  server = null;
  expect(chat.ovisServer()).toBe("http://127.0.0.1:7318");
  server = "http://127.0.0.1:7400/";
  expect(chat.ovisServer()).toBe("http://127.0.0.1:7400");
  server = null;
});

test("another machine's Ovis is shared(\"ovis.servers\")[machine]; none set: no server, no icons", async () => {
  servers = null;
  expect(chat.ovisServer("vm")).toBeNull();
  expect(await chat.ovisPanes(null)).toBeNull();
  servers = { vm: "http://127.0.0.1:7328/" };
  expect(chat.ovisServer("vm")).toBe("http://127.0.0.1:7328");
  expect(chat.ovisServer("other")).toBeNull();
  servers = null;
});

// the tab bar with those icons
const tabsSrc = await readFile(new URL("../defaults/mods/tabs/main.js", import.meta.url), "utf8");
const ran: [string, unknown][] = [];
let pane: Record<string, unknown> = {};
const values: Record<string, unknown> = {
  View: class {}, div: () => new Element(), svg: () => new Element(), image: () => new Element(), h_flex: () => new Element(),
  ScrollHandle: { new: () => ({ scroll_to_item() {} }) },
  spaces: () => [{ id: "s1", active: true, tabs: [{ id: "tb1", name: "a", active: true }] }],
  panes: () => [pane], run(command: string, args: unknown) { ran.push([command, args]); }, exec: async () => ({ code: 0 }), openOverlay() {}, theme: () => ({}),
  window: () => null, shared: () => null, layout: () => null, settings: () => ({ zoom: 1 }), checking: () => true,
  localStorage: { getItem: () => null, setItem() {} }, ...chat,
};
const Tabs = new Function(...Object.keys(values), tabsSrc.replace(/^import .*;\n/gm, "").replace("export default class Tabs", "return class Tabs"))(...Object.values(values));
function find(root: Element, id: string): Element[] {
  if (!(root instanceof Element)) return [];
  return [...(root.calls.id?.[0] === id ? [root] : []), ...root.nodes.flatMap((n) => find(n, id))];
}
const click = (el: Element) => (el.calls.on_click![0] as () => void)();

test("Chat and Terminal sit beside +; Chat shows ovis-chat in place of the terminal, Terminal goes back", () => {
  ran.length = 0;
  pane = { pane: "p1", terminal: "t1", tab: "tb1", focused: true, view: null };
  const view = new Tabs();
  view.init();
  expect(find(view.render(), "chat-view")).toEqual([]); // Ovis has not said it is an agent
  view.chat = { pane: "p1", ovis: "p1", server: "http://127.0.0.1:7318" };
  const bar = view.render();
  expect(find(bar, "tab-new")).toHaveLength(1);
  click(find(bar, "chat-view")[0]!);
  expect(ran).toEqual([["pane.view", { pane: "p1", mod: "ovis-chat", props: { server: "http://127.0.0.1:7318", paneId: "p1" } }]]);
  ran.length = 0;
  pane.view = "ovis-chat";
  view.chat = { pane: null, ovis: null }; // the server stopped: the way back stays while the chat shows
  click(find(view.render(), "terminal-view")[0]!);
  expect(ran).toEqual([["pane.view", { pane: "p1" }]]);
});

test("Voice is the Assistant's only: an agent in the orchestrator's folder (or the Ovis Assistant's), with its Ovis pane", () => {
  expect(chat.voiceLink("http://127.0.0.1:7328", "hc:loose:t5", "/home/me/orchestrator")).toBe("http://127.0.0.1:7328/?pane=hc%3Aloose%3At5&view=chat&assistant=voice");
  expect(chat.voiceLink("http://x", "p1", "/home/me/.config/ovis/assistant/agent/")).not.toBeNull();
  expect(chat.voiceLink("http://x", "p1", "/home/me/repo")).toBeNull();
  expect(chat.voiceLink("http://x", null, "/home/me/orchestrator")).toBeNull();
  expect(chat.voiceLink(null, "p1", "/home/me/orchestrator")).toBeNull();
});
