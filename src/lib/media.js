/**
 * Media links in a moment — a Bilibili/YouTube video or a track from one of the
 * four streaming services, shown as a compact link card.
 *
 * The build knows almost no metadata: it renders the author's link text (or a
 * generic placeholder), the service name and an icon tile, and
 * `public/js/lib/media-cards.js` fills in the cover, the real title and the
 * counts in the browser on every page load — through the optional worker in
 * `worker/` or, for YouTube and Spotify, straight from their oEmbed endpoints.
 *
 * Bilibili is the exception and the reason this file still reads a file at all:
 * neither the browser (no CORS) nor a Cloudflare Worker (every bilibili.com host
 * answers 412 to data-centre addresses) can ask it, so
 * `scripts/refresh-bilibili.mjs` snapshots the numbers at build time and the card
 * is rendered complete instead of degrading. See `src/lib/bilibili-snapshot.json`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatCount, parseMediaCardLink } from "./media-providers.js";

/** Nothing fetched yet: the card still needs a title, so name the shape. */
function placeholderTitle(kind) {
    return kind === "music" ? "分享的音乐" : "分享的视频";
}

let snapshotCache;

/**
 * The build-time Bilibili snapshot, read once. Missing file ⇒ empty.
 *
 * Three candidate locations because the same module runs in three places: the
 * Astro build (bundled into `dist/.prerender`, so the repo-relative path via
 * `process.cwd()` is the one that works), plain Node for the unit checks, and
 * Vite's dev server.
 */
function bilibiliSnapshot() {
    if (snapshotCache) return snapshotCache;
    snapshotCache = {};
    for (const candidate of [
        path.join(process.cwd(), "src", "lib", "bilibili-snapshot.json"),
        fileURLToPath(new URL("./bilibili-snapshot.json", import.meta.url)),
        fileURLToPath(new URL("../../src/lib/bilibili-snapshot.json", import.meta.url)),
    ]) {
        try {
            snapshotCache = JSON.parse(readFileSync(candidate, "utf8"));
            break;
        } catch {
            // try the next location
        }
    }
    return snapshotCache;
}

/** `107.6m views · 3m likes · 151k danmu`, skipping whatever is unknown. */
function videoMeta(data) {
    return [
        [data.views, "views"],
        [data.likes, "likes"],
        [data.danmu, "danmu"],
    ]
        .map(([value, label]) => (formatCount(value) ? `${formatCount(value)} ${label}` : ""))
        .filter(Boolean)
        .join(" · ");
}

/**
 * The card for one link, as far as the build can know it.
 *
 * `titleIsFallback` tells the client script whether it may replace the title: an
 * author who wrote `[短标题](url)` meant it, while `[](url)` only got a stand-in.
 * `static` marks a card the browser must not try to refresh (Bilibili).
 */
export function mediaCard(href, linkText = "") {
    const parsed = parseMediaCardLink(href);
    if (!parsed) return null;

    const written = linkText.trim();
    const snapshot = parsed.provider === "bilibili" ? bilibiliSnapshot()[parsed.id] : undefined;

    // YouTube's thumbnail is a URL built from the id alone, so it can be drawn
    // before any metadata arrives; every other service needs the request.
    const knownCover =
        snapshot?.cover ||
        (parsed.provider === "youtube" && !parsed.id.startsWith("short/")
            ? `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`
            : "");

    return {
        href: parsed.url,
        kind: parsed.kind,
        provider: parsed.provider,
        label: parsed.label,
        id: parsed.id,
        title: written || snapshot?.title || placeholderTitle(parsed.kind),
        titleIsFallback: !written && !snapshot?.title,
        cover: knownCover,
        // The service name, replaced by the counts (video) or the artist (music)
        // once the browser has fetched them; Bilibili ships them already.
        meta: (snapshot && videoMeta(snapshot)) || parsed.label,
        static: Boolean(snapshot),
    };
}
