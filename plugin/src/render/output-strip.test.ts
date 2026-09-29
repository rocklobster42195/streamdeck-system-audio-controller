import { describe, expect, it } from "vitest";
import { renderOutputMessage, renderOutputStrip, type OutputStyle } from "./output-strip";

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
    it("draws the not-ready messages", () => {
        expect(svg(renderOutputMessage("unsupported", "Windows only", "later"))).toContain("Windows only");
    });
});
