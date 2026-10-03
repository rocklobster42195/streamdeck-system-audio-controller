// Base for SA-C's keys: instances, redraw on every audio change (deduplicated), the not-ready
// states, the kit's press feedback, the user's Stream Deck title (a key draws no name of its own
// while one is set). Subclasses draw the ready state and react to a press.
import streamDeck, { type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, SingletonAction, type TitleParametersDidChangeEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { isFeedbackPlaying, KEY_BG, playFeedback, type FeedbackKind } from "@rocklobster42195/streamdeck-kit";
import { systemAudio } from "../audio/system-audio";
import { renderKeyMessage } from "../render/keys";

export type KeyInstance<S extends JsonObject> = {
    id: string;
    action: KeyAction<S>;
    settings: S;
    lastImage?: string;
    /** The title the user typed in Stream Deck (drawn over the key). */
    title?: string;
};

export abstract class AudioKey<S extends JsonObject> extends SingletonAction<S> {
    protected readonly instances = new Map<string, KeyInstance<S>>();

    constructor(protected readonly key: string) {
        super();
        systemAudio.onChange(() => {
            for (const inst of this.instances.values()) this.changed(inst);
        });
    }

    /** The image when the helper runs. */
    protected abstract image(inst: KeyInstance<S>): string;
    protected abstract press(inst: KeyInstance<S>): void;
    /** Audio or settings changed (default: redraw). */
    protected changed(inst: KeyInstance<S>): void {
        this.render(inst);
    }
    protected disappeared(_inst: KeyInstance<S>): void {}

    override onWillAppear(ev: WillAppearEvent<S>): void {
        if (!ev.action.isKey()) return;
        const inst: KeyInstance<S> = { id: ev.action.id, action: ev.action, settings: ev.payload.settings };
        this.instances.set(ev.action.id, inst);
        this.changed(inst);
    }

    override onWillDisappear(ev: WillDisappearEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (inst) this.disappeared(inst);
        this.instances.delete(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        this.changed(inst);
    }

    override onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.title = ev.payload.title?.trim() || undefined;
        this.render(inst);
    }

    /** The name to draw: none while a Stream Deck title is set. */
    protected label(inst: KeyInstance<S>, name: string): string | undefined {
        return inst.title ? undefined : name;
    }

    /** The kit's feedback (check or alert) on the key; it redraws itself when it ends. */
    protected feedback(inst: KeyInstance<S>, kind: FeedbackKind): void {
        playFeedback(inst.id, inst.action, kind, {
            background: KEY_BG,
            restore: () => {
                inst.lastImage = undefined;
                this.render(inst);
            },
        });
    }

    override onKeyDown(ev: KeyDownEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (inst && systemAudio.state === "ready") this.press(inst);
    }

    protected render(inst: KeyInstance<S>): void {
        // The feedback owns the key while it plays
        if (isFeedbackPlaying(inst.id)) return;
        const image = this.imageOrMessage(inst);
        if (image === inst.lastImage) return;
        inst.lastImage = image;
        void inst.action.setImage(image).catch((e) => streamDeck.logger.warn(`[${this.key}] setImage failed`, e));
    }

    private imageOrMessage(inst: KeyInstance<S>): string {
        const t = (k: string) => streamDeck.i18n.t(k);
        const state = systemAudio.state;
        if (state === "unsupported") return renderKeyMessage(t("key.unsupported"), true);
        if (state === "failed") return renderKeyMessage(t("key.failed"), true);
        if (state === "starting") return renderKeyMessage(t("key.starting"));
        return this.image(inst);
    }
}
