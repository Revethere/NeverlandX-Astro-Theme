// Smooth-expand tuning. Durations scale with travel distance so long articles
// reveal statelier and short ones stay snappy; easings are fast-start / long
// glide curves. Tweak here to tune the feel.
const EXPAND_EASING = "cubic-bezier(0.22, 1, 0.36, 1)"; // ease-out-quint
const COLLAPSE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const SETTLE_MS = 420; // content rise/fade duration (swap mode)
// Proportional durations: short posts stay snappy, long ones get a statelier
// glide (capped so they never feel sluggish).
const travelMs = (px) => Math.min(800, Math.round(320 + px * 0.08));
const collapseMs = (px) => Math.min(600, Math.round(280 + px * 0.05));

// Page background tint, matched to whichever wallpaper this load got. The
// wallpaper is `Math.random()`d in mounted(), so this can only be resolved in
// the browser — a colour baked into the HTML would be wrong for eight of the
// nine wallpapers and would turn every build into a fresh diff.
const TINT_SAMPLE_FROM = 0.7; // average only the bottom 30% of the wallpaper
const TINT_SAT_BOOST = 3; // wallpapers average out near-grey; lift the hue
const TINT_SAT_MAX = 0.4;
// The page is meant to read as a page, so it stays near-white. The chrome that
// sits on the white cards fills with it too, which is why it is published at all.
const TINT_LIGHTNESS = 0.93;
// Everything that wants the same hue a step deeper reads this: the hero
// dissolves into it, and the chrome above goes to it on hover. Deeper than the
// page rather than equal to it — landing the fade on near-white made that last
// stretch the steepest change on the page.
//
// How much deeper is not a constant, because the dissolve is three bands in a
// row and only two of them share a slope. The fade carries the wallpaper up to
// this colour, its continuation past the fold holds that same slope, and the
// settle then takes it the rest of the way to the page over half the length.
// So the settle is the band that sets the pace: land too shallow and it has all
// of the remaining distance to cover in the shortest run, which does not read
// as a dissolve but as a sudden turn to white at the foot of the hero. Land it
// deep enough to match the other two and the three become one slope.
//
// Matching them puts the landing at a weighted mean of the wallpaper and the
// page, weighted by the two band lengths. That is where 0.85 came from — for
// the bottom of a mid-tone photograph it is the match to within 0.002, and
// every mid-tone wallpaper still lands there. A dark one cannot: its band would
// have had to climb from 0.11. So the match is computed rather than pinned.
//
//   (wallpaper -> deep) over the fade == (deep -> page) over the settle
//
// --hero-fade-band is twice --hero-settle-band; change one and this constant
// has to follow it.
const TINT_DEEP_SLOPE_WEIGHT = 2;
const TINT_DEEP_LIGHTNESS = 0.85;
// What has to stay put as the landing goes dark is the chroma, not the
// saturation: HSL measures saturation against lightness, so holding the
// percentage while the lightness falls multiplies how coloured the result
// reads. The same 40% that is a whisper at 0.85 reads more than twice as
// coloured at 0.67 — and a band is a single colour painted across a bottom edge
// that is rarely one colour, so a wallpaper whose bottom is brown on the left
// and red on the right gets a stripe that matches neither. This is the budget
// the ceiling has always spent, and everything deeper spends the same.
const TINT_DEEP_CHROMA =
    TINT_SAT_MAX * Math.min(TINT_DEEP_LIGHTNESS, 1 - TINT_DEEP_LIGHTNESS);
// The four rings behind the title, in degrees either side of the sampled hue —
// one offset per ring, in the order they are stacked. They are the page's own
// hue family stepped away from itself, which is what lets four rings read as
// four colours without any of them leaving that family. Spread further and they
// stop being neighbours; spread less and they read as the single flat tone they
// were before.
const LOOP_HUE_OFFSETS = [-45, -15, 15, 45];
// Yellow is the one band where a pale tint reads as dirt: yellow at this
// lightness and a middling chroma is beige, and beige over a photograph looks
// like a smudge rather than a veil. So hues in the band are walked a fraction of
// the way towards blue — 240, which the walk can never reach — and the chroma
// follows at half that, which is what clears the beige. Green is what the walk
// passes through on the way, and green at this lightness reads as clean; what
// the correction is not allowed to do is arrive.
//
// The band is yellow proper (60) and the shoulders either side of it, which
// fade the correction out at 25 and at 95 so the four rings stay one family —
// a ring outside the band is left exactly as it was.
const LOOP_YELLOW_BAND = [25, 95];
const LOOP_YELLOW_TO_BLUE = 0.2;

