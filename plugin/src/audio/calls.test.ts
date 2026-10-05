import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALL_END_MS, CallTracker, callApp } from "./calls";

const teams = { app: "ms-teams", name: "Microsoft Teams" };
const firefox = { app: "firefox", name: "Firefox" };
const discord = { app: "discord", name: "Discord" };

describe("callApp", () => {
    it("takes the app Windows ducks for first", () => {
        expect(callApp([teams], [discord])).toEqual(teams);
    });

    it("falls back to a known call app on the mic, not any app", () => {
        expect(callApp([], [firefox, discord])).toEqual(discord);
        expect(callApp([], [firefox])).toBeUndefined();
    });
});

describe("CallTracker", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("starts at the first signal and ends after the quiet time", () => {
        const changed = vi.fn();
        const t = new CallTracker(changed);
        t.update([teams], [], 1000);
        expect(t.call).toEqual({ ...teams, since: 1000 });
        t.update([], [teams], 2000);
        t.update([], [], 3000);
        expect(t.call).toBeDefined();
        vi.advanceTimersByTime(CALL_END_MS);
        expect(t.call).toBeUndefined();
        expect(changed).toHaveBeenCalledTimes(2);
    });

    it("keeps the call through a short gap", () => {
        const changed = vi.fn();
        const t = new CallTracker(changed);
        t.update([teams], [], 1000);
        t.update([], [], 2000);
        vi.advanceTimersByTime(CALL_END_MS / 2);
        t.update([teams], [], 3000);
        vi.advanceTimersByTime(CALL_END_MS * 2);
        expect(t.call?.since).toBe(1000);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it("ends at once on reset", () => {
        const changed = vi.fn();
        const t = new CallTracker(changed);
        t.update([teams], [], 1000);
        t.reset();
        expect(t.call).toBeUndefined();
        expect(changed).toHaveBeenCalledTimes(2);
    });
});
