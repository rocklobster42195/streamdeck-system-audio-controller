import { action } from "@elgato/streamdeck";
import { VolumeKeyAction } from "@rocklobster42195/streamdeck-kit/keys";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { panoramaRows } from "../bus/sac-bus";
import { sacPlayers } from "../bus/sac-players";

/**
 * The universal Volume key (the kit's, as in MA-C and Sonos Controller): louder, quieter, mute and
 * a preset for an app on the PC (its volume in Windows' mixer) and every other player on the deck.
 */
@action({ UUID: "de.boriskemper.system-audio-controller.volume-key" })
export class VolumeKey extends VolumeKeyAction {
    constructor() {
        super({
            board: sacPlayers,
            defaultPlayer: "active:all",
            markerPath: (name) => mdiPath(name),
            rowColor: (deviceId) => panoramaRows.rowColor(deviceId),
        });
    }
}
