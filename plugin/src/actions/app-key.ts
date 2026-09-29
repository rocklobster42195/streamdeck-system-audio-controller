// One app on a key (Spotify, Firefox, Discord, …): press mutes or unmutes it. Shows the app's
// icon and name, a small level while it plays; red while muted, greyed out while it isn't running.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { frames } from "@rocklobster42195/streamdeck-kit";
import { appIcon } from "../audio/app-icons";
import { MeterFeed } from "../audio/meter-feed";
import { systemAudio } from "../audio/system-audio";
import { renderAppKey, renderKeyMessage } from "../render/keys";
import { AudioKey, type KeyInstance } from "./audio-key";

type AppKeySettings = {
    app?: string;
    appName?: string;
    /** Show the level while the app plays (default on). */
    showLevel?: boolean;
} & JsonObject;

@action({ UUID: "de.boriskemper.system-audio-controller.app-key" })
export class AppKey extends AudioKey<AppKeySettings> {
    private readonly feeds = new Map<string, MeterFeed>();

    constructor() {
        super("app-key");
    }

    protected override press(inst: KeyInstance<AppKeySettings>): void {
        const app = systemAudio.app(inst.settings.app);
        if (app) systemAudio.setAppMuted(app.app, !app.muted);
        else void inst.action.showAlert();
    }

    protected override changed(inst: KeyInstance<AppKeySettings>): void {
        let feed = this.feeds.get(inst.id);
        if (!feed) this.feeds.set(inst.id, (feed = new MeterFeed(`app-key-${inst.id}`)));
        const app = systemAudio.state === "ready" ? systemAudio.app(inst.settings.app) : undefined;
        feed.update(app && !app.muted && inst.settings.showLevel !== false ? `app:${app.app}` : undefined);
        if (feed.active) {
            const f = feed;
            frames.run(`app-key-${inst.id}`, () => {
                if (this.instances.get(inst.id) !== inst || !f.active) return false;
                this.render(inst);
                return true;
            });
        }
        this.render(inst);
    }

    protected override disappeared(inst: KeyInstance<AppKeySettings>): void {
        this.feeds.get(inst.id)?.stop();
        this.feeds.delete(inst.id);
        frames.stop(`app-key-${inst.id}`);
    }

    protected override image(inst: KeyInstance<AppKeySettings>): string {
        const key = inst.settings.app;
        if (!key) return renderKeyMessage(streamDeck.i18n.t("key.choose_app"));
        const app = systemAudio.app(key);
        const last = app ?? systemAudio.lastSeen(key);
        const feed = this.feeds.get(inst.id);
        const frame = app && feed?.active ? feed.frame() : undefined;
        return renderAppKey({
            name: last?.name ?? (inst.settings.appName || key),
            icon: appIcon(key, !app),
            muted: app?.muted ?? false,
            inactive: !app,
            mutedLabel: streamDeck.i18n.t("key.mic_muted"),
            levels: frame?.levels,
            peaks: frame?.peaks,
        });
    }
}
