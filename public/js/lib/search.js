// Search filters the archive timeline in place: rows that don't match animate
// out and the ones that do slide back. The animation is the .timeline
// transition in main.css — margin-top, opacity, visibility — so all this has to
// do is set those three properties per row.
//
// Matching runs over title *and* body text, so it needs __POSTS_DATA__. The
// timeline carries only a path per row, and that path is what ties a row back to
// its post.
//
// A row that matched in its body also grows the matched passage inside itself:
// the timeline is the only view there is, so the row is where the reason has to
// show.
const stripSpace = (text) => text.toLowerCase().replace(/\s+/g, "");

// Lines of context kept either side of a matching line.
const EXCERPT_CONTEXT = 2;

mixins.search = {
    data() {
        return { rawSearch: "", postsData: [] };
    },
    mounted() {
        const raw = window.__POSTS_DATA__;
        if (raw && raw.length) {
            try {
                this.postsData = raw.map((post) => ({
                    ...post,
                    plainContent: this.htmlToPlainText(post.content),
                }));
            } catch (e) {
                console.error("[search] Failed to process posts data:", e);
                this.postsData = [];
            }
        } else {
            console.warn("[search] window.__POSTS_DATA__ not available!");
            this.postsData = [];
        }
    },
    watch: {
        search(value) {
            try {
                const timeline = this.$refs.timeline;
                if (!timeline) return;

                const entries = Array.from(timeline.childNodes).filter(
                    (node) => node.nodeType === 1
                );
                if (!entries.length) return;

                const matched = value ? this.buildMatches(value) : null;

                // Every height is read before any style is written. A collapsed
                // row is collapsed *by* its margin-top, so writing row by row
                // would make each offsetHeight read force a fresh layout — and
                // this watcher runs on every keystroke.
                //
                // Only the rows about to be hidden use their height, and those
                // are exactly the rows whose excerpt block is collapsing at the
                // same time — and that block may still be part-way through its
                // own transition. So what gets cancelled is the row's height
                // with the block taken back out, or the margin would leave a gap
                // the size of whatever the block happened to be at this instant.
                const heights = entries.map((entry) => {
                    const block = entry.querySelector(".search-excerpts");
                    return entry.offsetHeight - (block ? block.offsetHeight : 0);
                });
                // The gap under a row comes from the same rule that carries the
                // transition, so read it rather than repeat the number here.
                const gap =
                    parseFloat(getComputedStyle(entries[0]).marginBottom) || 0;

                entries.forEach((entry, i) => {
                    const excerpts = matched
                        ? matched.get(entry.dataset.path)
                        : null;
                    const keep = !matched || excerpts !== undefined;

                    this.setExcerpts(entry, keep ? excerpts : null);

                    entry.style.opacity = keep ? "1" : "0";
                    entry.style.visibility = keep ? "visible" : "hidden";
                    // The negative margin eats the row's own height plus the gap
                    // under it, so a filtered-out row leaves no hole behind.
                    entry.style.marginTop = keep
                        ? "0"
                        : `${-(heights[i] + gap)}px`;
                });
            } catch (e) {
                console.error("[search] watcher error:", e);
            }
        },
    },
    computed: {
        search() {
            return this.rawSearch.toLowerCase().replace(/\s+/g, "");
        },
    },
    methods: {
        // Every post whose title or body contains the query, mapped to the body
        // excerpts that matched. An empty list means the title alone matched:
        // there is nothing to show, the title is already on screen.
        buildMatches(query) {
            const matches = new Map();
            for (const post of this.postsData) {
                const lines = post.plainContent.split("\n");
                const hit = [];
                for (let i = 0; i < lines.length; i++) {
                    if (stripSpace(lines[i]).includes(query)) hit.push(i);
                }
                if (hit.length) {
                    matches.set(post.path, this.excerptsFor(lines, hit));
                } else if (stripSpace(post.title).includes(query)) {
                    matches.set(post.path, []);
                }
            }
            return matches;
        },

        // The matching line indices, widened by EXCERPT_CONTEXT either way and
        // merged where they touch, so an excerpt reads as the passage the query
        // landed in rather than a bare line. A one-line gap is not worth a
        // second excerpt with a rule between them.
        excerptsFor(lines, matchIndices) {
            const ranges = [];
            for (const index of matchIndices) {
                const from = Math.max(0, index - EXCERPT_CONTEXT);
                const to = Math.min(lines.length - 1, index + EXCERPT_CONTEXT);
                const last = ranges[ranges.length - 1];
                if (last && from <= last.to + 1) last.to = Math.max(last.to, to);
                else ranges.push({ from, to });
            }

            return ranges
                .map((range) =>
                    lines
                        .slice(range.from, range.to + 1)
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0)
                        .join("\n")
                )
                .filter((excerpt) => excerpt.length > 0);
        },

        // Grows the excerpt block inside a row, or collapses it away when the
        // row has none. The measured height is handed to max-height rather than
        // left to the content so the block can animate at all — the same trick
        // the post cards' tag row uses. Every space inside it is padding, which
        // scrollHeight counts; a child's margin is not reliably part of it, and
        // the last line would get clipped.
        setExcerpts(entry, excerpts) {
            const content = entry.querySelector(".timeline-content");
            if (!content) return;
            let block = content.querySelector(".search-excerpts");

            if (!excerpts || !excerpts.length) {
                if (block) {
                    block.classList.remove("shown");
                    block.style.maxHeight = "0px";
                }
                return;
            }

            if (!block) {
                block = document.createElement("div");
                block.className = "search-excerpts";
                content.appendChild(block);
            }

            const rawQuery = this.rawSearch.trim();
            const highlight = rawQuery
                ? new RegExp(`(${this.escapeRegex(rawQuery)})`, "gi")
                : null;
            block.innerHTML = excerpts
                .map((excerpt) => {
                    let escaped = this.escapeHtml(excerpt);
                    if (highlight) {
                        escaped = escaped.replace(highlight, "<mark>$1</mark>");
                    }
                    return `<p class="search-excerpt">${escaped}</p>`;
                })
                .join('<div class="search-excerpt-sep"></div>');

            block.offsetHeight; // commit the collapsed start state
            block.classList.add("shown");
            block.style.maxHeight = `${block.scrollHeight + 1}px`;
        },

        escapeHtml(text) {
            const div = document.createElement("div");
            div.textContent = text;
            return div.innerHTML;
        },

        escapeRegex(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        },

        htmlToPlainText(html) {
            try {
                let text = html
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(
                        /<\/?(p|div|h[1-6]|li|tr|blockquote|pre|section|article|hr|ul|ol|table|figure|details|summary|fieldset|legend|dd|dt|dl|address|form|header|footer|main|nav|aside|figcaption|caption|thead|tbody|tfoot|colgroup|th|td)[^>]*>/gi,
                        "\n"
                    )
                    .replace(/<[^>]*>/g, "");
                // Decode HTML entities using browser DOM
                const ta = document.createElement("textarea");
                ta.innerHTML = text;
                text = ta.value;
                return text.replace(/\n{3,}/g, "\n\n").trim();
            } catch (e) {
                console.error("[search] htmlToPlainText error:", e);
                return html.replace(/<[^>]*>/g, "").trim();
            }
        },
    },
};
