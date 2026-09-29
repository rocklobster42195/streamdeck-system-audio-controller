// The computer's default output on a dial. Rotate: volume · Push or tap: mute. Digital and Classic
// show the level of what is playing; the helper meters only while one of them is visible.
import { action } from "@elgato/streamdeck";
import { systemAudio } from "../audio/system-audio";
import { VolumeDial, type Target, type VolumeDialSettings } from "./volume-dial";

@action({ UUID: "de.boriskemper.system-audio-controller.output-dial" })
export class OutputDial extends VolumeDial<VolumeDialSettings> {
    constructor() {
        super("output");
    }

    protected override target(): Target {
        const out = systemAudio.endpoints.out;
        if (!out.device) return { message: "no-device" };
        return {
            name: out.device.name,
            volume: out.volume,
            muted: out.muted,
            meter: "out",
            setVolume: (v) => systemAudio.setVolume("out", v),
            setMuted: (on) => systemAudio.setMuted("out", on),
        };
    }
}
