// SA-C's keys (144×144) in the family's key look (the kit's key style, as MA-C and HA-C): the Mic
// key (red and crossed out when muted, a small level otherwise), the Device key (the output device
// with a fitting icon; the default one "on": tinted plate and frame in Cerise) and the App key.
// A name is left out when the user set a Stream Deck title (it would sit on top of it).
import { escapeXml, KEY_ICON, KEY_TIERS, keyActiveFrame, keyActivePlate, keyCaption, keyIcon, keyStatusBadge, keySvg, meterBar, wrap } from "@rocklobster42195/streamdeck-kit";
import { mdiApplicationOutline, mdiVolumeOff, mdiHeadphones, mdiMicrophone, mdiMicrophoneOff, mdiMonitorSpeaker, mdiSpeaker, mdiSpeakerMultiple } from "@mdi/js";
import { ACCENT } from "./output-strip";

const SIZE = 144;
/** House palette red. */
export const MUTE_RED = "#E30018";
const font = `font-family="Segoe UI, Arial, sans-serif"`;
/** Names while off or inactive. */
const SOFT = "#c8c8cc";

/** A one-channel level bar along the bottom (the louder side), with its peak. */
function level(levels: number[], peaks: number[] | undefined, y: number): string[] {
    return meterBar({ x: 16, y, length: SIZE - 32, thickness: 12, levels: [Math.max(...levels)], peaks: peaks?.length ? [Math.max(...peaks)] : undefined, segments: 20 });
}

export type MicKeyView = {
    muted: boolean;
    /** Label under the icon when muted ("MUTED"). */
    mutedLabel: string;
    /** Level in dBFS (the louder side) with peak, when shown. */
    levels?: number[];
    peaks?: number[];
};

export function renderMicKey(v: MicKeyView): string {
    if (v.muted) return keySvg([keyIcon(mdiMicrophoneOff, KEY_ICON.withCaption, "#FFFFFF"), keyCaption(v.mutedLabel, "#FFFFFF")], MUTE_RED);
    if (!v.levels?.length) return keySvg([keyIcon(mdiMicrophone, KEY_ICON.full, KEY_TIERS.available)]);
    return keySvg([keyIcon(mdiMicrophone, KEY_ICON.withCaption, KEY_TIERS.available), ...level(v.levels, v.peaks, 114)]);
}

/** `name` undefined: a Stream Deck title is set, the key draws no name. */
export type DeviceKeyView = { name?: string; device: string; active: boolean };

/** Headphones, a monitor's speakers, several speakers, or plain speakers — guessed from the name. */
export function deviceIcon(name: string): string {
    const n = name.toLowerCase();
    if (/kopfh|headphone|headset|earbud|airpods|buds/.test(n)) return mdiHeadphones;
    if (/hdmi|displayport|monitor|display|tv|fernseh/.test(n)) return mdiMonitorSpeaker;
    if (/sonos|multi|group|gruppe/.test(n)) return mdiSpeakerMultiple;
    return mdiSpeaker;
}

export function renderDeviceKey(v: DeviceKeyView): string {
    const name = v.name?.trim();
    const ink = v.active ? ACCENT : KEY_TIERS.off;
    const parts: string[] = [];
    if (v.active) parts.push(keyActivePlate(ACCENT));
    parts.push(keyIcon(deviceIcon(v.device), name ? KEY_ICON.withCaption : KEY_ICON.full, ink));
    if (name) parts.push(keyCaption(name, v.active ? "#FFFFFF" : SOFT));
    if (v.active) parts.push(keyActiveFrame(ACCENT));
    return keySvg(parts);
}

export type AppKeyView = {
    /** Undefined: a Stream Deck title is set, the key draws no name. */
    name?: string;
    /** Colour icon (the greyed-out one while inactive), data URI. */
    icon?: string;
    muted: boolean;
    inactive: boolean;
    mutedLabel: string;
    levels?: number[];
    peaks?: number[];
};

/** An app: its icon large, the name below. Muted: red with the label; not running: grey. */
export function renderAppKey(v: AppKeyView): string {
    const muted = v.muted && !v.inactive;
    const name = v.name?.trim();
    const showLevel = !!v.levels?.length && !v.inactive && !muted;
    const parts: string[] = [];
    // The icon as large as the family's: full size alone, smaller with a name, a label or a level
    const place = muted || name || showLevel ? KEY_ICON.withCaption : KEY_ICON.full;
    if (v.icon) parts.push(`<image href="${v.icon}" x="${place.x}" y="${place.y}" width="${place.size}" height="${place.size}"/>`);
    else parts.push(keyIcon(mdiApplicationOutline, place, v.inactive ? KEY_TIERS.unavailable : KEY_TIERS.available));
    if (muted) return keySvg([...parts, keyIcon(mdiVolumeOff, { size: 22, x: SIZE - 35, y: 13 }, "#FFFFFF"), keyCaption(v.mutedLabel, "#FFFFFF")], MUTE_RED);
    const ink = v.inactive ? KEY_TIERS.off : "#FFFFFF";
    if (name && showLevel) parts.push(keyCaption(name, ink, { y: 100, max: 20, min: 13 }), ...level(v.levels!, v.peaks, 116));
    else if (name) parts.push(keyCaption(name, ink));
    else if (showLevel) parts.push(...level(v.levels!, v.peaks, 114));
    return keySvg(parts);
}

/** Not ready (helper starting or failed, not on Windows, nothing chosen): icon and a short text. */
export function renderKeyMessage(label: string, warn = false): string {
    const lines = wrap(label, SIZE - 16, 16, 2);
    return keySvg([
        keyIcon(mdiSpeaker, KEY_ICON.withCaption, KEY_TIERS.off),
        ...(warn ? [keyStatusBadge("failed")] : []),
        ...lines.map((l, i) => `<text x="${SIZE / 2}" y="${100 + i * 19}" ${font} font-size="16" fill="${SOFT}" text-anchor="middle">${escapeXml(l)}</text>`),
    ]);
}
