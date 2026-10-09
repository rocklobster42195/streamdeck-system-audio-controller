// App output: plays one or more apps (Discord, Teams, Spotify …) on another device; each press moves
// them on to the next target in the list (headset → speakers → Windows' default …). A Multi-state
// key from the kit: the targets are its states, each with a name, icon and colour. Windows keeps a
// route for the app; an app without sound right now gets it when it starts.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { nextIndex, renderMultiStateKey, stateOptions } from "@rocklobster42195/streamdeck-kit";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiSpeaker } from "@mdi/js";
import { WINDOWS_DEFAULT, currentTarget, routeOf } from "../audio/app-output";
import { systemAudio } from "../audio/system-audio";
import { deviceIcon, renderKeyMessage } from "../render/keys";
import { AudioKey, type KeyInstance } from "./audio-key";

type AppOutputSettings = {
    /** The apps' keys ("discord", "ms-teams"). */
    apps?: string[];
    /** Their names, for apps that are closed now. */
    appNames?: Record<string, string>;
    /** [{ value: device id or "default", label?, icon?, color? }] */
    states?: JsonObject[];
    /** The state's name in its colour instead of white. */
    colorCaption?: boolean;
} & JsonObject;

/** SA-C's colour (Cerise), for targets without their own. */
const ACCENT = "#E14190";

@action({ UUID: "de.boriskemper.system-audio-controller.app-output-key" })
export class AppOutputKey extends AudioKey<AppOutputSettings> {
    constructor() {
        super("app-output");
    }

    private apps(inst: KeyInstance<AppOutputSettings>): string[] {
        return Array.isArray(inst.settings.apps) ? inst.settings.apps.filter((a): a is string => typeof a === "string") : [];
    }

    private current(inst: KeyInstance<AppOutputSettings>): number {
        return currentTarget(stateOptions(inst.settings.states), this.apps(inst), (app) => systemAudio.app(app)?.route ?? systemAudio.pendingRoute(app));
    }

    protected override press(inst: KeyInstance<AppOutputSettings>): void {
        const states = stateOptions(inst.settings.states);
        const apps = this.apps(inst);
        const next = nextIndex(this.current(inst), states.length);
        if (next < 0 || !apps.length) return this.feedback(inst, "alert");
        const device = routeOf(states[next].value);
        if (device && !systemAudio.devices.some((d) => d.id === device)) return this.feedback(inst, "alert");
        for (const app of apps) systemAudio.setAppRoute(app, device);
        streamDeck.logger.info(`[app-output] ${apps.join(", ")} → ${device || "Windows default"}`);
        this.render(inst);
    }

    protected override image(inst: KeyInstance<AppOutputSettings>): string {
        const t = (k: string) => streamDeck.i18n.t(k);
        const apps = this.apps(inst);
        const states = stateOptions(inst.settings.states);
        if (!apps.length) return renderKeyMessage(t("key.choose_app"));
        if (!states.length) return renderKeyMessage(t("key.add_targets"));
        const index = this.current(inst);
        const s = index >= 0 ? states[index] : undefined;
        const device = s && s.value !== WINDOWS_DEFAULT ? systemAudio.devices.find((d) => d.id === s.value) : undefined;
        const name = s?.label?.trim() || (s?.value === WINDOWS_DEFAULT ? t("key.device_windows") : device?.name);
        return renderMultiStateKey({
            index,
            count: states.length,
            icon: mdiPath(s?.icon) ?? (device ? deviceIcon(device.name) : mdiSpeaker),
            color: s?.color || ACCENT,
            text: this.label(inst, name ?? (inst.settings.appNames?.[apps[0]] || apps[0])),
            // None of the apps has sound now: dimmed (a press still works, it waits for them)
            offline: !apps.some((a) => systemAudio.app(a)),
            colorCaption: inst.settings.colorCaption === true,
        });
    }
}
