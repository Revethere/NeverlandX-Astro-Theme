/**
 * Content loading and the derived collections every page is built from.
 *
 * Posts and pages are plain Markdown files under content/, imported as raw text
 * at build time. Front matter is parsed with YAML's JSON schema on purpose:
 * js-yaml's default schema would turn `date: 2026-09-15 23:00:00` into a Date
 * (and silently reinterpret it in UTC), while the blog has always meant "that
 * wall-clock time in Asia/Chongqing". Keeping the value a string and reading its
 * parts is both simpler and exactly what Hexo displayed.
 */

import matter from "gray-matter";
import yaml from "js-yaml";

import { site, theme } from "../site.config.js";
import { renderMarkdown, slugize } from "./markdown.js";

const FILE_ORDER = {};

const postFiles = import.meta.glob("../../content/posts/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
});

const pageFiles = import.meta.glob("../../content/pages/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
});

const YAML_OPTIONS = { schema: yaml.JSON_SCHEMA };

function parseFrontMatter(file) {
    return matter(file, { engines: { yaml: (src) => yaml.load(src, YAML_OPTIONS) } });
}

const baseName = (path) => path.split("/").pop().replace(/\.md$/, "");

const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Hexo's date field, kept as parts. `label` is what moment's "YYYY/M/D" printed
 * (no zero padding), and `ts` is only ever used for sorting.
 */
export function parseDate(value) {
    const match = DATE_RE.exec(String(value ?? "").trim());
    if (!match) {
        return { y: 1970, m: 1, d: 1, ts: 0, label: "1970/1/1" };
    }
    const [, y, m, d, h = "0", mi = "0", s = "0"] = match;
    const parts = {
        y: Number(y),
        m: Number(m),
        d: Number(d),
        h: Number(h),
        mi: Number(mi),
        s: Number(s),
    };
    return {
        ...parts,
        ts: Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.mi, parts.s),
        label: `${parts.y}/${parts.m}/${parts.d}`,
    };
}

const asList = (value) => {
    if (value === undefined || value === null || value === "") return [];
    return Array.isArray(value) ? value.map(String) : [String(value)];
};

/**
 * Hrefs are percent-encoded, the way Hexo's `url_for` printed them
 * (`/tags/%E5%8D%9A%E5%BC%88`). `path` stays raw: it is what routes and the
 * `is-active` comparisons use, and sorting on raw code points is what put the
 * ASCII tags ahead of the CJK ones in the tag cloud.
 */
const hrefOf = (path) => encodeURI(path);

/**
 * Tag display order. Hexo rendered a post's tags in the order the Tag records
 * were created (their warehouse ids), not in front-matter order — that is why
 * `[LunarClient, Rewind, Minecraft]` came out as `Minecraft, LunarClient,
 * Rewind`. The creation order cannot be derived from the Markdown, so the
 * order the old site had is recorded here; a tag that is not listed (a new one)
 * sorts after all of these, in first-appearance order.
 */
const TAG_ORDER = [
    "Minecraft", "sumo", "Java", "数学", "C++", "快读快写", "模板",
    "OBS", "Blur", "LunarClient", "Rewind", "Atcoder", "OI", "博弈", "多项式",
];
const tagRank = new Map(TAG_ORDER.map((name, index) => [name, index]));
const rankOf = (name) => {
    if (!tagRank.has(name)) tagRank.set(name, tagRank.size);
    return tagRank.get(name);
};

/* --------------------------------------------------------------- posts -- */

function loadPosts() {
    const posts = [];

    Object.keys(postFiles)
        .sort()
        .forEach((path, index) => {
            const slug = baseName(path);
            FILE_ORDER[slug] = index;

            const { data, content } = parseFrontMatter(postFiles[path]);

            if (data.published === false) return;

            const categoryNames = asList(data.categories);
            const categories = categoryNames.map((name, i) => ({
                name,
                // A category's path is its whole chain, each segment slugized.
                path: `/categories/${categoryNames
                    .slice(0, i + 1)
                    .map(slugize)
                    .join("/")}/`,
            }));
            categories.forEach((category) => {
                category.href = hrefOf(category.path);
            });

            const tags = asList(data.tags)
                .map((name) => ({
                    name,
                    path: `/tags/${slugize(name)}/`,
                    href: hrefOf(`/tags/${slugize(name)}/`),
                    rank: rankOf(name),
                }))
                .sort((a, b) => a.rank - b.rank);

            posts.push({
                slug,
                path: `/posts/${slug}/`,
                href: hrefOf(`/posts/${slug}/`),
                title: data.title === undefined ? "" : String(data.title),
                // `subtitle` is the muted line under the title on the article
                // page — a note on what the post is about, not a second title.
                subtitle: data.subtitle === undefined ? undefined : String(data.subtitle),
                date: parseDate(data.date),
                updated: data.updated ? parseDate(data.updated) : null,
                // `raw` is the Markdown body; `source` is the whole file,
                // front matter included — the character base the Words counter
                // used (Hexo's post.raw still carried the front matter).
                raw: content,
                source: postFiles[path],
                html: "",
                categories,
                // Card/article show the first (top level) category only.
                category: categories[0] ?? null,
                tags,
                pinned: data.pinned === undefined || data.pinned === null
                    ? undefined
                    : Number(data.pinned),
                // `outdated: true` hides the post from the browse listings
                // (home, tags, categories). It keeps its article page, stays in
                // the archive timeline and the search index, and the timeline
                // marks it with a grey "Outdated" badge.
                outdated: data.outdated === true,
                description: data.description === undefined
                    ? undefined
                    : String(data.description),
                headTitle: data.head_title ? String(data.head_title) : undefined,
                toc: data.toc !== false,
            });
        });

    // Pinned first, then newest. Ties keep file order, as Hexo's stable sort
    // did over an insertion-ordered collection.
    posts.sort((a, b) => {
        const pa = a.pinned ?? 0;
        const pb = b.pinned ?? 0;
        if (pa !== pb) return pb - pa;
        if (a.date.ts !== b.date.ts) return b.date.ts - a.date.ts;
        return FILE_ORDER[a.slug] - FILE_ORDER[b.slug];
    });

    return posts;
}

