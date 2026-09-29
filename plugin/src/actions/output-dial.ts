// The computer's default output on a dial. Rotate: volume · Push or tap: mute. Digital and Classic
// show the level of what is playing; the helper meters only while one of them is visible.
import streamDeck, {
    action,
    type DialAction,
    type DialRotateEvent,
    type DidReceiveSettingsEvent,
    SingletonAction,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { frames } from "@rocklobster42195/streamdeck-kit";
import { MeterFeed } from "../audio/meter-feed";
import { stepVolume } from "../audio/steps";
import { systemAudio } from "../audio/system-audio";
import { renderOutputMessage, renderOutputStrip, showsMeter, type OutputStyle } from "../render/output-strip";

type OutputSettings = {
    style?: OutputStyle;
    /** Percent per dial tick. */
    step?: number;
    /** Own name on the display instead of the device's. */
    title?: string;
} & JsonObject;

type Instance = { action: DialAction<OutputSettings>; settings: OutputSettings; feed: MeterFeed; lastImage?: string };

@action({ UUID: "de.boriskemper.system-audio-controller.output-dial" })
export class OutputDial extends SingletonAction<OutputSettings> {
    private readonly instances = new Map<string, Instance>();

    constructor() {
        super();
        systemAudio.onChange(() => {
            for (const id of this.instances.keys()) this.refresh(id);
        });
    }

    override onWillAppear(ev: WillAppearEvent<OutputSettings>): void {
        if (!ev.action.isDial()) return;
        this.instances.set(ev.action.id, { action: ev.action, settings: ev.payload.settings, feed: new MeterFeed(`dial-${ev.action.id}`) });
        this.refresh(ev.action.id);
    }

    override onWillDisappear(ev: WillDisappearEvent<OutputSettings>): void {
        this.instances.get(ev.action.id)?.feed.stop();
        frames.stop(`output-${ev.action.id}`);
        this.instances.delete(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<OutputSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        this.refresh(ev.action.id);
    }

    override onDialRotate(ev: DialRotateEvent<OutputSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (inst && systemAudio.ready) systemAudio.setVolume(stepVolume(systemAudio.volume, ev.payload.ticks, inst.settings.step));
    }

    override onDialDown(): void {
        if (systemAudio.ready) systemAudio.setMuted(!systemAudio.muted);
    }

    override onTouchTap(): void {
        if (systemAudio.ready) systemAudio.setMuted(!systemAudio.muted);
    }

    private refresh(id: string): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        inst.feed.update(systemAudio.ready && showsMeter(inst.settings.style ?? "digital"));
        if (inst.feed.active) {
            frames.run(`output-${id}`, () => {
                if (this.instances.get(id) !== inst || !inst.feed.active) return false;
                this.render(inst);
                return true;
            });
        }
        this.render(inst);
    }

    private render(inst: Instance): void {
        const image = this.image(inst);
        if (image === inst.lastImage) return;
        inst.lastImage = image;
        void inst.action.setFeedback({ "full-canvas": image }).catch((e) => streamDeck.logger.warn("[output] setFeedback failed", e));
    }

    private image(inst: Instance): string {
        const t = (k: string) => streamDeck.i18n.t(k);
        const state = systemAudio.state;
        if (state === "unsupported") return renderOutputMessage("unsupported", t("key.unsupported"), t("key.unsupported_hint"));
        if (state === "failed") return renderOutputMessage("failed", t("key.failed"), t("key.failed_hint"));
        if (state === "starting") return renderOutputMessage("starting", t("key.starting"), t("key.starting_hint"));
        if (!systemAudio.device) return renderOutputMessage("no-device", t("key.no_device"), t("key.no_device_hint"));
        const meter = inst.feed.frame();
        return renderOutputStrip({
            name: inst.settings.title?.trim() || systemAudio.device.name,
            volume: systemAudio.volume,
            muted: systemAudio.muted,
            style: inst.settings.style ?? "digital",
            ...meter,
        });
    }
}
