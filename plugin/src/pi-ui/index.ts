// Entry of the property inspector bundle (ui/pi.js): the kit's components.
import { definePiComponents, initConditionalVisibility, sd, translateDom, type PiChoice, type PiChoiceOption } from "@rocklobster42195/streamdeck-kit/pi";
import { mdiChartBar, mdiChartDonut, mdiCircleSlice3, mdiGauge } from "@mdi/js";

/** MDI paths for <pi-choice data-options='[{"icon":"…"}]'> tiles. */
const CHOICE_ICONS: Record<string, string> = { digital: mdiChartBar, classic: mdiGauge, ring: mdiChartDonut, pie: mdiCircleSlice3 };

sd.onReady(() => {
    translateDom();
    definePiComponents();
    document.querySelectorAll<PiChoice & HTMLElement>("pi-choice[data-options]").forEach((el) => {
        const raw = JSON.parse(el.dataset.options ?? "[]") as PiChoiceOption[];
        el.options = raw.map((o) => ({ ...o, icon: o.icon ? CHOICE_ICONS[o.icon] : undefined }));
    });
    initConditionalVisibility();
    sd.sendToPlugin({ event: "pi-ready" });
    const version = document.querySelector<HTMLElement>("[data-plugin-version]");
    if (version) version.textContent = `SA-C ${sd.info?.plugin.version ?? ""}`.trim();
    document.body.hidden = false;
});
