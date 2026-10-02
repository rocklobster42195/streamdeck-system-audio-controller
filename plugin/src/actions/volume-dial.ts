// Base for SA-C's dials (Output, App): instances, the not-ready states, the level while one is
// shown, a deduplicated redraw at the shared frame rate, and the row's Panorama effect behind the
// dial (shared with the other dials of the row, also of other plugins). Rotate: volume · Push or tap: mute.
import streamDeck, {
    type DialAction,
    type DialRotateEvent,
    type DidReceiveSettingsEvent,
    SingletonAction,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { frames, rowStateFromSettings } from "@rocklobster42195/streamdeck-kit";
import { MeterFeed } from "../audio/meter-feed";
import { stepVolume } from "../audio/steps";
import { systemAudio, type MeterSource } from "../audio/system-audio";
import { renderOutputMessage, renderOutputStrip, showsMeter, type OutputStyle } from "../render/output-strip";
import { panorama, panoramaRows } from "../bus/sac-bus";

export type VolumeDialSettings = {
    style?: OutputStyle;
    /** Percent per dial tick. */
    step?: number;
    /** Own name on the display. */
    title?: string;
} & JsonObject;

/** What a dial controls right now, an app that isn't running (drawn greyed out), or a message why it can't. */
export type Target =
    | { name: string; volume: number; muted: boolean; meter: MeterSource; icon?: string; setVolume: (v: number) => void; setMuted: (on: boolean) => void }
    | { inactive: true; name: string; volume: number | undefined; muted: boolean; icon?: string }
    | { message: "choose" | "no-device" };

type Instance<S extends JsonObject> = { action: DialAction<S>; settings: S; feed: MeterFeed; lastImage?: string };

export abstract class VolumeDial<S extends VolumeDialSettings> extends SingletonAction<S> {
    private readonly instances = new Map<string, Instance<S>>();

    constructor(private readonly key: string) {
        super();
        systemAudio.onChange(() => {
            for (const id of this.instances.keys()) this.refresh(id);
        });
    }

    protected abstract target(settings: S): Target;

    override onWillAppear(ev: WillAppearEvent<S>): void {
        if (!ev.action.isDial()) return;
        const id = ev.action.id;
        const inst: Instance<S> = { action: ev.action, settings: ev.payload.settings, feed: new MeterFeed(`${this.key}-${id}`) };
        this.instances.set(id, inst);
        panoramaRows.add(id, {
            device: ev.action.device.id,
            column: ev.action.coordinates?.column ?? 0,
            label: () => {
                const t = systemAudio.state === "ready" ? this.target(inst.settings) : undefined;
                return inst.settings.title?.trim() || (t && "name" in t ? t.name : "");
            },
            state: () => rowStateFromSettings(inst.settings),
            save: (patch) => {
                inst.settings = { ...inst.settings, ...patch } as S;
                void inst.action.setSettings(inst.settings);
            },
            redraw: () => this.render(inst),
        });
        this.refresh(id);
    }

    override onWillDisappear(ev: WillDisappearEvent<S>): void {
        this.instances.get(ev.action.id)?.feed.stop();
        frames.stop(`${this.key}-${ev.action.id}`);
        this.instances.delete(ev.action.id);
        panoramaRows.remove(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        panoramaRows.changed(ev.action.id);
        this.refresh(ev.action.id);
    }

    override onDialRotate(ev: DialRotateEvent<S>): void {
        const t = this.live(ev.action.id);
        const inst = this.instances.get(ev.action.id);
        if (t && inst) t.setVolume(stepVolume(t.volume, ev.payload.ticks, inst.settings.step));
    }

    override onDialDown(ev: { action: { id: string } }): void {
        this.toggleMute(ev.action.id);
    }

    override onTouchTap(ev: { action: { id: string } }): void {
        this.toggleMute(ev.action.id);
    }

    private toggleMute(id: string): void {
        const t = this.live(id);
        t?.setMuted(!t.muted);
    }

    /** The target, if the helper runs and there is something to control. */
    private live(id: string) {
        const inst = this.instances.get(id);
        if (!inst || systemAudio.state !== "ready") return undefined;
        const t = this.target(inst.settings);
        return "message" in t || "inactive" in t ? undefined : t;
    }

    private refresh(id: string): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        const t = systemAudio.state === "ready" ? this.target(inst.settings) : undefined;
        inst.feed.update(t && !("message" in t) && !("inactive" in t) && showsMeter(inst.settings.style ?? "digital") ? t.meter : undefined);
        if (inst.feed.active) {
            frames.run(`${this.key}-${id}`, () => {
                if (this.instances.get(id) !== inst || !inst.feed.active) return false;
                this.render(inst);
                return true;
            });
        }
        this.render(inst);
    }

    private render(inst: Instance<S>): void {
        const image = this.image(inst);
        if (image === inst.lastImage) return;
        inst.lastImage = image;
        void inst.action.setFeedback({ "full-canvas": image }).catch((e) => streamDeck.logger.warn(`[${this.key}] setFeedback failed`, e));
    }

    private image(inst: Instance<S>): string {
        const t = (k: string) => streamDeck.i18n.t(k);
        const state = systemAudio.state;
        if (state === "unsupported") return renderOutputMessage("unsupported", t("key.unsupported"), t("key.unsupported_hint"));
        if (state === "failed") return renderOutputMessage("failed", t("key.failed"), t("key.failed_hint"));
        if (state === "starting") return renderOutputMessage("starting", t("key.starting"), t("key.starting_hint"));
        const target = this.target(inst.settings);
        if ("message" in target) {
            if (target.message === "choose") return renderOutputMessage("choose", t("key.choose_app"), t("key.choose_app_hint"));
            return renderOutputMessage("no-device", t("key.no_device"), t("key.no_device_hint"));
        }
        // The row's Panorama behind the dial; none on a dial that doesn't take part
        const id = inst.action.id;
        const background = panoramaRows.effectOf(id) && panoramaRows.isMember(id) && panorama.isActive(id) ? panorama.renderSlice(id) : undefined;
        return renderOutputStrip({
            background,
            name: inst.settings.title?.trim() || target.name,
            volume: target.volume,
            muted: target.muted,
            icon: target.icon,
            inactive: "inactive" in target,
            style: inst.settings.style ?? "digital",
            ...inst.feed.frame(),
        });
    }
}
