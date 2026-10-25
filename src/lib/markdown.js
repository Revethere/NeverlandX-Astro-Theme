/**
 * Markdown rendering — a port of Hexo's markdown pipeline, not a new one.
 *
 * The blog was rendered by hexo-renderer-marked 6.3.0 on top of marked 4.3.0,
 * and every visual detail of an article depends on that pairing: heading ids
 * become the table-of-contents anchors, headings grow an empty .headerlink
 * anchor, external links open in a new tab, code fences carry a bare language
 * class (no `language-` prefix) that the theme's highlight.js reads back, and
 * "smartypants" turns straight quotes and three dots into typographic ones.
 *
 * So this file keeps marked 4.3.0 and reimplements the small renderer hexo-
 * renderer-marked installed over it, rather than translating the rules into
 * remark/rehype plugins where each of the above would have to be re-derived and
 * would drift. The two Hexo scripts that extended the grammar — `%%spoiler%%`
 * and the inline video embeds — are ported here as well, in the same order they
 * ran there (video first, on the raw text; spoiler as an inline token).
 */

import { marked } from "marked";
import { site } from "../site.config.js";

const SITE_URL = site.url;

/* ---------------------------------------------------------------- helpers -- */

// hexo-util's escapeHTML: the one marked calls for text tokens. It escapes more
// than marked's own (also `/`, `=`, backtick), and the built site's entities
// looked exactly like this, so the text nodes stay byte-comparable.
const escapeTestNoEncode = /[<>"'`/=]|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
const escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, "g");
const escapeReplacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;",
    "/": "&#x2F;",
    "=": "&#x3D;",
};

function escapeHTML(str) {
    if (escapeTestNoEncode.test(str)) {
        return str.replace(escapeReplaceNoEncode, (ch) => escapeReplacements[ch]);
    }
    return str;
}

// hexo-util's unescapeHTML — needed because heading ids are derived from the
// *decoded* heading text, not from its escaped HTML.
function unescapeHTML(str) {
    return str.replace(/&#(x?)([0-9a-fA-F]+);/g, (match, hex, code) =>
        String.fromCodePoint(parseInt(code, hex ? 16 : 10))
    ).replace(/&(amp|lt|gt|quot|apos);/g, (match, name) => ({
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
    })[name]);
}

const stripHTML = (str) => str.replace(/<\/?[^>]+>/g, "");

const rControl = /[\u0000-\u001f]/g;
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'<>,.?/]+/g;
const rCombining = /[\u0300-\u036f]/g;

/**
 * hexo-util's slugize, which is what produced every id the old table of
 * contents linked to. Case is preserved (`transform` was 0), CJK is untouched,
 * runs of punctuation and spaces collapse into single hyphens.
 */
export function slugize(str) {
    return str
        // NFD, not NFKD: compatibility decomposition would also flatten
        // full-width punctuation (（），…) into its ASCII equivalent, and Hexo's
        // slugger kept those — `稳态（渐进）速度推导` is a real id on this blog.
        .normalize("NFD")
        .replace(rCombining, "")
        .replace(rControl, "")
        .replace(rSpecial, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "");
}

