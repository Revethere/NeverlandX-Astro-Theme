// ---------------------------------------------------------------------------
// ParticleX client runtime.
//
// This used to be a Vue 3 app: every file in /js/lib registers a "mixin"
// (data / created / mounted / watch / computed / methods) into the global
// `mixins` registry, and the old main.js handed them to
// `Vue.createApp({...}).mount("#layout")`, which compiled the server-rendered
// markup as an in-DOM template and then patched it.
//
// Astro now renders that markup, so the template half is gone and Vue with it.
// What remains is the slice of the Vue instance API the mixins actually use —
// `this.$refs`, `this.$nextTick`, reactive assignment, `watch`, `computed` —
// reimplemented below in about a hundred lines, plus the handful of DOM bindings
// the templates carried (`v-show`, `:class`, `@click`, `v-model`).
//
// The mixins themselves are untouched: they are ~100KB of hand-tuned animation
// code (wallpaper tinting, code folding, the entrance choreography, the menu
// morph) and rewriting them would have risked a visual regression for nothing.
// ---------------------------------------------------------------------------

// How far into the wallpaper's exit the menu starts and finishes its morph into
// a floating capsule, as a fraction of the wallpaper's own height — home page
// only. The geometry that reads these lives in #menu in main.css.
const MENU_MORPH_FROM = 0.5;
const MENU_MORPH_TO = 1;
// How far the morph has to be along before the panel is allowed to become glass,
// on pages that have no wallpaper to wait for.
const MENU_CLOUD_AT = 0.25;

// The two transparent-widget transitions from main.css.
const FADE_MS = 300;
const SLIDE_MS = 300;

/* ------------------------------------------------------------ transitions -- */

// One transition at a time per element: starting a second one over a running
// first (MORE followed by collapse within 300ms) must not leave both class sets
// on the element.
const transitionTimers = new WeakMap();

const TRANSITION_CLASSES = [
    "fade-enter-from",
    "fade-enter-active",
    "fade-enter-to",
    "fade-leave-from",
    "fade-leave-active",
    "fade-leave-to",
    "slide-enter-from",
    "slide-enter-active",
    "slide-enter-to",
    "slide-leave-from",
    "slide-leave-active",
    "slide-leave-to",
];

function clearTransition(element) {
    const timer = transitionTimers.get(element);
    if (timer) {
        clearTimeout(timer);
        transitionTimers.delete(element);
    }
    element.classList.remove(...TRANSITION_CLASSES);
}

// The class sequence Vue's <transition> produces, which is what main.css styles.
function enter(element, name, ms) {
    if (!element) return;
    clearTransition(element);
    element.style.display = "";
    element.classList.add(`${name}-enter-from`, `${name}-enter-active`);
    void element.offsetWidth; // flush so the from-state is a real starting frame
    requestAnimationFrame(() => {
        element.classList.remove(`${name}-enter-from`);
        element.classList.add(`${name}-enter-to`);
        transitionTimers.set(
            element,
            setTimeout(() => {
                element.classList.remove(`${name}-enter-active`, `${name}-enter-to`);
                transitionTimers.delete(element);
            }, ms + 20)
        );
    });
}

function leave(element, name, ms) {
    if (!element) return;
    clearTransition(element);
    if (getComputedStyle(element).display === "none") return;
    element.classList.add(`${name}-leave-from`, `${name}-leave-active`);
    void element.offsetWidth;
    requestAnimationFrame(() => {
        element.classList.remove(`${name}-leave-from`);
        element.classList.add(`${name}-leave-to`);
        transitionTimers.set(
            element,
            setTimeout(() => {
                element.classList.remove(`${name}-leave-active`, `${name}-leave-to`);
                element.style.display = "none";
                transitionTimers.delete(element);
            }, ms + 20)
        );
    });
}

/* ---------------------------------------------------------------- effects -- */

