// SA-C's part of the kit's PI bridge: the lists for <pi-select> (apps with sound, output devices).
import streamDeck from "@elgato/streamdeck";
import { piBridge } from "@rocklobster42195/streamdeck-kit/bridge";
import { systemAudio } from "../audio/system-audio";

export function initPiBridge(): void {
    piBridge.init();
    // Apps with sound right now; playing ones first
    piBridge.registerOptions("apps", () =>
        [...systemAudio.apps]
            .sort((a, b) => Number(b.active) - Number(a.active))
            .map((a) => ({ value: a.app, label: a.name, sub: a.active ? streamDeck.i18n.t("key.app_playing") : `${a.app}.exe` })),
    );
    piBridge.registerOptions("output-devices", () => systemAudio.devices.map((d) => ({ value: d.id, label: d.name, sub: d.default ? streamDeck.i18n.t("key.device_default") : undefined })));
    // The Device key's second device can be left empty again
    piBridge.registerOptions("output-devices-optional", () => [
        { value: "", label: streamDeck.i18n.t("key.device_none") },
        ...systemAudio.devices.map((d) => ({ value: d.id, label: d.name, sub: d.default ? streamDeck.i18n.t("key.device_default") : undefined })),
    ]);
}