const allPosts = loadPosts();

/**
 * The posts the browse listings are built from: home pagination and the tag /
 * category pages. Outdated posts are left out on purpose — they only appear in
 * the archive timeline and the search index (see getPosts / getArchivePosts).
 */
const listedPosts = allPosts.filter((post) => !post.outdated);

/** Every published post, outdated ones included: the archive and the search index. */
export function getPosts() {
    return allPosts;
}

/** Posts as the home page lists them: pinned first, then by date, no outdated ones. */
export function getListedPosts() {
    return listedPosts;
}

/** Newest first, pinned ignored — the order the tag/category lists use. */
export function sortByDateDesc(posts) {
    return [...posts].sort((a, b) =>
        a.date.ts !== b.date.ts
            ? b.date.ts - a.date.ts
            : FILE_ORDER[a.slug] - FILE_ORDER[b.slug]
    );
}

/**
 * Same posts, oldest first — the archive timeline's DOM order (the wrapper is
 * laid out column-reverse, so the DOM runs backwards from what is seen).
 * Pinning does not apply: archives.ejs sorted on date alone.
 */
export function getArchivePosts() {
    return sortByDateDesc(allPosts).reverse();
}

export function getPostBySlug(slug) {
    return allPosts.find((post) => post.slug === slug);
}

/** Rendered HTML, computed once per post and shared by every page using it. */
export function contentOf(post) {
    if (!post.html) post.html = renderMarkdown(post.raw);
    return post.html;
}

/* --------------------------------------------------------------- pages -- */

function loadPage(name) {
    const path = Object.keys(pageFiles).find((key) => baseName(key) === name);
    if (!path) return null;
    const { data, content } = parseFrontMatter(pageFiles[path]);
    return {
        name,
        path: `/${name}/`,
        href: hrefOf(`/${name}/`),
        title: data.title === undefined ? "" : String(data.title),
        headTitle: data.head_title ? String(data.head_title) : undefined,
        date: data.date ? parseDate(data.date) : null,
        layout: data.layout ? String(data.layout) : undefined,
        type: data.type ? String(data.type) : undefined,
        toc: data.toc !== false,
        raw: content,
    };
}

export function getPage(name) {
    return loadPage(name);
}

/* --------------------------------------------------- tags and categories -- */

/** Tag pages: one entry per distinct tag, ordered by path (as Hexo listed them). */
export function getTags() {
    const tags = new Map();

    // Listed posts only: a tag that only an outdated post carries should not
    // get a page in the browse flow (the post is still archived and searchable).
    listedPosts.forEach((post) => {
        post.tags.forEach((tag) => {
            let entry = tags.get(tag.path);
            if (!entry) {
                entry = { name: tag.name, path: tag.path, href: tag.href, posts: [] };
                tags.set(tag.path, entry);
            }
            entry.posts.push(post);
        });
    });

    return [...tags.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Category pages: every node of every chain, so `categories: [竞赛, 高中数学]`
 * produces both 竞赛 and 高中数学. A parent's list includes the posts filed under
 * its children, which is what the generated 竞赛 page showed.
 */
export function getCategories() {
    const nodes = new Map();

    // Listed posts only, for the same reason as getTags.
    listedPosts.forEach((post) => {
        post.categories.forEach((category, i) => {
            const key = post.categories
                .slice(0, i + 1)
                .map((c) => c.name)
                .join("\u0000");
            let node = nodes.get(key);
            if (!node) {
                node = {
                    name: category.name,
                    path: category.path,
                    href: category.href,
                    posts: [],
                };
                nodes.set(key, node);
            }
            node.posts.push(post);
        });
    });

    return [...nodes.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/* ----------------------------------------------------------------- misc -- */

/** The three side-card counters. */
export function getStats() {
    let chars = 0;
    let posts = 0;

    allPosts.forEach((post) => {
        // Hexo counted every non-whitespace character of the source file with
        // its front matter in place, HTML tags stripped — a proxy for "how much
        // has been written", not a word count.
        const text = post.source.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
        chars += text.length;
        posts += 1;
    });

    return {
        posts,
        words: (chars / 1000).toFixed(1),
        days: Math.floor(
            (Date.now() - new Date(`${theme.card.daysSince}T00:00:00`).getTime()) / 86400000
        ),
    };
}

export { site };
