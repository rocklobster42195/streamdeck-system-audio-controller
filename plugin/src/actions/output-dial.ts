// The computer's default output on a dial. Rotate: volume · Push or tap: mute. Digital and Classic
// show the level of what is playing; the helper meters only while one of them is visible.
import { action } from "@elgato/streamdeck";
import { systemAudio } from "../audio/system-audio";
import { deviceIcon } from "../render/keys";
import { mdiIconUri } from "../render/output-strip";
import { VolumeDial, type Target, type VolumeDialSettings } from "./volume-dial";

@action({ UUID: "de.boriskemper.system-audio-controller.output-dial" })
export class OutputDial extends VolumeDial<VolumeDialSettings> {
    constructor() {
        super("output");
    }

    protected override target(settings: VolumeDialSettings): Target {
        const out = systemAudio.endpoints.out;
        if (!out.device) return { message: "no-device" };
        // The ring, pie and open ring have an empty middle: the device's kind (headphones, speakers, monitor) goes there
        const circle = settings.style === "ring" || settings.style === "pie" || settings.style === "open";
        return {
            name: out.device.name,
            volume: out.volume,
            muted: out.muted,
            icon: circle ? mdiIconUri(deviceIcon(out.device.name)) : undefined,
            meter: "out",
            setVolume: (v) => systemAudio.setVolume("out", v),
            setMuted: (on) => systemAudio.setMuted("out", on),
        };
    }
}
