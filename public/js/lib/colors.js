/**
 * Tag / category colors, resolved in the browser instead of at build time.
 *
 * Colors used to be picked with Math.random() while the site was generated, so
 * every `hexo generate` baked a different set of inline styles into the pages
 * and every upload showed those files as modified. The markup now only carries
 * `data-color-key`, and this file turns that key into a color once the page has
 * rendered.
 *
 * Config is injected by layout.ejs as `window.__TAG_COLORS__`.
 */
(function () {
    var config = window.__TAG_COLORS__ || {};
    var palette = Array.isArray(config.palette) ? config.palette : [];
    var scheme = config.scheme === "random" ? "random" : "hash";
    var salt = typeof config.salt === "string" ? config.salt : "";
    var avoidAdjacent = config.avoidAdjacentDuplicates !== false;

    if (!palette.length) return;

    // djb2 — stable across browsers, builds and machines, unlike Math.random().
    function hash(text) {
        var h = 5381;
        for (var i = 0; i < text.length; i++) {
            h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
        }
        return h;
    }

    function pick(key) {
        if (scheme === "random") {
            return palette[Math.floor(Math.random() * palette.length)];
        }
        return palette[hash(salt + key) % palette.length];
    }

    /**
     * Colors every `[data-color-key]` under `root`, in document order.
     *
     * `avoidAdjacent` keeps two neighbours from sharing a color, the way the
     * old build-time code did — with only a handful of colors, a hash lands on
     * the same slot often enough to read as a mistake. The cost is that a tag
     * can shift color on a page where its neighbour happens to collide with
     * it; set `avoid_adjacent_duplicates: false` to drop that rule and let
     * every name keep one color on every page.
     */
    function apply(root) {
        // Callers pass a container, but #layout's template starts with a text
        // node, so Vue's `$el` can be a node without querySelectorAll.
        var scope = root && root.querySelectorAll ? root : document;
        var nodes = scope.querySelectorAll("[data-color-key]");
        var prev = null;
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var color = pick(node.getAttribute("data-color-key"));
            if (avoidAdjacent && color === prev) {
                color = palette[(palette.indexOf(color) + 1) % palette.length];
            }
            prev = color;
            // The colour is always published as --tag-c, so a rule can derive
            // several things from one hue (the pill's wash, its rim, its ink).
            // `data-color-prop="var"` asks for that and nothing else; otherwise
            // the colour is painted onto the property the markup names — a tag's
            // name in a list is set in it.
            node.style.setProperty("--tag-c", color);
            var prop = node.getAttribute("data-color-prop") || "background";
            if (prop !== "var") {
                node.style.setProperty(prop, color);
            }
        }
    }

    // Vue takes #layout's innerHTML as its template and re-creates those nodes
    // on mount, so anything written before the app renders is thrown away.
    // Coloring from a mounted hook runs after that render and lands on the
    // nodes the user actually sees.
    if (typeof mixins !== "undefined") {
        mixins.colors = {
            mounted() {
                apply(document);
            },
        };
    } else {
        // Standalone fallback, should colors.js ever be loaded on its own.
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () {
                apply(document);
            });
        } else {
            apply(document);
        }
    }
})();
