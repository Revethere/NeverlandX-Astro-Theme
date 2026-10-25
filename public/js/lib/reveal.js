// The page's entrance animation, in the spirit of the one on deepseek.com: the
// page and the bar fade in, the hero's rings fade in, the text over them and the
// content blocks below rise into place, and anything under the fold waits until it
// is scrolled to.
//
// Once, and only once, per page load. Each element is unobserved the moment it
// plays, so scrolling down past it and back up again is inert — no second
// entrance, no half-visible state on the way back — until the page is loaded
// again, which is when the whole thing starts over.
//
// The hiding is done here rather than by a class in the stylesheet, and that is
// what makes it safe. The loading screen is opaque and covers the viewport until
// the window load event, and mounted() is a long way before that, so nothing is
// ever seen in its hidden state; and a browser where this script does not run —
// JS off, a CDN down, an engine without IntersectionObserver — never hides
// anything in the first place and renders exactly as it did before this existed.
// A hidden-by-default stylesheet cannot make either of those promises.

// One element's own motion. Long enough to be read as an arrival, short enough
// that nothing is still moving by the time the eye has settled on it.
const REVEAL_EASING = "cubic-bezier(0.22, 1, 0.36, 1)"; // ease-out-quint, as elsewhere
// How much of the bottom edge something has to clear before it plays: a line
// through the last 40px of the viewport, above which an element is worth
// starting. A fixed inset rather than a fraction, because what this avoids is an
// element arriving while a sliver of it is at the very bottom edge — and a
// fraction of the viewport can be more than the whole distance the page has left
// to scroll, which is how the footer of a short page ends up never arriving at
// all. (Kept small for the same reason: 40px is under any footer's height.)
const REVEAL_EDGE = 40;
const REVEAL_ROOT_MARGIN = `0px 0px ${-REVEAL_EDGE}px 0px`;
// The cap on a stagger. Five cards arriving together should not spend half a
// second queueing up, so past the fifth the wait stops growing.
const REVEAL_STAGGER_CAP = 4;

// The groups, in the order the opening screen plays them.
//
// `base` is the wait before a group starts when it is on screen at load. It is
// what makes the hero read as three steps — the page, the rings, the text — and
// it is deliberately *not* applied to anything the reader scrolls to: a block
// that has just come under the eye should start moving now, not 170ms from now.
// That is also why it lives here rather than being a delay on every animation.
//
// `rise` is 0 for the rings, which only fade. They are already turning, and a
// slide on top of a rotation is two movements in one element.
//
// The bars are px, and are 24-26 for everything that rises. Small enough that the
// element is not seen travelling, large enough that the movement is what the eye
// notices rather than the fade.
const REVEAL_GROUPS = [
    // The rings, then the text inside them.
    { selector: "#home-head #home-info .loop", rise: 0, base: 90, stagger: 70, ms: 900 },
    { selector: "#home-head #home-info .info .wrap > *", rise: 26, base: 190, stagger: 110, ms: 760 },
    // The home page's own content: the posts, then the profile card. Both are
    // below the wallpaper, so in practice these two play when they are scrolled
    // to rather than at load.
    { selector: "#home-posts .post", rise: 24, base: 120, stagger: 90, ms: 700 },
    { selector: "#home-card", rise: 24, base: 200, stagger: 0, ms: 700 },
    // Every other page's body. One block each, so on a page like the archives the
    // whole column arrives as a unit instead of as twenty timeline rows.
    { selector: ".article", rise: 24, base: 170, stagger: 0, ms: 700 },
    { selector: "#archives", rise: 24, base: 170, stagger: 0, ms: 700 },
    { selector: "#friends", rise: 24, base: 170, stagger: 0, ms: 700 },
    { selector: "#logs", rise: 24, base: 170, stagger: 0, ms: 700 },
    // The stream, not the whole section: a transform on the section becomes the
    // containing block of the fixed month index inside it, so the index would ride
    // the 24px entrance and then snap back when the transform cleared.
    { selector: "#moments .moments-stream", rise: 24, base: 170, stagger: 0, ms: 700 },
    { selector: "#footer", rise: 24, base: 170, stagger: 0, ms: 700 },
];