// The hue in the band, walked towards blue, with how deep into the band it was —
// which is how much of the walk it got, and how much chroma to take with it.
function coolYellow(hue) {
    const [from, to] = LOOP_YELLOW_BAND;
    if (hue < from || hue > to) return { hue, yellowness: 0 };
    const yellowness =
        hue <= 60 ? (hue - from) / (60 - from) : (to - hue) / (to - 60);
    return {
        hue: (hue + (240 - hue) * LOOP_YELLOW_TO_BLUE * yellowness + 360) % 360,
        yellowness,
    };
}
// How concentrated the picture's hues have to be before its direction is worth
// following. Under this the picture has no tone to follow — a photograph of many
// colours averages to none — and the rings stay with the hue the page is already
// using, which at least agrees with everything else on the screen.
const LOOP_HUE_CONFIDENCE = 0.5;
// A floor under the rings' chroma. This is the one place the sample is allowed
// to be pushed past what the picture holds: a wallpaper of one grey has a real
// lean and almost no saturation, and four grey rings are the flat tone this
// exists to avoid. The floor lifts the lean it has; it does not invent one.
const LOOP_SAT_MIN = 0.22;

// One colour as HSL, with the hue as a fraction of a turn. Both samplers below
// need this and neither wants its own copy of it.
function hslOf(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    let hue = 0;
    let saturation = 0;
    if (max !== min) {
        const delta = max - min;
        saturation =
            lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        else if (max === g) hue = ((b - r) / delta + 2) / 6;
        else hue = ((r - g) / delta + 4) / 6;
    }
    return { hue, saturation, lightness };
}

// Average the sample down to one colour, then rebuild it as a tint: keep the
// hue, lift the saturation, and set the lightness — pinned near-white for the
// page, and a rise above the sample for the deeper one, which is the whole
// point of that one existing. Without the lift the hue disappears into the
// white and every wallpaper lands on the same near-grey.
function tintFromPixels(data) {
    let r = 0;
    let g = 0;
    let b = 0;
    const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    }
    const { hue, saturation, lightness } = hslOf(
        r / count / 255,
        g / count / 255,
        b / count / 255
    );

    const s = Math.min(saturation * TINT_SAT_BOOST, TINT_SAT_MAX);
    const h = Math.round(hue * 360);
    // The match, running into the ceiling — which only bites on the lightest
    // wallpapers, where what is left of the run is too short to read either way.
    const deep = Math.min(
        (TINT_DEEP_SLOPE_WEIGHT * TINT_LIGHTNESS + lightness) /
            (TINT_DEEP_SLOPE_WEIGHT + 1),
        TINT_DEEP_LIGHTNESS
    );
    // The budget, spent against that landing rather than declared as a
    // percentage — which is what keeps the band from announcing a colour.
    const deepSat = Math.min(s, TINT_DEEP_CHROMA / Math.min(deep, 1 - deep));
    return {
        deep: `hsl(${h}, ${Math.round(deepSat * 100)}%, ${Math.round(deep * 100)}%)`,
        page: `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(TINT_LIGHTNESS * 100)}%)`,
        // Also handed on for the rings: they walk a hue around, and when the
        // whole picture has no direction of its own to follow, this is the one
        // they fall back to.
        hue: h,
    };
}

