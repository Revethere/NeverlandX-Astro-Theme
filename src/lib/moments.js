/**
 * Moments — a WeChat-style stream, built from content/pages/moments.md.
 *
 * The file is a run of `## <date> <time>` sections, the same shape Logs uses,
 * because that keeps authoring to "append a section and write" instead of
 * opening a new file per thought. Everything above the first `## ` is ignored,
 * so a comment block at the top can document the syntax.
 *
 * Inside a section:
 *
 *   ## 2026-10-22 15:30
 *   > 上海 · 徐汇          ← optional location, printed next to the time
 *
 *   正文第一段。
 *
 *   ![说明](https://cdn.example/photo.webp)
 *   ![说明](https://cdn.example/photo-2.webp)
 *
 *   正文第二段。
 *
 * A run of image lines with nothing else in between becomes one gallery, and the
 * number of images in that run decides its shape (see columnsFor). Images that
 * sit inside a paragraph stay inline and are left to the markdown renderer.
 *
 * A markdown link alone on its own line becomes a media card. Videos are written
 * with the same scheme the posts use to embed them, music as an ordinary URL:
 *
 *   [视频标题](Bilibili:BV1xx411c7mD)
 *   [视频标题](YouTube:dQw4w9WgXcQ)
 *   [歌名](https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC)
 *
 * Those are the only accepted shapes — a bare URL, or a Bilibili/YouTube URL
 * inside the brackets, stays a plain link. The link text is optional for video
 * (the cached title is used when it is empty) and always used for music.
 */
import { renderMarkdown } from "./markdown.js";
import { mediaCard } from "./media.js";

const IMAGE_LINE = /^!\[([^\]]*)\]\((.*)\)$/;
// A markdown link that is the whole line: [text](target). Nothing else counts.
const MEDIA_LINK = /^\[([^\]]*)\]\(\s*([^)\s]+)\s*\)$/;
// `![alt](src "title")` — the title is not part of the URL.
const TITLE_SUFFIX = /\s+["'][^"']*["']$/;

/**
 * The shape of an image run, following WeChat: one image keeps its own ratio,
 * two read 2-up, three read 3-up, four read as a 2×2 block, and five or more
 * fill rows of three. A single image is the only case that is not cropped.
 */
function columnsFor(count) {
    if (count === 2 || count === 4) return 2;
    return 3;
}

function toImage(line) {
    const match = IMAGE_LINE.exec(line);
    if (!match) return null;
    const src = match[2].replace(TITLE_SUFFIX, "").trim();
    if (!src) return null;
    return { alt: match[1], src };
}

function toMedia(line) {
    const match = MEDIA_LINK.exec(line);
    if (!match) return null;
    const [, text = "", target = ""] = match;
    // mediaCard returns null for anything that is not an accepted card link, so
    // an ordinary link falls through to the markdown renderer untouched.
    return mediaCard(target, text);
}

/**
 * Split a section body into alternating text and gallery blocks, in source
 * order. Blank lines close whatever is open, which is what makes `text`,
 * `images`, `text` come out as three blocks rather than one.
 */
function parseBody(body) {
    const blocks = [];
    let text = [];
    let images = [];

    const flushText = () => {
        const markdown = text.join("\n").trim();
        text = [];
        if (markdown) blocks.push({ type: "markdown", html: renderMarkdown(markdown) });
    };

    const flushImages = () => {
        if (!images.length) return;
        blocks.push({
            type: "images",
            images,
            columns: columnsFor(images.length),
            single: images.length === 1,
        });
        images = [];
    };

    for (const line of body.split("\n")) {
        const trimmed = line.trim();

        if (!trimmed) {
            // A blank line ends a paragraph but not a gallery: images that sit
            // apart from each other but next to no other content are meant to be
            // one grid, which is how everyone writes them.
            flushText();
            continue;
        }

        const image = toImage(trimmed);
        if (image) {
            flushText();
            images.push(image);
            continue;
        }

        // A media link stands on its own: it closes whatever was open and does not
        // join the paragraph above it, the same way an image run does.
        const media = toMedia(trimmed);
        if (media) {
            flushImages();
            flushText();
            blocks.push({ type: "media", media });
            continue;
        }

        flushImages();
        text.push(line);
    }

    flushImages();
    flushText();

    return blocks;
}

