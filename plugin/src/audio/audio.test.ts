import { describe, expect, it } from "vitest";
import { LineParser } from "./helper";
import { stepVolume } from "./steps";

describe("LineParser", () => {
    it("parses complete lines, keeps a partial one for the next chunk, skips noise", () => {
        const p = new LineParser();
        expect(p.push('{"t":"ready"}\r\n{"t":"volume","v":0.4')).toEqual([{ t: "ready" }]);
        expect(p.push(',"muted":false}\nWARNING: something\n\n{"t":"meter","l":-20.5,"r":-21}\n')).toEqual([
            { t: "volume", v: 0.4, muted: false },
            { t: "meter", l: -20.5, r: -21 },
        ]);
    });
});

describe("stepVolume", () => {
    it("steps in percent and stays within 0..1", () => {
        expect(stepVolume(0.24, 1, undefined)).toBe(0.26);
        expect(stepVolume(0.24, -3, 5)).toBe(0.09);
        expect(stepVolume(0.99, 4, 2)).toBe(1);
        expect(stepVolume(0.01, -1, 2)).toBe(0);
        expect(stepVolume(0.5, 1, 50)).toBe(0.6);
    });
});
