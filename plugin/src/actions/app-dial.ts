// One app's volume on a dial (Spotify, Firefox, Discord, …): its volume in the Windows volume
// mixer, relative to the output. Rotate: volume · Push or tap: mute. Shows the app's own level.
import { action } from "@elgato/streamdeck";
import { systemAudio } from "../audio/system-audio";
import { VolumeDial, type Target, type VolumeDialSettings } from "./volume-dial";

type AppDialSettings = VolumeDialSettings & {
    /** The app's key: its process name, e.g. "spotify". */
    app?: string;
    /** Its name when chosen, shown while the app isn't running. */
    appName?: string;
};

@action({ UUID: "de.boriskemper.system-audio-controller.app-dial" })
export class AppDial extends VolumeDial<AppDialSettings> {
    constructor() {
        super("app");
    }

    protected override target(s: AppDialSettings): Target {
        if (!s.app) return { message: "choose" };
        const app = systemAudio.app(s.app);
        if (!app) return { message: "not-running", name: s.appName || s.app };
        const key = app.app;
        return {
            name: app.name,
            volume: app.v,
            muted: app.muted,
            meter: `app:${key}`,
            setVolume: (v) => systemAudio.setAppVolume(key, v),
            setMuted: (on) => systemAudio.setAppMuted(key, on),
        };
    }
}
