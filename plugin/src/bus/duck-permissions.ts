// Which plugins may lower SA-C's volume (deckbus "duck"): the user's choice per plugin, kept in the
// global settings as { duckPeers: { "<plugin uuid>": "<short name>" } }. Nobody may by default.
// The settings panel lists the plugins on the bus and the allowed ones that are away right now.
import streamDeck from "@elgato/streamdeck";
import { piBridge } from "@rocklobster42195/streamdeck-kit/bridge";
import type { PeerInfo } from "@rocklobster42195/streamdeck-kit/bus";

export type DuckPeerRow = { id: string; name: string; online: boolean; allowed: boolean };

let allowed: Record<string, string> = {};
let peers: PeerInfo[] = [];
const revokeListeners = new Set<(id: string) => void>();

export function isDuckAllowed(id: string): boolean {
    return id in allowed;
}

/** Told when the user takes a plugin's permission back (its running ducks end). */
export function onDuckRevoked(fn: (id: string) => void): void {
    revokeListeners.add(fn);
}

/** The peers on the bus now (for the settings panel). */
export function setDuckPeers(list: PeerInfo[]): void {
    peers = list;
    piBridge.schedulePush();
}

export function duckPeerRows(): DuckPeerRow[] {
    const rows = peers.map((p) => ({ id: p.id, name: p.name, online: true, allowed: isDuckAllowed(p.id) }));
    for (const [id, name] of Object.entries(allowed)) if (!rows.some((r) => r.id === id)) rows.push({ id, name, online: false, allowed: true });
    return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Call before streamDeck.connect(). */
export function initDuckPermissions(): void {
    streamDeck.settings.onDidReceiveGlobalSettings((ev) => read(ev.settings));
    piBridge.addPusher(() => [{ event: "duck-peers", peers: duckPeerRows() }]);
}

/** Call after streamDeck.connect(). */
export async function loadDuckPermissions(): Promise<void> {
    read(await streamDeck.settings.getGlobalSettings());
}

function read(settings: Record<string, unknown>): void {
    const raw = settings.duckPeers;
    const next: Record<string, string> = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const [id, name] of Object.entries(raw)) next[id] = String(name);
    const revoked = Object.keys(allowed).filter((id) => !(id in next));
    allowed = next;
    for (const id of revoked) for (const fn of revokeListeners) fn(id);
    piBridge.schedulePush();
}
