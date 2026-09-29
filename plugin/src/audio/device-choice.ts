// The Device key's choice: one device (press makes it the default) or two (press switches).

export type DeviceChoice = {
    device?: string;
    deviceName?: string;
    /** Optional second device: the key switches between the two. */
    device2?: string;
    device2Name?: string;
};

/** The device the key shows: with two, the one that is the default now (else the first). */
export function shownDevice(s: DeviceChoice, defaultId: string | undefined): { id: string; name: string } | undefined {
    if (!s.device) return undefined;
    if (s.device2 && defaultId === s.device2) return { id: s.device2, name: s.device2Name || s.device2 };
    return { id: s.device, name: s.deviceName || s.device };
}

/** The device a press makes the default. */
export function nextDevice(s: DeviceChoice, defaultId: string | undefined): string | undefined {
    if (!s.device) return undefined;
    if (!s.device2) return s.device;
    return defaultId === s.device ? s.device2 : s.device;
}