// The rings read the whole picture, not the bottom slice the page is matched to:
// they sit over its middle, and what they should echo is the picture itself.
//
// The whole picture cannot be read the way the slice is. Averaging it in RGB
// first lets its colours cancel, and what is left is not a weaker version of the
// picture's hue but a different one — a pale warm portrait averages to a
// near-neutral that lands on blue. So the hues go round as unit vectors, each
// pixel weighted by the colour it actually carries, which points at the
// direction the picture leans in instead of the sum of everything in it.
//
// `confidence` is how much those hues agreed: 1 when they all point the same
// way, 0 when the picture has no direction at all. It is what separates a grey
// wallpaper — one colour, thinly held, which is exactly the case worth reading
// and worth colouring — from a photograph of many colours that average to none.
function hueOfPixels(data) {
    let x = 0;
    let y = 0;
    let weight = 0;
    let saturation = 0;
    const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
        const { hue, saturation: s } = hslOf(
            data[i] / 255,
            data[i + 1] / 255,
            data[i + 2] / 255
        );
        saturation += s;
        // Squared, so a pixel that hardly carries a colour hardly gets a vote —
        // near-grey pixels have a hue, and no business having one.
        const w = s * s;
        const angle = hue * Math.PI * 2;
        x += w * Math.cos(angle);
        y += w * Math.sin(angle);
        weight += w;
    }
    let hue = Math.atan2(y, x) / (Math.PI * 2);
    if (hue < 0) hue += 1;
    return {
        hue: Math.round(hue * 360),
        saturation: saturation / count,
        confidence: weight ? Math.hypot(x, y) / weight : 0,
    };
}