// State → DOM. These are the bindings the EJS templates spelled out.
const EFFECTS = {
    loading(value) {
        const main = document.getElementById("main");
        const menu = document.getElementById("menu");
        const loader = document.getElementById("loading");

        if (value) {
            // Before the first load: the page is inert and invisible, the bar is
            // not yet faded in, the loader is up.
            if (main) main.className = "into-enter-from";
            if (menu) menu.classList.remove("menu-enter");
            if (loader) {
                clearTransition(loader);
                loader.style.display = "";
            }
            return;
        }

        // The first-load fade: the page and the bar arrive together underneath
        // the loading screen's own departure (see .into-enter-active in main.css).
        if (main) main.className = "into-enter-active";
        if (menu) menu.classList.add("menu-enter");
        leave(loader, "fade", FADE_MS);
    },

    menuColor() {
        syncMenuClasses();
    },

    menuCloud() {
        syncMenuClasses();
    },

    showMenuItems(value) {
        const items = document.querySelector("#mobile-menu .items");
        const curtain = document.getElementById("menu-curtain");
        if (value) {
            enter(items, "slide", SLIDE_MS);
            enter(curtain, "fade", FADE_MS);
        } else {
            leave(items, "slide", SLIDE_MS);
            leave(curtain, "fade", FADE_MS);
        }
    },

    previewShow(value) {
        const preview = document.getElementById("preview");
        if (value) enter(preview, "fade", FADE_MS);
        else leave(preview, "fade", FADE_MS);
    },
};

function syncMenuClasses() {
    const menu = document.getElementById("menu");
    if (!menu) return;
    menu.classList.toggle("menu-color", app.menuColor);
    menu.classList.toggle("menu-cloud", app.menuCloud);
}

/* ------------------------------------------------------------- the mixins -- */

// `const mixins = {}` is declared by an inline script in the head; it is a
// global lexical binding, not a property of window.
const registry = typeof mixins !== "undefined" ? mixins : window.mixins || {};
const mixinList = Object.values(registry);

const data = Object.assign(
    {},
    ...mixinList.map((mixin) => (mixin.data ? mixin.data() : {})),
    {
        loading: true,
        showMenuItems: false,
        menuColor: false,
        menuCloud: false,
        scrollTop: 0,
        renderers: [],
        morphQueued: false,
    }
);

const computedDefs = Object.assign({}, ...mixinList.map((mixin) => mixin.computed || {}));
const watchDefs = Object.assign({}, ...mixinList.map((mixin) => mixin.watch || {}));

/* ------------------------------------------------- the component's own half -- */

