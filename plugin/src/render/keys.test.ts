import { describe, expect, it } from "vitest";
import { mdiHeadphones, mdiMonitorSpeaker, mdiSpeaker } from "@mdi/js";
import { nextDevice, shownDevice } from "../audio/device-choice";
import { deviceIcon, renderDeviceKey, renderMicKey } from "./keys";

const svg = (url: string) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64").toString("utf8");

describe("Mic key", () => {
    it("is red with the label when muted, dark with a level otherwise", () => {
        expect(svg(renderMicKey({ muted: true, mutedLabel: "STUMM" }))).toContain("STUMM");
        expect(svg(renderMicKey({ muted: true, mutedLabel: "STUMM" }))).toContain("#E30018");
        expect(svg(renderMicKey({ muted: false, mutedLabel: "STUMM", levels: [-20, -30], peaks: [-10, -12] }))).not.toContain("STUMM");
    });
});

describe("Device key", () => {
    it("guesses the icon from the name", () => {
        expect(deviceIcon("Kopfhörer (USB Audio)")).toBe(mdiHeadphones);
        expect(deviceIcon("LG Monitor (NVIDIA High Definition Audio)")).toBe(mdiMonitorSpeaker);
        expect(deviceIcon("Lautsprecher (Realtek(R) Audio)")).toBe(mdiSpeaker);
    });
    it("frames the active device", () => {
        expect(svg(renderDeviceKey({ name: "Speakers", active: true }))).toContain("stroke-width=\"6\"");
        expect(svg(renderDeviceKey({ name: "Speakers", active: false }))).not.toContain("stroke-width=\"6\"");
    });
    it("switches between two devices, or selects one", () => {
        const two = { device: "a", deviceName: "A", device2: "b", device2Name: "B" };
        expect(nextDevice(two, "a")).toBe("b");
        expect(nextDevice(two, "b")).toBe("a");
        expect(nextDevice(two, "other")).toBe("a");
        expect(nextDevice({ device: "a" }, "a")).toBe("a");
        expect(shownDevice(two, "b")?.name).toBe("B");
        expect(shownDevice(two, "other")?.name).toBe("A");
        expect(shownDevice({}, "a")).toBeUndefined();
    });
});
