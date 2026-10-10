import { action } from "@elgato/streamdeck";
import { PlaybackControlKeyAction } from "@rocklobster42195/streamdeck-kit/keys";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { panoramaRows } from "../bus/sac-bus";
import { sacPlayers } from "../bus/sac-players";

/**
 * The universal Playback Control key (the kit's, as in MA-C and Sonos Controller): next, previous,
 * shuffle and repeat for music on the PC and every other player on the deck. Without a chosen
 * player it follows the one that started last, apps included.
 */
@action({ UUID: "de.boriskemper.system-audio-controller.playback-control-key" })
export class PlaybackControlKey extends PlaybackControlKeyAction {
    constructor() {
        super({
            board: sacPlayers,
            defaultPlayer: "active:all",
            markerPath: (name) => mdiPath(name),
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
        });
    }
}
