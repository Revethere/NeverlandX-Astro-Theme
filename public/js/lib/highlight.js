// The fold: the block shows this many lines and no more. Everything past it is
// taken out of the layout rather than left to overflow, so not even the line
// numbers of later lines can be seen through the fade.
const CODE_VISIBLE_LINES = 25;
// Of those lines, how many the tail fades out over — so the fade finishes on the
// last line the block shows, instead of running on past it. One line was too
// abrupt to read as a fade at all: a code line is short on ink, and if the line
// it started on happened to be blank or a closing brace there was nothing there
// to see it happen to.
const CODE_FADE_LINES = 4;
// Tuning for the unfold/refold glide, in the home page's shape and curves.
const CODE_EXPAND_EASING = "cubic-bezier(0.22, 1, 0.36, 1)"; // ease-out-quint
const CODE_COLLAPSE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const codeTravelMs = (px) => Math.min(800, Math.round(320 + px * 0.08));
const codeCollapseMs = (px) => Math.min(600, Math.round(280 + px * 0.05));

mixins.highlight = {
    data() {
        return { copying: false };
    },
    created() {
        hljs.configure({ ignoreUnescapedHTML: true });
        this.renderers.push(this.highlight);
    },
    methods: {
        sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        },
        highlight() {
            let codes = document.querySelectorAll("pre");
            for (let i of codes) {
                // The fold below outlives the innerHTML rewrite that is about to
                // happen, so start every block from a clean slate — crypto.js
                // re-runs the renderers once a post has been decrypted.
                i.classList.remove("code-collapsible", "code-collapsed");
                i.style.removeProperty("--code-visible-lines");
                i.style.removeProperty("--code-fade-h");
                delete i.dataset.codeFull;
                delete i.dataset.codeFold;
                let code = i.textContent;
                let language = [...i.classList, ...i.firstChild.classList][0] || "plaintext";
                let highlighted;
                try {
                    highlighted = hljs.highlight(code, { language }).value;
                } catch {
                    highlighted = code;
                }
                i.innerHTML = `
                <div class="code-content hljs">${highlighted}</div>
                <div class="language">${language}</div>
                <div class="copycode">
                    <i class="fa-solid fa-copy fa-fw"></i>
                    <i class="fa-solid fa-check fa-fw"></i>
                </div>
                `;
                let content = i.querySelector(".code-content");
                hljs.lineNumbersBlock(content, { singleLine: true });
                let copycode = i.querySelector(".copycode");
                copycode.addEventListener("click", async () => {
                    if (this.copying) return;
                    this.copying = true;
                    copycode.classList.add("copied");
                    await navigator.clipboard.writeText(code);
                    await this.sleep(1000);
                    copycode.classList.remove("copied");
                    this.copying = false;
                });
                // The line-number table is not built here: lineNumbersBlock
                // hands the work to a setTimeout of its own. That table is what
                // gives the block its height, so the fold has to be queued
                // behind that timer — this callback is the first point at which
                // the block is finished.
                setTimeout(() => this.collapseLongCode(i, content, code), 0);
            }
        },
        // Folds a block that runs past CODE_VISIBLE_LINES and hangs the toggle
        // on it.
        collapseLongCode(pre, content, code) {
            // Article bodies, and the home page's cards — both the full text a
            // card swaps in once MORE is clicked, and a single-mode card's
            // excerpt, which is the whole post. A swap-mode card's excerpt is
            // deliberately left out: its code is only ever seen through the
            // card's own 268px clamp, so a fold there would be a toggle that
            // does nothing.
            const inCard = pre.closest(
                ".full-content, .post[data-single='true'] .excerpt-content"
            );
            if (!inCard && !pre.closest(".article .content")) return;
            // A fence always closes with a newline, but that one is where the
            // cursor sits rather than a line of code, so it does not count.
            if (code.replace(/\n+$/, "").split("\n").length <= CODE_VISIBLE_LINES) return;

            // Both heights are resolved here from the block's own geometry
            // rather than read back off the box later. Folded, a still-filling
            // unfold keeps max-height pinned at its own end value, and an
            // animation outranks both the class and the inline style — so the
            // box would report that instead of the fold. Unfolded, a card's
            // .full-content is display:none and reports nothing at all.
            // getComputedStyle answers either way. Same arithmetic as the clamp
            // in main.css: the code font's line box per shown line, plus the
            // block's own paddings.
            const box = getComputedStyle(content);
            const lineH = parseFloat(box.lineHeight);
            pre.dataset.codeFull = content.offsetHeight;
            pre.dataset.codeFold = Math.round(
                parseFloat(box.paddingTop) +
                    CODE_VISIBLE_LINES * lineH +
                    parseFloat(box.paddingBottom)
            );
            pre.style.setProperty("--code-visible-lines", CODE_VISIBLE_LINES);
            pre.style.setProperty("--code-fade-h", Math.round(CODE_FADE_LINES * lineH) + "px");

            // The rows past the last shown line leave the layout outright, so
            // that nothing of them shows through the fade or the padding under
            // it. Clipping alone would leave their line numbers on display.
            [...content.querySelectorAll("tr")].forEach((row, index) => {
                if (index >= CODE_VISIBLE_LINES) row.classList.add("code-hidden-line");
            });
            pre.classList.add("code-collapsible", "code-collapsed");

            let toggle = document.createElement("div");
            toggle.className = "code-toggle";
            toggle.title = "展开代码";
            toggle.innerHTML = '<i class="fa-solid fa-caret-down fa-fw"></i>';
            toggle.addEventListener("click", () => this.toggleCode(pre, content, toggle));
            pre.appendChild(toggle);
        },
        toggleCode(pre, content, toggle) {
            // Read before anything is written: this is the folded height while
            // the block is closed and the full height while it is open — either
            // way, the height the glide has to start from.
            let startH = content.offsetHeight;

            if (pre.classList.contains("code-collapsed")) {
                let endH = parseFloat(pre.dataset.codeFull) || 0;
                pre.classList.remove("code-collapsed");
                if (endH <= startH) {
                    // No usable measurement — the block was still hidden when
                    // the renderer ran, as it is inside a card's .full-content.
                    // The class is off now, so drop the height the last fold
                    // pinned and read the real one; the pin below puts the box
                    // back where it started in this same frame, so nothing
                    // paints unfolded in between.
                    content.style.removeProperty("max-height");
                    endH = content.offsetHeight;
                    if (endH > startH) pre.dataset.codeFull = endH;
                }
                // Still nothing (the block is not laid out at all): unfold
                // without travelling. onfinish lands on the real height anyway.
                if (endH <= startH) endH = startH;
                content.style.maxHeight = startH + "px";
                toggle.title = "收起代码";

                content
                    .animate(
                        { maxHeight: [startH + "px", endH + "px"] },
                        {
                            duration: codeTravelMs(endH - startH),
                            easing: CODE_EXPAND_EASING,
                            fill: "forwards",
                        }
                    )
                    .onfinish = () => {
                        content.style.maxHeight = "none";
                    };
            } else {
                // Fold, to the height stored when the block was folded.
                let endH = parseFloat(pre.dataset.codeFold) || startH;
                content.style.removeProperty("max-height");
                pre.classList.add("code-collapsed");
                content.style.maxHeight = startH + "px";
                toggle.title = "展开代码";

                content
                    .animate(
                        { maxHeight: [startH + "px", endH + "px"] },
                        {
                            duration: codeCollapseMs(startH - endH),
                            easing: CODE_COLLAPSE_EASING,
                            fill: "forwards",
                        }
                    )
                    .onfinish = () => {
                        content.style.maxHeight = endH + "px";
                    };
            }
        },
    },
};
