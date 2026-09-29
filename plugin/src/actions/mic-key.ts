// The microphone (default input) on a key: press mutes or unmutes. Muted: red with a crossed-out
// mic; otherwise a small level (it moves only while an app records, e.g. during a call).
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { frames } from "@rocklobster42195/streamdeck-kit";
import { MeterFeed } from "../audio/meter-feed";
import { systemAudio } from "../audio/system-audio";
import { renderKeyMessage, renderMicKey } from "../render/keys";
import { AudioKey, type KeyInstance } from "./audio-key";

type MicKeySettings = {
    /** Show the level while not muted (default on). */
    showLevel?: boolean;
} & JsonObject;

@action({ UUID: "de.boriskemper.system-audio-controller.mic-key" })
export class MicKey extends AudioKey<MicKeySettings> {
    private readonly feeds = new Map<string, MeterFeed>();

    constructor() {
        super("mic");
    }

    protected override press(): void {
        if (systemAudio.ready("in")) systemAudio.setMuted("in", !systemAudio.endpoints.in.muted);
    }

    protected override changed(inst: KeyInstance<MicKeySettings>): void {
        let feed = this.feeds.get(inst.id);
        if (!feed) this.feeds.set(inst.id, (feed = new MeterFeed(`mic-${inst.id}`)));
        const wanted = systemAudio.ready("in") && !systemAudio.endpoints.in.muted && inst.settings.showLevel !== false;
        feed.update(wanted ? "in" : undefined);
        if (feed.active) {
            const f = feed;
            frames.run(`mic-${inst.id}`, () => {
                if (this.instances.get(inst.id) !== inst || !f.active) return false;
                this.render(inst);
                return true;
            });
        }
        this.render(inst);
    }

    protected override disappeared(inst: KeyInstance<MicKeySettings>): void {
        this.feeds.get(inst.id)?.stop();
        this.feeds.delete(inst.id);
        frames.stop(`mic-${inst.id}`);
    }

    protected override image(inst: KeyInstance<MicKeySettings>): string {
        if (!systemAudio.ready("in")) return renderKeyMessage(streamDeck.i18n.t("key.no_mic"));
        const feed = this.feeds.get(inst.id);
        const frame = feed?.active ? feed.frame() : undefined;
        return renderMicKey({ muted: systemAudio.endpoints.in.muted, mutedLabel: streamDeck.i18n.t("key.mic_muted"), levels: frame?.levels, peaks: frame?.peaks });
    }
}
