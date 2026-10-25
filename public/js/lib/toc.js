// Article page header: extracts the post's h2–h6 headings into a sticky glass
// bar. Clicking an entry smooth-scrolls to that section; as you read, the
// section currently in view is highlighted (scrollspy).
mixins.toc = {
    mounted() {
        this.initArticleToc();
    },
    unmounted() {
        if (this._onTocScroll) {
            window.removeEventListener("scroll", this._onTocScroll);
        }
    },
    methods: {
        initArticleToc() {
            const content = document.querySelector(".article .content");
            const side = document.querySelector(".article-side");
            const toc = document.querySelector(".article-side-toc");
            if (!content || !side || !toc) return;
            const headings = content.querySelectorAll("h2, h3, h4, h5, h6");
            if (!headings.length) return;

            const entries = [];
            headings.forEach((h) => {
                // h2 → 0, h3 → 1, … — drives the left indent of each chip
                const level = parseInt(h.tagName.slice(1), 10) - 2;
                const item = document.createElement("a");
                item.className = "article-toc-item";
                item.style.setProperty("--level", Math.max(0, level));
                item.textContent = h.textContent.trim();
                if (h.id) item.href = "#" + h.id; // graceful fallback if JS dies
                item.addEventListener("click", (e) => {
                    e.preventDefault();
                    h.scrollIntoView({ behavior: "smooth", block: "start" });
                });
                toc.appendChild(item);
                entries.push({ heading: h, item });
            });

            side.style.display = "flex";

            // Scrollspy: highlight the last heading whose top is above the line.
            this._onTocScroll = () => {
                if (this._tocTicking) return;
                this._tocTicking = true;
                requestAnimationFrame(() => {
                    this._tocTicking = false;
                    const offset = 100; // fixed nav + a little margin
                    let current = entries[0];
                    for (const entry of entries) {
                        if (entry.heading.getBoundingClientRect().top <= offset) {
                            current = entry;
                        } else break;
                    }
                    entries.forEach((entry) => {
                        entry.item.classList.toggle("active", entry === current);
                    });
                    // keep the active item visible in the TOC list — only if
                    // the sidebar is actually on screen, to avoid page jumps
                    const rect = side.getBoundingClientRect();
                    if (
                        current &&
                        rect.bottom > 0 &&
                        rect.top < window.innerHeight
                    ) {
                        current.item.scrollIntoView({
                            block: "nearest",
                            inline: "nearest",
                        });
                    }
                });
            };
            window.addEventListener("scroll", this._onTocScroll, {
                passive: true,
            });
            this._onTocScroll();
        },
    },
};
