// SA-C's part of the kit's PI bridge: the lists for <pi-select> (apps with sound, output devices)
// and the dials' Panorama section.
import streamDeck from "@elgato/streamdeck";
import { playerOptions } from "@rocklobster42195/streamdeck-kit";
import { piBridge } from "@rocklobster42195/streamdeck-kit/bridge";
import { sacPlayers } from "../bus/sac-players";
import { mdiOptions } from "@rocklobster42195/streamdeck-kit/mdi";
import { WINDOWS_DEFAULT } from "../audio/app-output";
import { appIcon } from "../audio/app-icons";
import { systemAudio } from "../audio/system-audio";
import { panoramaRows } from "../bus/sac-bus";

export function initPiBridge(): void {
    piBridge.init();
    // The dials' Panorama section (<pi-panorama>): the row's effect, dials and settings
    panoramaRows.attachPi(piBridge);
    // Apps with sound right now; playing ones first
    piBridge.registerOptions("apps", () =>
        [...systemAudio.apps]
            .sort((a, b) => Number(b.active) - Number(a.active))
            .map((a) => ({ value: a.app, label: a.name, sub: a.active ? streamDeck.i18n.t("key.app_playing") : `${a.app}.exe`, image: appIcon(a.app) })),
    );
    piBridge.registerOptions("output-devices", () => systemAudio.devices.map((d) => ({ value: d.id, label: d.name, sub: d.default ? streamDeck.i18n.t("key.device_default") : undefined })));
    // The App output key's targets: Windows' default, then the devices
    piBridge.registerOptions("output-targets", () => [
        { value: WINDOWS_DEFAULT, label: streamDeck.i18n.t("key.device_windows") },
        ...systemAudio.devices.map((d) => ({ value: d.id, label: d.name })),
    ]);
    // Icons for the targets (<pi-states> searches the Material Design Icons)
    piBridge.registerOptions("mdi-icons", mdiOptions);
    // The Play/Pause key's player: every player on the deck (the PC's apps, speakers of other plugins)
    piBridge.registerOptions("players", () => playerOptions(sacPlayers.players()));
    // The Device key's second device can be left empty again
    piBridge.registerOptions("output-devices-optional", () => [
        { value: "", label: streamDeck.i18n.t("key.device_none") },
        ...systemAudio.devices.map((d) => ({ value: d.id, label: d.name, sub: d.default ? streamDeck.i18n.t("key.device_default") : undefined })),
    ]);
}