// Ported verbatim from the old main.js (only `Vue.createApp` is gone).
const component = {
    created() {
        const dismiss = () => {
            app.loading = false;
            // The list pages' rows rise in with a 20ms stagger, and the gate for
            // that is this class rather than the markup: the loader covers the
            // page until `load`.
            document.documentElement.classList.add("page-loaded");
        };
        if (document.readyState === "complete") dismiss();
        else window.addEventListener("load", dismiss, { once: true });
    },

    mounted() {
        // The loading word's sweep waits for this. It is set on <html> rather
        // than on an app element so the animation has exactly one start.
        document.documentElement.classList.add("app-ready");

        window.addEventListener("scroll", app.handleScroll, true);
        window.addEventListener("resize", app.queueMenuMorph);

        // The menu is wired up *before* the renderers run, not after: one of the
        // renderers throws when its own CDN script failed to load (KaTeX's
        // auto-render is simply absent then), and the menu depends on none of it.
        app.initMenuIndicator();

        // The browser can restore a scroll position before this runs, so the
        // stored one is taken from the document rather than assumed to be zero.
        // menuColor has to be brought in line with it too, by the same test
        // handleScroll uses.
        app.scrollTop = document.documentElement.scrollTop;
        if (app.$refs.homePostsWrap && app.scrollTop > window.innerHeight - 100) {
            app.menuColor = false;
        }
        app.queueMenuMorph();
        app.render();
    },

    methods: {
        // Isolated one from the next. Each renderer calls into a global that its
        // own script provides, and one of those scripts failing to load used to
        // stop every renderer after it as well.
        render() {
            for (const renderer of app.renderers) {
                try {
                    renderer();
                } catch (error) {
                    console.error(error);
                }
            }
        },

        initMenuIndicator() {
            const desktopMenu = document.getElementById("desktop-menu");
            if (!desktopMenu) return;
            const indicator = document.getElementById("menu-indicator");
            if (!indicator) return;

            // Top level only: a group's panel is full of links too, and those
            // must not drive the pill.
            const links = desktopMenu.querySelectorAll(
                ":scope > a, :scope > .menu-group > a"
            );

            links.forEach((link) => {
                link.addEventListener("mouseenter", () => {
                    const linkRect = link.getBoundingClientRect();
                    const menuRect = desktopMenu.getBoundingClientRect();
                    indicator.style.left = `${linkRect.left - menuRect.left}px`;
                    indicator.style.width = `${linkRect.width}px`;
                    indicator.classList.add("visible");
                });
            });

            desktopMenu.addEventListener("mouseleave", () => {
                indicator.classList.remove("visible");
            });

            // The group panels get the same device on a smaller scale: one pill
            // for the whole panel, moved to whichever row the pointer is on.
            desktopMenu.querySelectorAll(".menu-sub").forEach((panel) => {
                const pill = panel.querySelector(".menu-sub-indicator");
                if (!pill) return;
                const rows = panel.querySelectorAll("a");
                // The pill is born with no size, so the first placement has to
                // skip the transition.
                let placed = false;
                const moveTo = (row) => {
                    if (!placed) {
                        placed = true;
                        pill.style.transition = "none";
                    }
                    pill.style.left = `${row.offsetLeft}px`;
                    pill.style.top = `${row.offsetTop}px`;
                    pill.style.width = `${row.offsetWidth}px`;
                    pill.style.height = `${row.offsetHeight}px`;
                    pill.classList.add("visible");
                    if (pill.style.transition === "none") {
                        void pill.offsetWidth; // flush before handing transitions back
                        pill.style.transition = "";
                    }
                };
                rows.forEach((row) => {
                    row.addEventListener("mouseenter", () => moveTo(row));
                    // Keyboard users get the same candidate as mouse users.
                    row.addEventListener("focus", () => moveTo(row));
                });
                panel.addEventListener("mouseleave", () => pill.classList.remove("visible"));
            });
        },

        // One number drives the whole menu morph, and it only moves on a scroll
        // or a resize, so it is written straight onto the element.
        updateMenuMorph() {
            app.morphQueued = false;
            const menu = document.getElementById("menu");
            if (!menu) return;

            let progress = 0;
            // The morph is desktop only. 901, not 900: the stylesheet hands over
            // to the mobile menu at a max-width of 900.
            if (window.matchMedia("(min-width: 901px)").matches) {
                const hero = document.getElementById("home-head");
                let from;
                let to;

                if (hero) {
                    // The wallpaper's own height sets both ends.
                    from = hero.offsetHeight * MENU_MORPH_FROM;
                    to = hero.offsetHeight * MENU_MORPH_TO;
                } else {
                    // Off the home page the morph starts on the first pixel of
                    // scroll; the page's own scrollable range sets the pace.
                    const scrollable =
                        document.documentElement.scrollHeight - window.innerHeight;
                    from = 0;
                    to = Math.min(window.innerHeight, Math.max(240, scrollable));
                }

                progress = (app.scrollTop - from) / Math.max(1, to - from);
                progress = Math.min(1, Math.max(0, progress));
                // Smoothstep.
                progress = progress * progress * (3 - 2 * progress);
            }

            menu.style.setProperty("--mp", progress.toFixed(4));

            // The material is switched, once, here. On the home page the bar sits
            // on the wallpaper with white labels until the wallpaper leaves it.
            const overWallpaper = !!app.$refs.homePostsWrap && app.menuColor;
            app.menuCloud = progress > MENU_CLOUD_AT && !overWallpaper;
        },

        queueMenuMorph() {
            if (app.morphQueued) return;
            app.morphQueued = true;
            window.requestAnimationFrame(app.updateMenuMorph);
        },

        handleScroll() {
            const wrap = app.$refs.homePostsWrap;
            const newScrollTop = document.documentElement.scrollTop;

            // The mobile dropdown is an overlay the bar would otherwise trail
            // down the page, so scrolling still closes that one.
            if (app.scrollTop < newScrollTop) app.showMenuItems = false;

            if (wrap) {
                if (newScrollTop <= window.innerHeight - 100) app.menuColor = true;
                else app.menuColor = false;
                if (newScrollTop <= 400) wrap.style.top = `${-newScrollTop / 5}px`;
                else wrap.style.top = "-80px";
            }

            app.scrollTop = newScrollTop;
            app.queueMenuMorph();
        },
    },
};