const STAMP = /^(\d{2}|\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?$/;

/** English month abbreviations, shared by the entry stamps and the month index. */
export const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

export const monthLabel = (month) => MONTH_LABELS[Number(month) - 1] || String(month);

/**
 * `2026-10-22 15:30` → label `2026/10/22 15:30` (the sort key's human form) plus
 * `day`/`month`/`year` pieces for the printed stamp, an ISO string for the
 * `datetime` attribute and a timestamp for sorting. A two digit year is read as
 * 20xx, so `26-08-14 20:00` works the way Logs writes it. A heading that is not a
 * date is printed as-is and sorts last, so a typo costs the ordering rather than
 * the entry.
 */
function parseStamp(heading) {
    const match = STAMP.exec(heading);
    if (!match) return { label: heading, iso: undefined, ts: 0 };

    const [, year, month, day, hour, minute] = match;
    const y = year.length === 2 ? 2000 + Number(year) : Number(year);
    const m = Number(month);
    const d = Number(day);
    const pad = (value) => String(value).padStart(2, "0");
    const pieces = { day: String(d), month: monthLabel(m), year: String(y), clock: "" };

    if (hour === undefined) {
        return {
            ...pieces,
            label: `${y}/${m}/${d}`,
            iso: `${y}-${pad(m)}-${pad(d)}`,
            ts: Date.UTC(y, m - 1, d),
        };
    }

    const h = Number(hour);
    const mi = Number(minute);

    return {
        ...pieces,
        clock: `${h}:${pad(mi)}`,
        label: `${y}/${m}/${d} ${h}:${pad(mi)}`,
        iso: `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(mi)}`,
        ts: Date.UTC(y, m - 1, d, h, mi),
    };
}

/** Parse the whole page body. Newest first, like WeChat's own timeline. */
export function getMoments(raw) {
    const entries = [];

    for (const part of String(raw ?? "").split(/^## /m).slice(1)) {
        const lines = part.split("\n");
        const heading = lines[0].trim();
        if (!heading) continue;

        let location = "";
        let start = 1;

        // The location is the first content line when it starts with `>`. Blank
        // lines above it are tolerated: putting one under the heading is the
        // obvious thing to type, and a quote that opens the body would be the
        // only thing confused by this.
        let probe = 1;
        while (probe < lines.length && !lines[probe].trim()) probe += 1;

        if (lines[probe] && /^>/.test(lines[probe].trim())) {
            // A leading pin is stripped so `> 📍 上海` and `> 上海` print the same.
            location = lines[probe]
                .trim()
                .replace(/^>\s*/, "")
                .replace(/^📍\s*/u, "")
                .trim();
            start = probe + 1;
        }

        const body = lines.slice(start).join("\n").trim();

        entries.push({ ...parseStamp(heading), location, blocks: parseBody(body) });
    }

    return entries.sort((a, b) => b.ts - a.ts);
}

/** `2026-10` for an entry with a parseable date, `""` for one without. */
export function monthKey(entry) {
    return entry.iso ? entry.iso.slice(0, 7) : "";
}

/**
 * The month map behind the calendar: years from the recent past backwards, each
 * with its months in the same order, plus the anchor of that month's first
 * entry. Entries arrive newest first, so both levels come out sorted without a
 * second pass.
 */
export function getMomentIndex(entries) {
    const years = [];

    for (const entry of entries) {
        const key = monthKey(entry);
        if (!key) continue;
        const [year, month] = key.split("-");

        let yearBucket = years.find((bucket) => bucket.year === year);
        if (!yearBucket) {
            yearBucket = { year, months: [] };
            years.push(yearBucket);
        }

        let monthBucket = yearBucket.months.find((bucket) => bucket.month === month);
        if (!monthBucket) {
            monthBucket = { month, count: 0, anchor: `m-${key}` };
            yearBucket.months.push(monthBucket);
        }
        monthBucket.count += 1;
    }

    return years;
}

/**
 * How many entries the Moments page ships in one go. The rest are prerendered
 * into partial pages (`/moments/feed/<n>/`) that the browser fetches as the
 * reader scrolls, so a long stream no longer puts every photo in the first
 * response.
 */
export const MOMENT_CHUNK_SIZE = 5;

/**
 * The id of the article the calendar jumps to for each month, or undefined when
 * the entry is not its month's anchor. The month's newest entry takes the anchor,
 * so one element per month exists and the ids match `getMomentIndex()`.
 */
export function momentAnchors(entries) {
    const used = new Set();

    return entries.map((entry) => {
        const key = monthKey(entry);
        if (!key || used.has(key)) return undefined;
        used.add(key);
        return `m-${key}`;
    });
}
