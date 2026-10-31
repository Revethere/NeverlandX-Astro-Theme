/**
 * NeverlandX media card proxy — a Cloudflare Worker that answers one question per
 * card, so the browser can read metadata that its own CORS rules would block:
 *
 *   GET /?p=bilibili&id=BV1GJ411x7h7
 *   → { title, cover, views, likes, danmu }
 *
 * Why a proxy exists at all: Bilibili's API answers 403 when a request carries an
 * `Origin` header, NetEase and QQ Music send no `Access-Control-Allow-Origin`, and
 * none of them offer JSONP. YouTube and Spotify oEmbed do allow browsers, so the
 * page works without this worker — it just cannot show anything for the others.
 *
 * Deployment: see worker/README.md. The Worker name and route are yours; the only
 * contract is that `?p=<provider>&id=<id>` returns JSON with an
 * `Access-Control-Allow-Origin: *` header.
 */
import { formatCount } from "../src/lib/media-providers.js";

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** How long an answer is reused before going back to the source, in seconds. */
const TTL = 3600;

/**
 * The only providers this worker will talk to, with the shape their id must have.
 * An allowlist rather than a free-form proxy: without it the endpoint would fetch
 * arbitrary URLs on anyone's behalf.
 */
const ALLOWED = {
    bilibili: /^(?:BV[0-9A-Za-z]+|av\d+|short\/[0-9A-Za-z]+)$/,
    youtube: /^[0-9A-Za-z_-]{6,20}$/,
    netease: /^\d{1,20}$/,
    qqmusic: /^[0-9A-Za-z]{8,20}$/,
    spotify: /^[0-9A-Za-z]{10,30}$/,
};

function cors(response) {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(response.body, { status: response.status, headers });
}

function json(payload, status = 200) {
    return cors(
        new Response(JSON.stringify(payload), {
            status,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": `public, max-age=${TTL}`,
            },
        }),
    );
}

const https = (url) => (url ? String(url).replace(/^http:\/\//, "https://") : "");

function unescapeHtml(text) {
    return String(text ?? "")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

async function getJson(url, referer, cookie) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": UA,
            Accept: "application/json",
            ...(referer && { Referer: referer }),
            ...(cookie && { Cookie: cookie }),
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * Bilibili answers 412 to data-centre addresses that arrive without a `buvid3`
 * cookie, which is exactly what a Worker looks like. Asking finger/spi for one
 * turns the same request into a normal browser-shaped visit.
 */
let buvidPromise;
function buvidCookie() {
    if (!buvidPromise) {
        buvidPromise = (async () => {
            try {
                const payload = await getJson(
                    "https://api.bilibili.com/x/frontend/finger/spi",
                    "https://www.bilibili.com/",
                );
                const b3 = payload?.data?.b_3;
                return b3 ? `buvid3=${b3}` : "";
            } catch {
                return "";
            }
        })();
    }
    return buvidPromise;
}

/** Last resort: the watch page still ships the numbers inside `__INITIAL_STATE__`. */
async function bilibiliFromPage(bvid, cookie) {
    const response = await fetch(`https://www.bilibili.com/video/${bvid}/`, {
        headers: {
            "User-Agent": UA,
            Referer: "https://www.bilibili.com/",
            ...(cookie && { Cookie: cookie }),
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const stat = /"stat":\{"view":(\d+),"danmaku":(\d+),"reply":\d+,"favorite":\d+,"coin":\d+,"share":\d+,"like":(\d+)/.exec(html);
    const pic = /"pic":"((?:https?:)?\/\/[^"]+)"/.exec(html);
    const title = /"title":"((?:[^"\\]|\\.)*)"/.exec(html);
    if (!stat || !pic) throw new Error("could not read the watch page");
    return {
        title: title ? JSON.parse(`"${title[1]}"`) : "",
        cover: https(pic[1]),
        views: Number(stat[1]),
        likes: Number(stat[3]),
        danmu: Number(stat[2]),
    };
}

async function bilibili(id) {
    let bvid = id;

    // b23.tv short links must be resolved before the view API can be asked.
    if (id.startsWith("short/")) {
        const response = await fetch(`https://b23.tv/${id.slice("short/".length)}`, {
            headers: { "User-Agent": UA },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
        });
        const match = /\/video\/((?:BV[0-9A-Za-z]+)|(?:av\d+))/.exec(new URL(response.url).pathname);
        if (!match) throw new Error("could not resolve the short link");
        bvid = match[1];
    }

    const query = /^av\d+$/i.test(bvid) ? `aid=${bvid.slice(2)}` : `bvid=${bvid}`;
    const cookie = await buvidCookie();
    try {
        const payload = await getJson(
            `https://api.bilibili.com/x/web-interface/view?${query}`,
            "https://www.bilibili.com/",
            cookie,
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
    } catch (error) {
        // Risk control on the API is common from Workers; the page still renders
        // the same numbers, so read them there before giving up.
        console.log(`bilibili api failed (${error.message}), reading the watch page`);
        return bilibiliFromPage(bvid, cookie);
    }
}

async function youtube(id) {
    const payload = await getJson(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
            `https://www.youtube.com/watch?v=${id}`,
        )}&format=json`,
    );
    return { title: payload.title, author: payload.author_name, cover: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
}

async function netease(id) {
    const payload = await getJson(
        `https://music.163.com/api/song/detail?ids=[${id}]`,
        "https://music.163.com/",
    );
    const song = payload.songs?.[0];
    if (!song) throw new Error("no song in the response");
    return {
        title: song.name,
        author: (song.artists || []).map((item) => item.name).join(" / "),
        cover: https(unescapeHtml(song.album?.picUrl)),
    };
}

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
        author: (song.singer || []).map((item) => item.name).join(" / "),
        cover: albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg` : "",
    };
}

async function spotify(id) {
    const payload = await getJson(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(
            `https://open.spotify.com/track/${id}`,
        )}`,
    );
    return { title: payload.title, author: payload.author_name, cover: payload.thumbnail_url };
}

const FETCHERS = { bilibili, youtube, netease, qqmusic, spotify };

/** The counts a video card prints, formatted here so the page needs no units. */
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

export default {
    async fetch(request, env, ctx) {        if (request.method === "OPTIONS") return json({ ok: true });
        if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

        const url = new URL(request.url);

        // A plain `/` is a health check, so a misspelt deployment is obvious.
        if (url.pathname !== "/" && url.pathname !== "") {
            return json({ error: "not found" }, 404);
        }

        const provider = url.searchParams.get("p") || "";
        const id = url.searchParams.get("id") || "";

        const allowed = ALLOWED[provider];
        if (!allowed) return json({ error: `unknown provider "${provider}"` }, 400);
        if (!allowed.test(id)) return json({ error: `bad id "${id}"` }, 400);

        const cacheKey = new Request(url.toString(), { method: "GET" });
        const cached = await caches.default.match(cacheKey);
        if (cached) return cached;

        try {
            const data = await FETCHERS[provider](id);
            const payload = {
                provider,
                id,
                title: data.title || "",
                author: data.author || "",
                cover: data.cover || "",
                views: data.views || 0,
                likes: data.likes || 0,
                danmu: data.danmu || 0,
                meta: provider === "youtube" || provider === "bilibili" ? videoMeta(data) : data.author || "",
            };
            const response = json(payload);
            ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
            return response;
        } catch (error) {
            // 502 rather than 500: the failure is upstream, and the page treats any
            // non-200 as "keep what the markdown already said".
            return json({ error: String(error && error.message ? error.message : error) }, 502);
        }
    },
};
