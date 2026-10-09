import { action } from "@elgato/streamdeck";
import { PlayPauseKeyAction } from "@rocklobster42195/streamdeck-kit/keys";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { panoramaRows } from "../bus/sac-bus";
import { sacPlayers } from "../bus/sac-players";

/**
 * The universal Play/Pause key (the kit's, as in MA-C and Sonos Controller): music on the PC
 * (Spotify, a browser tab) and every other player on the deck. Without a chosen player it follows
 * the one that started last, apps included.
 */
@action({ UUID: "de.boriskemper.system-audio-controller.play-pause-key" })
export class PlayPauseKey extends PlayPauseKeyAction {
    constructor() {
        super({
            board: sacPlayers,
            defaultPlayer: "active:all",
            markerPath: (name) => mdiPath(name),
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
        });
    }
}
