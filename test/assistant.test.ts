import { describe, it, expect } from "vitest";
import { makeGame } from "./helpers";
import * as A from "../src/game/actions";
import { assistantChat } from "../src/game/assistant";

describe("assistente AI (con AI finta)", () => {
  it("esegue gli strumenti e risponde", async () => {
    const { g } = makeGame();
    const reg = A.register(g, { name: "Ugo", stable: "Scuderia AI" });
    const p = g.player(reg.id)!;
    const m = (g.marketList() as any[]).find((x) => x.price < 20000 && !x.canRace)!;
    const calls: any[] = [];
    const fakeAi: any = {
      async run(_model: string, input: any) {
        calls.push(input);
        if (calls.length === 1) return { tool_calls: [{ name: "compra_cavallo", arguments: { id_cavallo: m.id } }] };
        if (calls.length === 2) return { tool_calls: [{ name: "stato_scuderia", arguments: {} }] };
        return { response: "Fatto, tesoro! Ora hai un cavallo." };
      },
    };
    const r = await assistantChat(g, fakeAi, p, [{ role: "user", content: "comprami un cavallo" }], "it");
    expect(r.reply).toContain("Fatto");
    expect(r.actions).toEqual(["compra_cavallo", "stato_scuderia"]);
    expect(g.horse(m.id)!.ownerId).toBe(p.id);
    expect(calls[0].tools.length).toBeGreaterThan(5);
  });
  it("posta: soldi, richieste, cavalli", () => {
    const { g } = makeGame();
    const a = A.register(g, { name: "Ada", stable: "Scuderia Uno" });
    const b = A.register(g, { name: "Bob", stable: "Scuderia Due" });
    A.sendMail(g, g.player(a.id)!, { to: "scuderia due", subject: "ciao", money: 1000, request: 500 });
    expect(g.player(b.id)!.money).toBe(31000);
    const m = A.inbox(g, g.player(b.id)!)[0];
    A.mailPay(g, g.player(b.id)!, m.id, true);
    expect(g.player(a.id)!.money).toBe(29500);
    const h = (g.marketList() as any[]).find((x) => x.price < 20000)!;
    A.buyHorse(g, g.player(a.id)!, h.id);
    A.sendMail(g, g.player(a.id)!, { to: "Scuderia Due", subject: "regalo", horseId: h.id });
    expect(g.horse(h.id)!.ownerId).toBe(b.id);
  });
});