// hexo-util's smartypants (marked's own is a different table).
function smartypants(str, quotes) {
    const [openDbl, closeDbl, openSgl, closeSgl] =
        typeof quotes === "string" && quotes.length === 4
            ? quotes
            : ["\u201c", "\u201d", "\u2018", "\u2019"];

    return str
        .replace(/---/g, "\u2014")
        .replace(/--/g, "\u2013")
        .replace(/(^|[-\u2014/([{"\s])'/g, "$1" + openSgl)
        .replace(/'/g, closeSgl)
        .replace(/(^|[-\u2014/([{\u2018\s])"/g, "$1" + openDbl)
        .replace(/"/g, closeDbl)
        .replace(/\.{3}/g, "\u2026");
}

// Percent-encode only what a browser would otherwise have to guess at, and
// leave existing escapes alone. Absolute URLs come through untouched.
function encodeURL(str) {
    return String(str).replace(/[^\x21-\x7e]/g, (ch) => encodeURIComponent(ch));
}

const SITE_HOST = new URL(SITE_URL).host;

function isExternalLink(href) {
    if (!href || href.startsWith("#")) return false;
    // `//host`, `http(s)://host` (and any other scheme that needs an authority)
    if (!/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href)) return false;
    try {
        const url = new URL(href, SITE_URL);
        return url.host !== SITE_HOST && url.host !== "";
    } catch {
        return false;
    }
}

/* ------------------------------------------------------- marked overrides -- */

const rDlSyntax = /(?:^|\s)(\S.+)<br>:\s+(\S.+)/;

/**
 * The renderer half of hexo-renderer-marked's lib/renderer.js. One instance per
 * rendered document: the heading-id de-duplication counter is per file, exactly
 * as it was there (a second `## 前言` becomes `前言-1`).
 */
class HexoRenderer extends marked.Renderer {
    constructor() {
        super();
        this._headingId = Object.create(null);
    }

    heading(text, level) {
        const id0 = slugize(stripHTML(unescapeHTML(text)).trim());
        let id = id0;
        if (this._headingId[id]) id += `-${this._headingId[id]++}`;
        else this._headingId[id] = 1;

        return `<h${level} id="${id}"><a href="#${id}" class="headerlink" title="${stripHTML(
            text
        )}"></a>${text}</h${level}>`;
    }

    link(href, title, text) {
        let out = `<a href="${encodeURL(href)}"`;
        if (title) out += ` title="${title}"`;
        if (isExternalLink(href)) out += ' target="_blank" rel="noopener"';
        return `${out}>${text}</a>`;
    }

    // Basic description lists: `term<br>: definition`.
    paragraph(text) {
        if (rDlSyntax.test(text)) {
            return text.replace(rDlSyntax, "<dl><dt>$1</dt><dd>$2</dd></dl>");
        }
        return `<p>${text}</p>\n`;
    }

    image(href, title, text) {
        // prependRoot/url_for was a no-op for the roots used here (the site
        // lives at `/`), so the src is the href.
        let out = `<img src="${encodeURL(href)}"`;
        if (text) out += ` alt="${text}"`;
        if (title) out += ` title="${title}"`;
        return `${out}>`;
    }
}

/**
 * hexo-renderer-marked's Tokenizer, of which only inlineText mattered: it runs
 * the text through smartypants and the escaping above. `rules` and `lexer` are
 * injected by marked's Lexer.
 */
class HexoTokenizer extends marked.Tokenizer {
    inlineText(src) {
        const { options } = this;
        const { quotes, smartypants: isSmarty } = options;
        const cap = this.rules.inline.text.exec(src);
        if (!cap) return undefined;

        let text;
        if (this.lexer.state.inRawBlock || this.rules.inline.url.exec(src)) {
            text = cap[0];
        } else {
            text = escapeHTML(isSmarty ? smartypants(cap[0], quotes) : cap[0]);
        }
        return { type: "text", raw: cap[0], text };
    }
}

/* ------------------------------------------------------------ extensions -- */

// `%%悬停才看得见的文字%%` → <span class="spoiler" tabindex="0">…</span>.
// Inline level, so emphasis/links/code inside still parse and a `%%` inside a
// code span or fence is never reached (those are tokenized as a unit first).
const spoilerExtension = {
    name: "spoiler",
    level: "inline",
    start(src) {
        return src.indexOf("%%");
    },
    tokenizer(src) {
        const match = /^%%(?=\S)([\s\S]*?\S)%%/.exec(src);
        if (!match) return undefined;
        return {
            type: "spoiler",
            raw: match[0],
            text: match[1],
            tokens: this.lexer.inlineTokens(match[1]),
        };
    },
    renderer(token) {
        return (
            '<span class="spoiler" tabindex="0">' +
            this.parser.parseInline(token.tokens) +
            "</span>"
        );
    },
};

export const MARKED_OPTIONS = {
    gfm: true,
    pedantic: false,
    breaks: true,
    smartLists: true,
    smartypants: true,
    autolink: true,
    mangle: true,
    headerIds: true,
    langPrefix: "",
};

/**
 * Inline video embeds, ported from D:\Workspace\Blog\scripts\inline-video.js.
 * It ran as a `before_post_render` filter, i.e. on the raw markdown before any
 * parsing, so a `[x](Bilibili:BV…)` in the source becomes a block-level <div>
 * that marked then passes through as raw HTML.
 */
function replaceVideoLinks(markdown) {
    return markdown
        .replace(
            /\[[^\]]*\]\(Bilibili:(BV[\w]+)\)/g,
            (_, bvid) =>
                '<div class="video-embed video-bilibili">' +
                '<iframe src="//player.bilibili.com/player.html?isOutside=true&autoplay=0&bvid=' +
                bvid +
                '" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"' +
                ' loading="lazy"></iframe>' +
                "</div>"
        )
        .replace(
            /\[[^\]]*\]\(YouTube:([\w\-]+)\)/g,
            (_, videoId) =>
                '<div class="video-embed video-youtube">' +
                '<iframe src="https://www.youtube.com/embed/' +
                videoId +
                '?autoplay=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"' +
                ' allowfullscreen loading="lazy"></iframe>' +
                "</div>"
        );
}

/* ------------------------------------------------------------------- api -- */

// Extensions are not part of the per-parse option bag in marked 4.x: the Lexer
// only sees what `use()` registered on the defaults (this is how Hexo's own
// `marked:use` filter installed the spoiler rule). Registering once at module
// load keeps every parse — posts, pages, excerpts — consistent.
marked.use({ extensions: [spoilerExtension] });

const cache = new Map();

export function renderMarkdown(markdown) {
    if (cache.has(markdown)) return cache.get(markdown);

    const html = marked.parse(replaceVideoLinks(markdown), {
        ...MARKED_OPTIONS,
        renderer: new HexoRenderer(),
        tokenizer: new HexoTokenizer(),
    });

    cache.set(markdown, html);
    return html;
}
