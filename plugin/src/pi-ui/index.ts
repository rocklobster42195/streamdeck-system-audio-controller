// Entry of the property inspector bundle (ui/pi.js): the kit's components. The same page runs as
// the short PI and, with "?window", as the settings window (the kit's src/pi/window.ts): sections
// with class "pi-win" show only there.
import { definePiComponents, initConditionalVisibility, initSettingsWindow, sd, settingsWindowShown, translateDom, type PiChoice, type PiChoiceOption } from "@rocklobster42195/streamdeck-kit/pi";
import { SacDuckPeers } from "./duck-peers";
import { mdiChartBar, mdiChartDonut, mdiCircleSlice3, mdiGauge } from "@mdi/js";

/** MDI paths for <pi-choice data-options='[{"icon":"…"}]'> tiles. */
const CHOICE_ICONS: Record<string, string> = { digital: mdiChartBar, classic: mdiGauge, ring: mdiChartDonut, pie: mdiCircleSlice3 };

sd.onReady(() => {
    translateDom();
    definePiComponents();
    if (!customElements.get("sac-duck-peers")) customElements.define("sac-duck-peers", SacDuckPeers);
    document.querySelectorAll<PiChoice & HTMLElement>("pi-choice[data-options]").forEach((el) => {
        const raw = JSON.parse(el.dataset.options ?? "[]") as PiChoiceOption[];
        el.options = raw.map((o) => ({ ...o, icon: o.icon ? CHOICE_ICONS[o.icon] : undefined }));
    });
    initConditionalVisibility();
    sd.sendToPlugin({ event: "pi-ready" });
    const version = document.querySelector<HTMLElement>("[data-plugin-version]");
    if (version) version.textContent = `SA-C ${sd.info?.plugin.version ?? ""}`.trim();
    document.body.hidden = false;
    settingsWindowShown();
});

initSettingsWindow({ name: "SA-C" });
