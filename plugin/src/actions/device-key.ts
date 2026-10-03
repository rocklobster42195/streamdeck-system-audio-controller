// Switches the default output device (e.g. headphones and speakers). With one device chosen, a
// press makes it the default; with two, a press switches between them. Framed while active.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { systemAudio } from "../audio/system-audio";
import { nextDevice, shownDevice, type DeviceChoice } from "../audio/device-choice";
import { renderDeviceKey, renderKeyMessage } from "../render/keys";
import { AudioKey, type KeyInstance } from "./audio-key";

type DeviceKeySettings = DeviceChoice & JsonObject;

@action({ UUID: "de.boriskemper.system-audio-controller.device-key" })
export class DeviceKey extends AudioKey<DeviceKeySettings> {
    constructor() {
        super("device");
    }

    protected override press(inst: KeyInstance<DeviceKeySettings>): void {
        const id = nextDevice(inst.settings, systemAudio.endpoints.out.device?.id);
        if (id && systemAudio.devices.some((d) => d.id === id)) systemAudio.setDefault(id);
        else this.feedback(inst, "alert");
    }

    protected override image(inst: KeyInstance<DeviceKeySettings>): string {
        const current = systemAudio.endpoints.out.device?.id;
        const shown = shownDevice(inst.settings, current);
        if (!shown) return renderKeyMessage(streamDeck.i18n.t("key.choose_device"));
        // The device's current name when it is connected (it may have been renamed)
        const live = systemAudio.devices.find((d) => d.id === shown.id);
        const name = live?.name ?? shown.name;
        return renderDeviceKey({ name: this.label(inst, name), device: name, active: shown.id === current });
    }
}
