// <sac-duck-peers>: one switch per plugin on deckbus, "may lower the volume". The plugin pushes the
// list ("duck-peers"); a switch writes the global setting duckPeers { id: name }. Off by default.
import { escapeHtml, sd, t } from "@rocklobster42195/streamdeck-kit/pi";

type Row = { id: string; name: string; online: boolean; allowed: boolean };

export class SacDuckPeers extends HTMLElement {
    private rows: Row[] = [];
    private off?: () => void;

    connectedCallback(): void {
        this.off = sd.onMessage((msg: { event?: string; peers?: Row[] }) => {
            if (msg?.event !== "duck-peers" || !Array.isArray(msg.peers)) return;
            this.rows = msg.peers;
            this.render();
        });
        this.render();
    }

    disconnectedCallback(): void {
        this.off?.();
    }

    private render(): void {
        if (!this.rows.length) {
            this.innerHTML = `<div class="pi-row"><span class="pi-hint">${escapeHtml(t("pi.duck_none"))}</span></div>`;
            return;
        }
        this.innerHTML = this.rows
            .map(
                (r) => `
            <div class="pi-row">
                <div class="pi-row-text">
                    <span class="pi-label">${escapeHtml(r.name)}</span>
                    ${r.online ? "" : `<span class="pi-hint">${escapeHtml(t("pi.duck_away"))}</span>`}
                </div>
                <button type="button" class="pi-switch" data-id="${escapeHtml(r.id)}" aria-pressed="${r.allowed}" aria-label="${escapeHtml(r.name)}"><span class="pi-switch-knob"></span></button>
            </div>`,
            )
            .join("");
        this.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((button) =>
            button.addEventListener("click", () => this.toggle(button.dataset.id ?? "")),
        );
    }

    private toggle(id: string): void {
        const row = this.rows.find((r) => r.id === id);
        if (!row) return;
        const current = sd.globalSettings.duckPeers;
        const next: Record<string, string> = current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, string>) } : {};
        if (row.allowed) delete next[id];
        else next[id] = row.name;
        row.allowed = !row.allowed;
        sd.setGlobalSetting("duckPeers", next);
        // An allowed plugin that is away disappears once it is no longer allowed
        if (!row.online && !row.allowed) this.rows = this.rows.filter((r) => r !== row);
        this.render();
    }
}