/* -------------------------------------------------------------- the app -- */

let app;

const target = Object.assign({}, data);

// computed: `search` (read the query, lowercased, whitespace stripped).
Object.keys(computedDefs).forEach((name) => {
    Object.defineProperty(target, name, {
        enumerable: true,
        configurable: true,
        get: () => computedDefs[name].call(app),
    });
});

const computedCache = {};

app = new Proxy(target, {
    set(object, key, value) {
        const previous = object[key];
        if (Object.is(previous, value)) return true;
        object[key] = value;

        const effect = EFFECTS[key];
        if (effect) effect.call(app, value, previous);

        const direct = watchDefs[key];
        if (direct && !(key in computedDefs)) direct.call(app, value, previous);

        // Computed values are derived, so a watcher on one fires when something
        // it reads changes.
        Object.keys(computedDefs).forEach((name) => {
            const watcher = watchDefs[name];
            if (!watcher) return;
            const next = computedDefs[name].call(app);
            if (Object.is(next, computedCache[name])) return;
            const old = computedCache[name];
            computedCache[name] = next;
            watcher.call(app, next, old);
        });

        return true;
    },
});

// Vue binds instance methods, so `this` is the instance even when the method is
// handed to addEventListener or requestAnimationFrame.
Object.entries(Object.assign({}, ...mixinList.map((mixin) => mixin.methods || {}), component.methods)).forEach(
    ([name, fn]) => {
        target[name] = fn.bind(app);
    }
);

const REF_SELECTORS = {
    homeBackground: "#home-background",
    homePostsWrap: "#home-posts-wrap",
    preview: "#preview",
    previewContent: "#preview-content",
    timeline: "#timeline-wrap",
    crypto: "#crypto",
    content: ".article .content",
};

const refs = new Proxy(
    {},
    {
        get(_, name) {
            const selector = REF_SELECTORS[name];
            return selector ? document.querySelector(selector) : null;
        },
    }
);

Object.defineProperty(target, "$refs", { get: () => refs });
Object.defineProperty(target, "$nextTick", {
    value: (fn, ctx) => Promise.resolve().then(() => fn && fn.call(ctx || app)),
});

// Prime the computed cache without firing its watcher.
Object.keys(computedDefs).forEach((name) => {
    computedCache[name] = computedDefs[name].call(app);
});

mixinList.forEach((mixin) => mixin.created && mixin.created.call(app));
component.created.call(app);

mixinList.forEach((mixin) => mixin.mounted && mixin.mounted.call(app));
component.mounted.call(app);

/* ---------------------------------------------------- template bindings -- */

// `@click` / `v-model` targets, in the order the templates declared them.
function wireTemplate() {
    const homeInfo = document.getElementById("home-info");
    if (homeInfo && typeof app.homeClick === "function") {
        homeInfo.addEventListener("click", () => app.homeClick());
    }

    const homePosts = document.getElementById("home-posts");
    if (homePosts && typeof app.toggleExpand === "function") {
        homePosts.addEventListener("click", (event) => {
            if (!event.target.closest(".more-center, .collapse-arrow")) return;
            app.toggleExpand(event);
        });
    }

    const menuTitle = document.querySelector("#mobile-menu > .title");
    if (menuTitle) {
        menuTitle.addEventListener("click", () => {
            app.showMenuItems = !app.showMenuItems;
        });
    }

    const curtain = document.getElementById("menu-curtain");
    if (curtain) {
        curtain.addEventListener("click", () => {
            app.showMenuItems = !app.showMenuItems;
        });
    }

    const searchBar = document.getElementById("search-bar");
    if (searchBar) {
        searchBar.addEventListener("input", (event) => {
            app.rawSearch = event.target.value;
        });
    }
}

wireTemplate();
