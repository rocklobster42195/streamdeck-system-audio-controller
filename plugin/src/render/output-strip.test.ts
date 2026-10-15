import { describe, expect, it } from "vitest";
import { mdiHeadphones } from "@mdi/js";
import { mdiIconUri, renderOutputMessage, renderOutputStrip, type OutputStyle } from "./output-strip";

/** The SVG inside a data URL. */
const svg = (url: string) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64").toString("utf8");

const view = { name: "Speakers (Realtek)", volume: 0.42, muted: false, levels: [-20, -22], peaks: [-12, -14], vus: [-3, -5] };

describe("renderOutputStrip", () => {
    for (const style of ["digital", "classic", "ring", "pie"] as OutputStyle[]) {
        it(`draws ${style}, with the volume or MUTE`, () => {
            expect(svg(renderOutputStrip({ ...view, style }))).toContain("42 %");
            expect(svg(renderOutputStrip({ ...view, style, muted: true }))).toContain("MUTE");
        });
    }
    it("draws an app that isn't running greyed out, with its icon and last volume", () => {
        const s = svg(renderOutputStrip({ ...view, style: "digital", inactive: true, icon: "data:image/png;base64,AAAA" }));
        expect(s).toContain("42 %");
        expect(s).toContain('href="data:image/png');
        expect(s).not.toContain("#E14190");
        expect(svg(renderOutputStrip({ ...view, style: "ring", inactive: true, volume: undefined }))).toContain("–");
    });
    it("draws the not-ready messages", () => {
        expect(svg(renderOutputMessage("unsupported", "Windows only", "later"))).toContain("Windows only");
    });
});

describe("the device icon in the circle", () => {
    it("is an image in the ring, the pie and the open ring, and is not in Digital", () => {
        const icon = mdiIconUri(mdiHeadphones);
        expect(icon.startsWith("data:image/svg+xml;base64,")).toBe(true);
        expect(Buffer.from(icon.slice(icon.indexOf(",") + 1), "base64").toString("utf8")).toContain(mdiHeadphones);
        for (const style of ["ring", "pie", "open"] as OutputStyle[]) {
            expect(svg(renderOutputStrip({ ...view, style, icon }))).toContain("<image");
            expect(svg(renderOutputStrip({ ...view, style }))).not.toContain("<image");
        }
    });
});
