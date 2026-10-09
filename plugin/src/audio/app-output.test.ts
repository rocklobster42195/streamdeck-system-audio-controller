import { describe, expect, it } from "vitest";
import { WINDOWS_DEFAULT, currentTarget, routeOf } from "./app-output";

const headset = "{0.0.0.00000000}.{aaaa}";
const speakers = "{0.0.0.00000000}.{bbbb}";
const states = [{ value: WINDOWS_DEFAULT }, { value: headset }, { value: speakers }];

describe("App output", () => {
    it("turns the default target into no route", () => {
        expect(routeOf(WINDOWS_DEFAULT)).toBe("");
        expect(routeOf(headset)).toBe(headset);
    });

    it("finds the target of the first app that has a route", () => {
        const routes: Record<string, string | undefined> = { discord: undefined, teams: headset };
        expect(currentTarget(states, ["discord", "teams"], (a) => routes[a])).toBe(1);
        expect(currentTarget(states, ["teams"], () => "")).toBe(0);
    });

    it("is unknown without an app with a route, or for a device not in the list", () => {
        expect(currentTarget(states, ["discord"], () => undefined)).toBe(-1);
        expect(currentTarget(states, ["discord"], () => "{0.0.0.00000000}.{cccc}")).toBe(-1);
        expect(currentTarget(states, [], () => "")).toBe(-1);
    });
});
