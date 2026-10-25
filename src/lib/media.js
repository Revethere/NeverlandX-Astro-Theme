/**
 * Media links in a moment — a Bilibili/YouTube video or a track from one of the
 * four streaming services, shown as a compact link card.
 *
 * Metadata (title, cover, play counts) cannot be fetched in the browser: the
 * Bilibili API sends no CORS header, YouTube's needs a key that would sit in the
 * page, and the music services have no public API at all. So it is fetched once
 * at authoring time by `npm run media` and cached in content/data/media.json.
 * The build only reads that cache, which keeps `npm run build` offline and
 * deterministic: an uncached link still renders, it just shows less.
 */
import { readFileSync } from "node:fs";
import { formatCount, parseMediaCardLink } from "./media-providers.js";

/**
 * Read the cache, not `import … with { type: "json" }`, so plain Node can load
 * this module for the unit checks. The path has to be resolved twice because the
 * build bundles this file into dist/.prerender/chunks/, where `import.meta.url`
 * no longer points at the project: the working directory does.
 */
function readCache() {
    const candidates = [
        new URL("content/data/media.json", `file:///${process.cwd().replace(/\\/g, "/")}/`),
        new URL("../../content/data/media.json", import.meta.url),
    ];

    for (const candidate of candidates) {
        try {
            return JSON.parse(readFileSync(candidate, "utf8"));
        } catch {
            // try the next location; an absent cache just means "no metadata".
        }
    }
    return {};
}

const cache = readCache();

// A link the cache has never seen still renders, but it is worth saying so once
// per build instead of leaving the author to wonder where the title went.
const warned = new Set();

/** Play counts for a video card, in the order they read best. */
function statsLine(entry) {
    return [
        [entry.views, "views"],
        [entry.likes, "likes"],
        [entry.danmu, "danmu"],
    ]
        .map(([value, label]) => (formatCount(value) ? `${formatCount(value)} ${label}` : ""))
        .filter(Boolean)
        .join(" · ");
}

/**
 * The card for one link: what the cache knows, patched up with what the URL and
 * the author's own link text already say. `title` always exists; `cover` may be
 * empty and the component draws a placeholder then.
 *
 * The small line under the title prints play counts for a video and the service
 * name for a track. A video whose service exposes no counts (YouTube without a
 * key) falls back to the service name too, so the line is never blank.
 */
export function mediaCard(href, linkText = "") {
    const parsed = parseMediaCardLink(href);
    if (!parsed) return null;

    const cached = cache[parsed.key] || {};
    // A `skipped` entry means the service has no metadata to give, which is
    // expected and not worth a warning; a missing entry means "run npm run media".
    // Only speak up during a production build, so the unit checks stay quiet.
    if (!cache[parsed.key] && !warned.has(parsed.key) && import.meta.env?.PROD) {
        warned.add(parsed.key);
        console.warn(`[media] no cached metadata for ${parsed.key} — run \`npm run media\``);
    }
    // A bare YouTube id gives a cover with no API call at all, so that one works
    // even for a link the cache has never seen.
    const fallbackCover =
        parsed.provider === "youtube" ? `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg` : "";

    const stats = parsed.kind === "video" ? statsLine(cached) : "";
    // Nothing cached and no link text: say what it is rather than print a bare
    // service name twice, since the metadata line already carries that.
    const fallbackTitle = parsed.kind === "music" ? "分享的音乐" : "分享的视频";

    return {
        href: parsed.url,
        kind: parsed.kind,
        provider: parsed.provider,
        // Author's own link text wins: writing `[短标题](url)` is a deliberate
        // act, so it should override whatever the service calls the thing.
        title: linkText.trim() || cached.title || fallbackTitle,
        cover: cached.cover || fallbackCover,
        meta: parsed.kind === "music" ? parsed.label : stats || parsed.label,
    };
}
