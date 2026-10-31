#!/usr/bin/env node
/**
 * Refresh the Bilibili snapshot used by the moments page.
 *
 * The browser cannot read Bilibili at all (no CORS header, and the API answers
 * 403 to a request that carries `Origin`), and a Cloudflare Worker cannot reach
 * it either — every bilibili.com host answers 412 to data-centre addresses. So
 * the one place that *can* ask is this machine, at build time.
 *
 * Runs automatically as `prebuild`, so the numbers are as new as the deploy:
 *
 *   node scripts/refresh-bilibili.mjs            # only missing / stale entries
 *   node scripts/refresh-bilibili.mjs --force    # refetch everything
 *
 * On a network failure the previous snapshot is kept and the build continues —
 * stale numbers beat a broken build.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "src", "lib", "bilibili-snapshot.json");
const CONTENT_DIRS = ["content/pages", "content/posts"];
const LINK = /\((Bilibili:(?:BV[0-9A-Za-z]+|av\d+))\)/g;
const STALE_AFTER_MS = 1000 * 60 * 60 * 24;
const FORCE = process.argv.includes("--force");
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function readSnapshot() {
    if (!existsSync(SNAPSHOT)) return {};
    try {
        return JSON.parse(readFileSync(SNAPSHOT, "utf8"));
    } catch {
        return {};
    }
}

function collectIds() {
    const ids = new Set();
    for (const dir of CONTENT_DIRS) {
        const absolute = path.join(ROOT, dir);
        if (!existsSync(absolute)) continue;
        for (const name of readdirSync(absolute)) {
            if (!name.endsWith(".md")) continue;
            const text = readFileSync(path.join(absolute, name), "utf8");
            for (const match of text.matchAll(LINK)) ids.add(match[1].slice("Bilibili:".length));
        }
    }
    return [...ids].sort();
}

async function fetchOne(id) {
    const query = /^av\d+$/i.test(id) ? `aid=${id.slice(2)}` : `bvid=${id}`;
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?${query}`, {
        headers: {
            "User-Agent": UA,
            Referer: "https://www.bilibili.com/",
            Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.code !== 0) throw new Error(`code ${payload.code}: ${payload.message}`);

    const { data } = payload;
    return {
        title: data.title,
        cover: String(data.pic || "").replace(/^http:\/\//, "https://"),
        views: data.stat.view,
        likes: data.stat.like,
        danmu: data.stat.danmaku,
        fetchedAt: new Date().toISOString(),
    };
}

const ids = collectIds();
const snapshot = readSnapshot();
let fetched = 0;
let kept = 0;

for (const id of ids) {
    const known = snapshot[id];
    const fresh = known && Date.now() - Date.parse(known.fetchedAt || 0) < STALE_AFTER_MS;
    if (fresh && !FORCE) {
        kept += 1;
        continue;
    }
    try {
        snapshot[id] = await fetchOne(id);
        fetched += 1;
        console.log(`[bilibili] ${id} → ${snapshot[id].title}`);
    } catch (error) {
        kept += 1;
        console.warn(`[bilibili] ${id} failed (${error.message}), keeping the previous values`);
    }
    // Politeness: Bilibili risk control reacts to bursts.
    await new Promise((resolve) => setTimeout(resolve, 400));
}

for (const id of Object.keys(snapshot)) {
    if (!ids.includes(id)) {
        delete snapshot[id];
        console.log(`[bilibili] dropped ${id} (no longer linked)`);
    }
}

const ordered = Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(SNAPSHOT, `${JSON.stringify(ordered, null, 4)}\n`, "utf8");
console.log(`[bilibili] ${fetched} fetched, ${kept} kept, ${Object.keys(ordered).length} in the snapshot`);
