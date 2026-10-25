/**
 * Fetch the metadata behind the media links on the Moments page and cache it in
 * content/data/media.json.
 *
 *   npm run media            # only new or changed links
 *   npm run media -- --force # refetch everything
 *
 * The build never calls this: it reads the cache, so `npm run build` stays stable
 * and works offline. Which means a freshly pasted link renders with whatever the
 * markdown itself says until this script has seen it — that is the trade for not
 * putting a key in the page or depending on an API at deploy time.
 *
 * Kugou has no public metadata endpoint (its pages are script-rendered), so its
 * entries are cached as "no metadata" and the card falls back to the link text.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseMediaCardLink } from "../src/lib/media-providers.js";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PAGES = join(ROOT, "content", "pages");
const CACHE_FILE = join(ROOT, "content", "data", "media.json");

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const force = process.argv.includes("--force");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, referer) {
    const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...(referer && { Referer: referer }) },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

const https = (url) => (url ? String(url).replace(/^http:\/\//, "https://") : "");

/** Bilibili: /x/web-interface/view gives title, cover and the three counters. */
async function bilibili(id) {
    let bvid = id;

    // b23.tv short links have to be resolved before the API can be asked.
    if (id.startsWith("short/")) {
        const response = await fetch(`https://b23.tv/${id.slice("short/".length)}`, {
            headers: { "User-Agent": UA },
            redirect: "follow",
            signal: AbortSignal.timeout(15000),
        });
        const match = /\/video\/((?:BV[0-9A-Za-z]+)|(?:av\d+))/.exec(new URL(response.url).pathname);
        if (!match) throw new Error("could not resolve the short link");
        bvid = match[1];
    }

    const query = /^av\d+$/i.test(bvid) ? `aid=${bvid.slice(2)}` : `bvid=${bvid}`;
    const payload = await getJson(
        `https://api.bilibili.com/x/web-interface/view?${query}`,
        "https://www.bilibili.com/",
    );
    if (payload.code !== 0) throw new Error(`bilibili code ${payload.code}: ${payload.message}`);

    const { data } = payload;
    return {
        title: data.title,
        cover: https(data.pic),
        views: data.stat.view,
        likes: data.stat.like,
        danmu: data.stat.danmaku,
    };
}

/** YouTube: oEmbed needs no key and gives the title; the id gives the thumbnail. */
async function youtube(id) {
    const payload = await getJson(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
    );
    return { title: payload.title, cover: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
}

/** NetEase: the old detail endpoint still answers without a login. */
async function netease(id) {
    const payload = await getJson(
        `https://music.163.com/api/song/detail?ids=[${id}]`,
        "https://music.163.com/",
    );
    const song = payload.songs?.[0];
    if (!song) throw new Error("no song in the response");
    return {
        title: song.name,
        artist: (song.artists || []).map((item) => item.name).join(" / "),
        cover: https(unescapeHtml(song.album?.picUrl)),
    };
}

/** QQ Music: the legacy single-song endpoint, cover built from the album mid. */
async function qqmusic(mid) {
    const payload = await getJson(
        `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${mid}&format=json&platform=yqq`,
        "https://y.qq.com/",
    );
    const song = payload.data?.[0];
    if (!song) throw new Error("no song in the response");
    const albumMid = song.album?.mid;
    return {
        title: song.title || song.name,
        artist: (song.singer || []).map((item) => item.name).join(" / "),
        cover: albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg` : "",
    };
}

/** Spotify: oEmbed only, which is all a link card needs. */
async function spotify(id) {
    const payload = await getJson(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`,
    );
    return { title: payload.title, cover: payload.thumbnail_url };
}

/** Kugou exposes nothing public, so the entry records why it is empty. */
async function kugou() {
    return { title: "", cover: "", skipped: "no public metadata endpoint" };
}

const FETCHERS = { bilibili, youtube, netease, qqmusic, spotify, kugou };

function unescapeHtml(text) {
    return String(text ?? "")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

/** Every card link that appears in content/pages/*.md, in either accepted form. */
function collectLinks() {
    const links = new Map();

    for (const file of readdirSync(PAGES)) {
        if (!file.endsWith(".md")) continue;
        const body = readFileSync(join(PAGES, file), "utf8");
        // Only `[text](target)` can become a card, so only those targets matter —
        // scanning every URL would fetch metadata for links that never render.
        for (const match of body.matchAll(/\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g)) {
            const parsed = parseMediaCardLink(match[1]);
            if (parsed) links.set(parsed.key, parsed);
        }
    }

    return links;
}

const existing = (() => {
    try {
        return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    } catch {
        return {};
    }
})();

const links = collectLinks();
const cache = {};
let fetched = 0;
let failed = 0;

for (const [key, parsed] of [...links].sort(([a], [b]) => a.localeCompare(b))) {
    const previous = existing[key];

    if (previous && !force && !previous.skipped) {
        cache[key] = previous;
        continue;
    }

    const fetcher = FETCHERS[parsed.provider];
    try {
        await sleep(250);
        const metadata = await fetcher(parsed.id);
        cache[key] = { ...metadata, fetchedAt: new Date().toISOString() };
        fetched += 1;
        console.log(`  ok    ${key}  →  ${metadata.title || "(no title)"}`);
    } catch (error) {
        failed += 1;
        console.warn(`  fail  ${key}  →  ${error.message}`);
        // Keep a failed entry out of the cache so the next run retries it, but do
        // not lose a title that a previous run already had.
        if (previous) cache[key] = previous;
    }
}

mkdirSync(join(ROOT, "content", "data"), { recursive: true });
writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 4)}\n`);

console.log(
    `\n${links.size} media link(s): ${fetched} fetched, ${Object.keys(cache).length} cached` +
        (failed ? `, ${failed} failed` : "") +
        `\n→ ${CACHE_FILE}`,
);
