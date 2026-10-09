// The App output key's logic (SA-C grill 2026-10-05, Q4): one or more apps, a list of targets
// (output devices, or Windows' default), each press routes the apps to the next one. A Multi-state
// key from the kit: the targets are its states.
import type { StateOption } from "@rocklobster42195/streamdeck-kit";

/** A target that means "Windows' default device" (no routing for the app). */
export const WINDOWS_DEFAULT = "default";

/** The device to route to for a target ("" = Windows' default). */
export function routeOf(value: string): string {
    return value === WINDOWS_DEFAULT ? "" : value;
}

/**
 * Which target the apps are on now: the first chosen app that has a route (with sound now, or one
 * asked for until it starts); -1 when none does or its device isn't in the list.
 */
export function currentTarget(states: readonly StateOption[], apps: readonly string[], route: (app: string) => string | undefined): number {
    for (const app of apps) {
        const r = route(app);
        if (r === undefined) continue;
        return states.findIndex((s) => routeOf(s.value) === r);
    }
    return -1;
}
