/**
 * Which URLs count as shareable media, and how to read an id out of each one.
 *
 * Kept free of any file-system or network access so three callers share one
 * parser: the build (`media.js`), the Cloudflare Worker in `worker/` and the unit
 * checks in `scripts/test-media.mjs` — copies would drift the moment a provider
 * changes its URL shape.
 */

/**
 * Every provider we recognise. `parse(url)` returns the id the worker is asked
 * for, or null when the URL is not this provider's shape.
 */
export const PROVIDERS = {
    bilibili: {
        kind: "video",
        label: "Bilibili",
        hosts: ["bilibili.com", "m.bilibili.com", "b23.tv"],
        parse(url) {
            // b23.tv is a redirector; the short code is all we can see offline.
            if (url.hostname === "b23.tv") {
                const code = url.pathname.replace(/^\/+|\/+$/g, "");
                return code ? { id: `short/${code}` } : null;
            }
            const match = /\/video\/((?:BV[0-9A-Za-z]+)|(?:av\d+))/i.exec(url.pathname);
            return match ? { id: match[1] } : null;
        },
    },
    youtube: {
        kind: "video",
        label: "YouTube",
        hosts: ["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"],
        parse(url) {
            if (url.hostname === "youtu.be") {
                const id = url.pathname.replace(/^\/+|\/+$/g, "");
                return id ? { id } : null;
            }
            const fromQuery = url.searchParams.get("v");
            if (fromQuery) return { id: fromQuery };
            const match = /^\/(?:shorts|embed|live)\/([0-9A-Za-z_-]+)/.exec(url.pathname);
            return match ? { id: match[1] } : null;
        },
    },
    netease: {
        kind: "music",
        label: "网易云音乐",
        hosts: ["music.163.com", "y.music.163.com"],
        parse(url) {
            const match = /[?&#]id=(\d+)/.exec(url.search + url.hash);
            return match ? { id: match[1] } : null;
        },
    },
    qqmusic: {
        kind: "music",
        label: "QQ音乐",
        hosts: ["y.qq.com", "i.y.qq.com"],
        parse(url) {
            const fromPath = /\/songDetail\/([0-9A-Za-z]+)/.exec(url.pathname);
            if (fromPath) return { id: fromPath[1] };
            const fromQuery = /[?&]songmid=([0-9A-Za-z]+)/.exec(url.search);
            return fromQuery ? { id: fromQuery[1] } : null;
        },
    },
    kugou: {
        kind: "music",
        label: "酷狗音乐",
        hosts: ["kugou.com", "m.kugou.com", "www.kugou.com"],
        parse(url) {
            const mix = /\/mixsong\/([0-9A-Za-z]+)\.html/.exec(url.pathname);
            if (mix) return { id: `mix/${mix[1]}` };
            const hash = /[?&#]hash=([0-9A-Za-z]+)/.exec(url.search + url.hash);
            return hash ? { id: `hash/${hash[1]}` } : null;
        },
    },
    spotify: {
        kind: "music",
        label: "Spotify",
        hosts: ["open.spotify.com"],
        parse(url) {
            const match = /^\/track\/([0-9A-Za-z]+)/.exec(url.pathname);
            return match ? { id: match[1] } : null;
        },
    },
};

function providerOf(hostname) {
    const host = hostname.replace(/^www\./, "");
    for (const [name, provider] of Object.entries(PROVIDERS)) {
        if (provider.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) {
            return [name, provider];
        }
    }
    return null;
}

/** `https://…` → `{ provider, kind, id, key, url, label }`, or null for anything else. */
export function parseMediaUrl(href) {
    let url;
    try {
        url = new URL(href);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const found = providerOf(url.hostname);
    if (!found) return null;

    const [provider, definition] = found;
    const parsed = definition.parse(url);
    if (!parsed) return null;

    return {
        url: url.href,
        provider,
        kind: definition.kind,
        label: definition.label,
        id: parsed.id,
        key: `${provider}:${parsed.id}`,
    };
}

/**
 * Videos are written the way posts embed them — a scheme prefix and the bare id,
 * no URL at all. The id shapes are exactly what the post renderer accepts, so a
 * link can be copied from a post into a moment unchanged:
 *
 *   Bilibili:BV1xx411c7mD
 *   YouTube:dQw4w9WgXcQ
 *
 * Everything else (music included) stays a plain URL.
 */
const SCHEMES = {
    bilibili: {
        id: /^BV[0-9A-Za-z]+$/,
        url: (id) => `https://www.bilibili.com/video/${id}`,
    },
    youtube: {
        id: /^[0-9A-Za-z_-]+$/,
        url: (id) => `https://www.youtube.com/watch?v=${id}`,
    },
};

/**
 * Parse a link target written in either form. `source` records which one, so the
 * caller can insist on `scheme` for video and `url` for music.
 */
export function parseMediaLink(target) {
    const scheme = /^(Bilibili|YouTube):(.+)$/i.exec(target);
    if (scheme) {
        const provider = scheme[1].toLowerCase();
        const id = scheme[2];
        const definition = PROVIDERS[provider];
        if (!SCHEMES[provider].id.test(id)) return null;
        return {
            url: SCHEMES[provider].url(id),
            provider,
            kind: definition.kind,
            label: definition.label,
            id,
            key: `${provider}:${id}`,
            source: "scheme",
        };
    }

    const parsed = parseMediaUrl(target);
    return parsed ? { ...parsed, source: "url" } : null;
}

/**
 * The one rule that decides whether a link becomes a card in a moment: a video
 * only in the `Bilibili:`/`YouTube:` form, music only as a real URL. Writing the
 * other way round is treated as an ordinary link, which is the visible way to
 * say "no card here".
 */
export function parseMediaCardLink(target) {
    const parsed = parseMediaLink(target);
    if (!parsed) return null;
    if (parsed.kind === "video" && parsed.source !== "scheme") return null;
    if (parsed.kind === "music" && parsed.source !== "url") return null;
    return parsed;
}

/**
 * `1234` → `1.2k`. Compact units with no trailing `.0`, so a row of counts reads
 * evenly: 100 / 1.2k / 12k / 1.2m.
 */
export function formatCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return "";

    const trim = (text) => text.replace(/\.0$/, "");
    if (count < 1000) return String(Math.round(count));
    if (count < 10000) return `${trim((count / 1000).toFixed(1))}k`;
    if (count < 1000000) return `${Math.round(count / 1000)}k`;
    return `${trim((count / 1000000).toFixed(1))}m`;
}
