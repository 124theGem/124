import { describe, it, expect } from "vitest";
import { newGame, applyAction, parseSave } from "../shared/model";
import { ship } from "../shared/catalog";
import { finishFlight } from "./fly";
describe("explicit ship boarding", () => {
  it("boards with an axe selected, persists the cockpit, then flies a real course and lands", () => {
    let s = newGame(Date.now(), true);
    s.position = { ...ship("home") };
    s.hand = "axe";
    s = applyAction(s, { type: "boardShip" });
    expect(s.flight?.origin).toBe("home");
    expect(s.flight?.target).toBe("home");
    expect(s.grapple).toBeNull();
    s = parseSave(JSON.stringify(s));
    expect(s.flight).toBeTruthy();
    s = applyAction(s, { type: "course", planet: "listoria" });
    s = finishFlight(s);
    expect(s.planet).toBe("listoria");
    expect(s.flight).toBeNull();
  });
  it("requires proximity to the actual ship and retains the travel-to-current-world guard", () => {
    const s = newGame(Date.now(), true);
    s.position = { x: 30, z: 30 };
    expect(() => applyAction(s, { type: "boardShip" })).toThrow();
    s.position = { ...ship("home") };
    expect(() => applyAction(s, { type: "travel", planet: "home" })).toThrow(
      "Вы уже здесь",
    );
  });
});
