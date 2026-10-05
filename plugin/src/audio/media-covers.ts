// Covers of Windows' media sessions, for other plugins too: deckbus players carry a cover URL that
// this computer can load (the kit's loadCover fetches it), so SA-C serves the covers the helper
// read on 127.0.0.1, on a port the system picks. Kept in memory; the newest few stay.
import http from "node:http";
import type { AddressInfo } from "node:net";

/** How many covers stay (a few tracks back, for keys that still show the last one). */
const KEEP = 16;

type Cover = { type: string; bytes: Buffer; rgb?: [number, number, number] };

export class MediaCovers {
    private readonly covers = new Map<string, Cover>();
    private server: http.Server | undefined;
    private port = 0;
    private starting: Promise<void> | undefined;

    constructor(private readonly log: { warn(m: string): void } = console) {}

    /** A cover from the helper (base64); serving starts with the first one. */
    add(key: string, type: string, data: string, rgb?: [number, number, number]): Promise<void> {
        this.covers.delete(key);
        this.covers.set(key, { type: type.startsWith("image/") ? type : "image/jpeg", bytes: Buffer.from(data, "base64"), rgb });
        while (this.covers.size > KEEP) this.covers.delete(this.covers.keys().next().value!);
        return this.start();
    }

    has(key: string | undefined): boolean {
        return !!key && this.covers.has(key);
    }

    /** The cover's URL, once the server runs. */
    url(key: string | undefined): string | undefined {
        return key && this.port && this.covers.has(key) ? `http://127.0.0.1:${this.port}/cover/${key}` : undefined;
    }

    /** The cover's accent colour as the helper measured it. */
    rgb(key: string | undefined): [number, number, number] | undefined {
        return key ? this.covers.get(key)?.rgb : undefined;
    }

    stop(): void {
        this.server?.close();
        this.server = undefined;
        this.starting = undefined;
        this.port = 0;
    }

    private start(): Promise<void> {
        this.starting ??= new Promise<void>((resolve) => {
            const server = http.createServer((req, res) => {
                const key = /^\/cover\/([0-9a-f]+)$/.exec(req.url ?? "")?.[1];
                const cover = key ? this.covers.get(key) : undefined;
                if (req.method !== "GET" || !cover) {
                    res.writeHead(404).end();
                    return;
                }
                // A key names one image's content, so it never changes
                res.writeHead(200, { "content-type": cover.type, "content-length": cover.bytes.length, "cache-control": "max-age=86400, immutable" });
                res.end(cover.bytes);
            });
            server.on("error", (e) => {
                this.log.warn(`[covers] ${e.message}`);
                resolve();
            });
            server.listen(0, "127.0.0.1", () => {
                this.port = (server.address() as AddressInfo).port;
                resolve();
            });
            this.server = server;
        });
        return this.starting;
    }
}