mixins.reveal = {
    mounted() {
        this.setupReveal();
    },
    watch: {
        // Everything waits for the loading screen: `loading` goes false on the
        // window load event, and that is the first moment any of this can be
        // seen. Starting at mount instead would play the whole entrance behind
        // the white screen it is meant to hand over from.
        loading(value) {
            if (!value) this.$nextTick(this.startReveals);
        },
    },
    methods: {
        setupReveal() {
            // Reduced motion gets the page as it was before any of this: nothing
            // hidden, nothing animated. Not a shortened version — the whole point
            // of the preference is that movement is not wanted.
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            if (!("IntersectionObserver" in window)) return;
            const targets = [];
            REVEAL_GROUPS.forEach((group) => {
                document.querySelectorAll(group.selector).forEach((el, order) => {
                    targets.push({ el, group, order });
                });
            });
            if (!targets.length) return;
            targets.forEach((target) => {
                target.el.style.opacity = "0";
            });
            // Plain properties on the instance, like _resizeTimer in home.js: a
            // live IntersectionObserver in reactive data would be proxied, and a
            // proxied observer is one whose own methods no longer work.
            this.revealTargets = targets;
            // `loading` can already be false by the time this runs — a script that
            // arrived after the load event — and waiting for a watcher that will
            // never fire would leave the page hidden for good. It is corrected
            // here, which fires the watcher above and starts the entrance.
            if (this.loading) {
                if (document.readyState === "complete") this.loading = false;
            } else {
                this.$nextTick(this.startReveals);
            }
        },
        startReveals() {
            if (this.revealStarted) return;
            this.revealStarted = true;
            const line = window.innerHeight - REVEAL_EDGE;
            // The furthest the page can be scrolled. Anything whose top would
            // still be below the line at that point can never be brought up to it
            // by scrolling — the footer of a page barely taller than the screen is
            // the case — and would otherwise sit here hidden for good. Those play
            // with the opening screen instead, off screen, so that scrolling down
            // to them finds them already in place.
            const scrollMax = Math.max(
                0,
                document.documentElement.scrollHeight - window.innerHeight
            );
            // What is at or past the line right now plays in one pass, in the
            // order the groups are declared, each with the wait its group asked
            // for. Measuring it here rather than letting the observer report it is
            // what keeps those waits in group order: the observer reports entries
            // in whatever order it likes, and the opening screen is the one place
            // the order is the effect.
            //
            // "Past" counts as well as "on": a scroll position the browser
            // restored can leave the hero above the viewport, and playing it
            // unseen is what stops the top of the page being blank if the reader
            // scrolls back up to it.
            const now = [];
            const later = [];
            (this.revealTargets || []).forEach((target) => {
                const top = target.el.getBoundingClientRect().top;
                if (top < line || top - scrollMax >= line) now.push(target);
                else later.push(target);
            });
            now.forEach((target) => {
                this.playReveal(target, this.revealDelay(target, target.order, true));
            });
            if (!later.length) return;
            // One observer for the rest of the page, and every target is
            // unobserved as it plays — which is the whole of the "once".
            this.revealPending = new Map();
            this.revealObserver = new IntersectionObserver(
                (entries) => {
                    let step = 0;
                    entries
                        .filter((entry) => entry.isIntersecting)
                        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                        .forEach((entry) => {
                            const target = this.revealPending.get(entry.target);
                            this.revealObserver.unobserve(entry.target);
                            if (!target) return;
                            this.playReveal(target, this.revealDelay(target, step++, false));
                        });
                },
                { rootMargin: REVEAL_ROOT_MARGIN }
            );
            later.forEach((target) => {
                this.revealPending.set(target.el, target);
                this.revealObserver.observe(target.el);
            });
        },
        // The wait before an element plays. On the opening screen it is the
        // group's own cue plus the element's place in the group; afterwards it is
        // only the stagger, so something the reader scrolled to starts at once.
        revealDelay(target, step, atLoad) {
            const { base, stagger } = target.group;
            const wait = stagger * Math.min(step, REVEAL_STAGGER_CAP);
            return atLoad ? base + wait : wait;
        },
        playReveal(target, delay) {
            const { el, group } = target;
            // The inline opacity this element was hidden with is handed back
            // first, so the end keyframe is the stylesheet's own value — the four
            // rings do not all have the same opacity — and `fill: "backwards"`
            // holds the start keyframe from this moment until the animation's own
            // first frame. Both happen in the same task, so the hand-back is never
            // painted: the element goes from hidden-by-inline-style to
            // hidden-by-keyframe with no frame in between.
            el.style.opacity = "";
            const resting = parseFloat(getComputedStyle(el).opacity);
            const end = Number.isFinite(resting) ? resting : 1;
            const frames = group.rise
                ? [
                      { opacity: 0, transform: `translateY(${group.rise}px)` },
                      { opacity: end, transform: "none" },
                  ]
                : [{ opacity: 0 }, { opacity: end }];
            el.animate(frames, {
                delay,
                duration: group.ms,
                easing: REVEAL_EASING,
                // Backwards only. Forwards would leave the animation in charge of
                // the element after it ends, which would quietly freeze the post
                // card's own hover lift.
                fill: "backwards",
            });
        },
    },
};
