// Whether the computer is in a call (SA-C grill 2026-10-05, Q3), for other plugins on deckbus:
// MA-C and SO-C can pause or duck music, HA-C can make it an entity. Mainly from Windows' ducking
// notification (a communications stream: Teams, Discord, Zoom …, named by the helper); as a
// fallback, a known call app using the mic (for systems where Windows sends no such notification).
// A call ends only after a short quiet time, so a brief gap doesn't end and start it again.

export type AppRef = { app: string; name: string };
export type Call = AppRef & { since: number };

/** Apps whose use of the mic means a call (process names, lower case). */
export const CALL_APPS: readonly string[] = ["ms-teams", "teams", "discord", "zoom", "slack", "skype", "webex", "ciscocollabhost", "signal", "whatsapp", "telegram"];

/** How long a call stays after its last signal. */
export const CALL_END_MS = 2000;

/** The call app right now: a ducking app first, else a known call app on the mic. */
export function callApp(ducking: readonly AppRef[], micUsers: readonly AppRef[]): AppRef | undefined {
    return ducking[0] ?? micUsers.find((u) => CALL_APPS.includes(u.app));
}

export class CallTracker {
    private current: Call | undefined;
    private endTimer: ReturnType<typeof setTimeout> | undefined;

    /** `changed`: told when a call starts or ends (also when the end comes after the quiet time). */
    constructor(private readonly changed: () => void) {}

    get call(): Call | undefined {
        return this.current;
    }

    /** The latest signals; call whenever they may have changed. */
    update(ducking: readonly AppRef[], micUsers: readonly AppRef[], now = Date.now()): void {
        const app = callApp(ducking, micUsers);
        if (app) {
            clearTimeout(this.endTimer);
            this.endTimer = undefined;
            if (!this.current) {
                this.current = { ...app, since: now };
                this.changed();
            }
            return;
        }
        if (!this.current || this.endTimer) return;
        this.endTimer = setTimeout(() => {
            this.endTimer = undefined;
            this.current = undefined;
            this.changed();
        }, CALL_END_MS);
    }

    /** Ends at once (the helper stopped). */
    reset(): void {
        clearTimeout(this.endTimer);
        this.endTimer = undefined;
        if (!this.current) return;
        this.current = undefined;
        this.changed();
    }
}