mixins.home = {
    mounted() {
        let background = this.$refs.homeBackground;
        let images = background.dataset.images.split(",");
        let id = Math.floor(Math.random() * images.length);
        this.showWallpaper(background, images[id]);
        this.menuColor = true;
        this.initPostClamp();
        this.scheduleHeightCache();
        window.addEventListener("resize", this.onResize);
    },
    unmounted() {
        window.removeEventListener("resize", this.onResize);
    },
    methods: {
        homeClick() {
            window.scrollTo({ top: window.innerHeight, behavior: "smooth" });
        },
        // Sets the wallpaper and tints the page to match it.
        //
        // One request feeds both consumers. The tint is sampled from the
        // picture's own pixels, which are only readable when the response is a
        // CORS one, and the stylesheet is then pointed at those same bytes —
        // an object URL — instead of being handed the remote URL and fetching
        // the wallpaper a second time. That matters twice over: it halves the
        // bytes the visitor downloads, and a plain request for a URL that was
        // cached as a CORS response (or the reverse) is refused outright, so
        // two requests for one picture were also the thing standing between the
        // page and a working tint.
        //
        // Only the bottom slice of the wallpaper matters: that is the part the
        // fade dissolves into the page, so it is the part the background has to
        // agree with.
        async showWallpaper(element, url) {
            try {
                const response = await fetch(url, { mode: "cors" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const picture = await createImageBitmap(blob);
                try {
                    const size = 32;
                    const canvas = document.createElement("canvas");
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(
                        picture,
                        0,
                        picture.height * TINT_SAMPLE_FROM,
                        picture.width,
                        picture.height * (1 - TINT_SAMPLE_FROM),
                        0,
                        0,
                        size,
                        size
                    );
                    // Published as variables rather than written straight onto
                    // backgroundColor, because more than one thing reads them:
                    // body paints --page-bg, the hero's dissolve layer and the
                    // chrome on the cards read --tint-deep. One sample, one hue,
                    // so nothing can end up disagreeing about the colour.
                    const tint = tintFromPixels(
                        ctx.getImageData(0, 0, size, size).data
                    );
                    document.body.style.setProperty("--page-bg", tint.page);
                    document.body.style.setProperty("--tint-deep", tint.deep);
                    // The rings again, off the whole picture this time.
                    ctx.clearRect(0, 0, size, size);
                    ctx.drawImage(picture, 0, 0, picture.width, picture.height, 0, 0, size, size);
                    const whole = hueOfPixels(
                        ctx.getImageData(0, 0, size, size).data
                    );
                    const hue =
                        whole.confidence < LOOP_HUE_CONFIDENCE
                            ? tint.hue
                            : whole.hue;
                    const saturation = Math.max(whole.saturation, LOOP_SAT_MIN);
                    LOOP_HUE_OFFSETS.forEach((offset, i) => {
                        const ring = coolYellow((hue + offset + 360) % 360);
                        // The walk, and the chroma it takes with it.
                        const ringSat =
                            saturation *
                            (1 - LOOP_YELLOW_TO_BLUE * ring.yellowness * 0.5);
                        document.body.style.setProperty(
                            `--loop-${i + 1}-h`,
                            Math.round(ring.hue)
                        );
                        document.body.style.setProperty(
                            `--loop-${i + 1}-s`,
                            `${Math.round(ringSat * 100)}%`
                        );
                    });
                } finally {
                    picture.close?.();
                }
                // Kept alive for the page's lifetime: the stylesheet decodes it
                // lazily, so revoking it here would blank the wallpaper.
                element.style.backgroundImage = `url('${URL.createObjectURL(blob)}')`;
            } catch (e) {
                // A bucket that does not allow this origin, or a network blip,
                // must not cost the visitor the picture itself: let the
                // stylesheet fetch it directly and keep the default background.
                element.style.backgroundImage = `url('${url}')`;
            }
        },
        initPostClamp() {
            this.$nextTick(() => {
                const posts = document.querySelectorAll("#home-posts .post");
                posts.forEach((post) => {
                    const desc = post.querySelector(".description");
                    const excerpt = desc?.querySelector(".excerpt-content");
                    if (!desc || !excerpt) return;
                    const lineHeight = 14 * 1.7;
                    const clampH = lineHeight * 10 + 30;
                    desc.style.setProperty("--clamp-h", clampH);
                    desc.style.maxHeight = clampH + "px";
                });
            });
        },
        // Measure the full height of swap-mode posts once, off the click path.
        // A `.full-content` that is display:none has never been laid out, so
        // reading its scrollHeight on click forces a full synchronous layout of
        // the whole article — the source of the freeze. Measuring it here (idle,
        // absolutely positioned / hidden so the page never moves) makes the click
        // handler read a cached value instead.
        scheduleHeightCache() {
            const run = () => {
                if (document.readyState !== "complete") {
                    setTimeout(run, 300);
                    return;
                }
                const measure = () => this.measureFullHeights();
                if ("requestIdleCallback" in window) {
                    requestIdleCallback(measure, { timeout: 2000 });
                } else {
                    setTimeout(measure, 2000);
                }
            };
            run();
        },
        measureFullHeights() {
            const posts = document.querySelectorAll(
                '#home-posts .post[data-has-more="true"]'
            );
            posts.forEach((post) => {
                if (post.dataset.single === "true") return; // no swap needed
                if (post.dataset.fullHeight) return;
                const desc = post.querySelector(".description");
                const full = post.querySelector(".full-content");
                if (!desc || !full) return;
                const width = desc.clientWidth;
                const prev = {
                    position: full.style.position,
                    display: full.style.display,
                    visibility: full.style.visibility,
                    left: full.style.left,
                    top: full.style.top,
                    width: full.style.width,
                    maxHeight: full.style.maxHeight,
                    contentVisibility: full.style.contentVisibility,
                };
                // content-visibility:auto would treat the offscreen probe as
                // skipped and report the contain-intrinsic-size estimate instead
                // of the real height — force a real layout while measuring.
                full.style.contentVisibility = "visible";
                full.style.position = "absolute";
                full.style.left = "-99999px";
                full.style.top = "0";
                full.style.visibility = "hidden";
                full.style.width = width + "px";
                full.style.display = "block";
                full.style.maxHeight = "none";
                post.dataset.fullHeight = full.scrollHeight; // one-time layout
                Object.assign(full.style, prev);
            });
        },
        onResize() {
            if (this._resizeTimer) clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => {
                document
                    .querySelectorAll('#home-posts .post[data-has-more="true"]')
                    .forEach((post) => delete post.dataset.fullHeight);
                this.measureFullHeights();
            }, 200);
        },
        toggleExpand(event) {
            const post = event.target.closest(".post");
            if (!post) return;
            const desc = post.querySelector(".description");
            const moreBtn = post.querySelector(".more-center");
            const excerpt = post.querySelector(".excerpt-content");
            const full = post.querySelector(".full-content");
            const moreText = moreBtn?.querySelector(".more-text");
            const isExpanded = desc.classList.contains("expanded");
            const clampH =
                parseFloat(desc.style.getPropertyValue("--clamp-h")) || 268;

            if (isExpanded) {
                this.collapse(desc, moreBtn, moreText, excerpt, full, clampH, post);
            } else {
                this.expand(desc, moreBtn, moreText, excerpt, full, post);
            }
        },
        expand(desc, moreBtn, moreText, excerpt, full, post) {
            const isSingle = post?.dataset.single === "true";
            // Current rendered (clamped) height — offsetHeight, NOT scrollHeight.
            // scrollHeight is the unclipped full height, which made the old
            // animation a no-op (both keyframes identical → content snapped open).
            const startH = desc.offsetHeight;

            // Target height, resolved without forcing layout in the click path:
            // - single mode: the full article is already in the visible excerpt
            //   subtree, so scrollHeight is a cheap, cached read.
            // - swap mode: use the idle-measured cache; only fall back to a live
            //   read if measurement hasn't run yet (first click, rare).
            let endH;
            if (isSingle) {
                endH = desc.scrollHeight;
            } else {
                const cached = parseFloat(post?.dataset.fullHeight);
                endH = Number.isFinite(cached) ? cached : null;
            }

            // Pin the start state so the WAAPI from-keyframe matches.
            desc.style.maxHeight = startH + "px";
            desc.offsetHeight; // force layout (small, clamped state)

            // Swap to full content (swap mode only) and settle it into view:
            // a soft fade-up that runs in parallel with the height glide.
            if (!isSingle && full) {
                if (excerpt) excerpt.style.display = "none";
                full.style.display = "";
                full.style.opacity = "0";
                full.style.transform = "translateY(18px)";
                full.offsetHeight; // commit the hidden start state
                full.style.transition =
                    `opacity ${SETTLE_MS}ms ${EXPAND_EASING}, transform ${SETTLE_MS}ms ${EXPAND_EASING}`;
                full.style.opacity = "1";
                full.style.transform = "translateY(0)";
                if (endH === null) endH = desc.scrollHeight; // fallback
            }
            if (endH === null || endH <= startH) endH = startH;

            // Drop the excerpt's bottom fade immediately: .expanded swaps the
            // mask out, and the transition on that rule carries it away.
            desc.classList.add("expanded");
            if (moreBtn) moreBtn.classList.add("expanded");
            if (moreText) moreText.textContent = "COLLAPSE";
            if (post) post.classList.add("animating");

            desc.animate(
                { maxHeight: [startH + "px", endH + "px"] },
                {
                    duration: travelMs(endH - startH),
                    easing: EXPAND_EASING,
                    fill: "forwards",
                }
            ).onfinish = () => {
                desc.style.maxHeight = "none";
                if (post) post.classList.remove("animating");
            };
        },
        collapse(desc, moreBtn, moreText, excerpt, full, clampH, post) {
            const isSingle = post?.dataset.single === "true";
            const startH = desc.offsetHeight;
            desc.style.maxHeight = startH + "px";
            desc.offsetHeight; // force layout

            // Swap back to excerpt (swap mode only) and reset the settle styles
            // applied by the last expand so the next one re-fades cleanly.
            if (!isSingle && full) {
                full.style.display = "none";
                full.style.opacity = "";
                full.style.transform = "";
                full.style.transition = "";
                if (excerpt) excerpt.style.display = "";
            }

            // Put the excerpt's bottom fade back
            desc.classList.remove("expanded");
            if (moreBtn) moreBtn.classList.remove("expanded");
            if (moreText) moreText.textContent = "MORE";
            if (post) post.classList.add("animating");

            desc.animate(
                { maxHeight: [startH + "px", clampH + "px"] },
                {
                    duration: collapseMs(startH - clampH),
                    easing: COLLAPSE_EASING,
                    fill: "forwards",
                }
            ).onfinish = () => {
                desc.style.maxHeight = clampH + "px";
                if (post) post.classList.remove("animating");
            };
        },
    },
};
