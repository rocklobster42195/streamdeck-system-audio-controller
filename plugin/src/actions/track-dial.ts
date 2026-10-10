import streamDeck, { action, type DialAction } from "@elgato/streamdeck";
import { TrackDialAction } from "@rocklobster42195/streamdeck-kit/keys";
import { rowStateFromSettings } from "@rocklobster42195/streamdeck-kit";
import { panorama, panoramaRows } from "../bus/sac-bus";
import { sacPlayers } from "../bus/sac-players";

/**
 * The universal Track dial (the kit's, as in MA-C and Sonos Controller): cover, title, artist and
 * progress of the music on the PC (Spotify, a browser tab, Media Player) or any other player on
 * the deck. Rotate: seek · Push: next track · Touch: play/pause. Without a chosen player it follows
 * the one that started last, apps included. The dial takes part in its row's Panorama.
 */
@action({ UUID: "de.boriskemper.system-audio-controller.track-dial" })
export class TrackDial extends TrackDialAction {
    /** The dials in their row's Panorama, with the settings it asks for. */
    private readonly inRows = new Map<string, Record<string, unknown>>();

    constructor() {
        super({
            board: sacPlayers,
            defaultPlayer: "active:all",
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
            underlay: (id) => (panoramaRows.effectOf(id) && panoramaRows.isMember(id) && panorama.isActive(id) ? panorama.renderSlice(id) : undefined),
            nothingLabel: () => streamDeck.i18n.t("key.nothing_playing"),
            defaultLook: "info",
            onShown: (a, s) => this.joinRow(a, s),
            onSettings: (a, s) => {
                this.inRows.set(a.id, s);
                panoramaRows.changed(a.id);
            },
            onHidden: (id) => {
                this.inRows.delete(id);
                panoramaRows.remove(id);
            },
        });
    }

    private joinRow(a: DialAction, settings: Record<string, unknown>): void {
        const id = a.id;
        if (this.inRows.has(id)) {
            this.inRows.set(id, settings);
            panoramaRows.changed(id);
            return;
        }
        this.inRows.set(id, settings);
        panoramaRows.add(id, {
            device: a.device.id,
            column: a.coordinates?.column ?? 0,
            label: () => {
                const choice = this.inRows.get(id)?.player;
                return sacPlayers.resolve(typeof choice === "string" ? choice : "active:all")?.name ?? streamDeck.i18n.t("key.track");
            },
            state: () => rowStateFromSettings(this.inRows.get(id) ?? {}),
            save: (patch) => {
                const current = this.inRows.get(id);
                if (!current) return;
                const next = { ...current, ...patch };
                this.inRows.set(id, next);
                void a.setSettings(next as never);
            },
            redraw: () => this.redraw(id),
        });
    }
}
