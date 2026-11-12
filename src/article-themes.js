/**
 * Article themes — the per-post look, kept in a file of their own.
 *
 * A post selects one with `theme: <name>` in its front matter; an unknown or
 * missing name falls back to `default`, which is the blog's current look. A
 * theme only lists the fields it changes: every theme is deep-merged over
 * `default`, so omitting `article.titleColor` inherits the default value.
 *
 * The generated rules are emitted as custom properties on the article / home
 * card wrapper (`[data-article-theme="<name>"]`), which is how one article can
 * look different from the next: public/css/main.css reads every value as
 * `var(--art-…, <current literal>)`.
 *
 * Colors take any CSS color; sizes take any CSS length (px / rem / em).
 * `markdown` switches the custom syntaxes registered in
 * src/lib/markdown-extensions.js — add a theme entry there to expose a new one
 * here. Unknown keys are kept in the resolved theme object, so future
 * article-page features can hang their own options off a theme.
 *
 * Add a theme by adding a key below, then write `theme: <key>` in a post's
 * front matter. `default` is mandatory (it is the merge base). This file is
 * user config: scripts/sync-theme.mjs never overwrites it, just like
 * src/site.config.js.
 */

export const articleThemes = {
    default: {
        // The article card on /posts/<slug>/ (.article).
        article: {
            cardBackground: "rgba(255, 255, 255, 0.8)",
            cardBorderColor: "rgba(255, 255, 255, 0.5)",
            titleColor: "#1e3e3f",
            titleSize: "30px",
            subtitleColor: "#3d5559",
            subtitleSize: "20px",
            textColor: "#1e3e3f",
            textSize: "15px",
            textLineHeight: 1.7,
            metaColor: "#5c6b72",
        },
        // That post's card on the home page (.post), excerpt included: the
        // card tint, the title/subtitle, the body text and the meta row.
        home: {
            cardBackground: "#fff",
            cardBorderColor: "var(--page-bg)",
            titleColor: "#85bac0",
            titleSize: "27px",
            subtitleColor: "#8ebfc5",
            subtitleSize: "20px",
            textColor: "#1e3e3f",
            textSize: "14px",
            metaColor: "#5c6b72",
        },
        // The Contents panel beside the article (.article-side).
        toc: {
            cardBackground: "rgba(255, 255, 255, 0.6)",
            cardBorderColor: "rgba(255, 255, 255, 0.65)",
            titleColor: "#85bac0",
            titleSize: "13px",
            itemColor: "#5c6b72",
            itemSize: "13px",
            itemHoverColor: "#85bac0",
            itemHoverBackground: "rgba(255, 255, 255, 0.65)",
            itemActiveColor: "#1e3e3f",
            itemActiveBackground: "rgba(133, 186, 192, 0.12)",
            scrollbarColor: "rgba(133, 186, 192, 0.5)",
            scrollbarHoverColor: "rgba(133, 186, 192, 0.7)",
        },
        // Headings written in the article body (h1 is the article title and is
        // covered by `article` above).
        headings: {
            color: "#1e3e3f",
            h6Color: "#5c6b72",
            h2Size: "24px",
            h3Size: "20px",
            h4Size: "17.5px",
            h5Size: "16.5px",
            h6Size: "14px",
        },
        // Which custom Markdown syntaxes this theme allows. Every registered
        // extension gets a switch; `false` leaves the source text as written
        // instead of rendering it.
        markdown: {
            spoiler: true,
            video: true,
            problemSolution: false,
        },
    },

    basic: {
        markdown: {
            spoiler: false,
            video: false,
            problemSolution: false,
        },
    },

    math: {
        markdown: {
            problemSolution: true,
        },
    },

    // warm: {
    //     article: {
    //         cardBackground: "rgba(255, 250, 244, 0.88)",
    //         titleColor: "#7a4a2b",
    //         textColor: "#4a3a2c",
    //     },
    //     home: { titleColor: "#c0814f", subtitleColor: "#cf9d75" },
    //     toc: { titleColor: "#c0814f", itemActiveColor: "#7a4a2b" },
    //     headings: { color: "#7a4a2b" },
    //     markdown: { spoiler: false },
    // },
    //
};
