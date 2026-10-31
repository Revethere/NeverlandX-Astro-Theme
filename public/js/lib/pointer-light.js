/* A light that grazes the edge of whatever surface the pointer is over.
   The page is paper with frosted surfaces on it, so a highlight poured over a
   surface would only wash its text out — but the edge of a surface is exactly
   where light from outside would land. So the border itself is lit: a masked
   band painted over the border, brightest under the cursor and fading away along
   the perimeter, in near-white with the faintest lavender in the tail so it sits
   in the page's palette instead of reading as a coloured outline.
   It covers cards, the archive search pill, filter chips, the table of contents
   and the pagination, because they are all the same material.
   Kept out of the JS registry on purpose: it is decoration, not app state, and
   nothing else needs to know it exists. It also has to run before the first
   frame of a scroll-heavy page, so it latches the pointer move itself instead of
   waiting for the app to be mounted.
   Three rules that keep it from becoming a gimmick:
   - only on precise pointers (a finger has no hover, and a touch-screen laptop
     would flash it on every tap),
   - never for prefers-reduced-motion,
   - only opacity animates, so a band cannot outlive the pointer. */
(function () {
    "use strict";

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var fine = window.matchMedia("(pointer: fine)");
    if (!fine.matches || reduce.matches) return;

    /* Surfaces that take the light. Kept as a selector rather than an attribute
       so a surface added later inherits the behaviour without touching its
       markup. Cards first, then the controls that are the same material: the
       search pill, its filter chips and toggle, the table of contents,
       pagination, and the two expand controls on a post card. The filter panel
       itself is left out on purpose — it is a wide sheet rather than a card, and
       a lit border around a whole sheet of options pulls the eye away from the
       options. */
    var SURFACES = [
        ".post",
        ".article",
        ".timeline-content",
        ".friend-card",
        ".moment-media",
        "#card-style",
        ".archive-search",
        ".archive-option",
        ".filter-toggle",
        ".article-side",
        ".article-toc-item",
        ".page-current a",
        ".more-center",
        ".collapse-arrow",
    ].join(", ");

    var current = null;

    function ringOf(surface) {
        if (surface.__lightRing) return surface.__lightRing;
        var ring = document.createElement("span");
        ring.className = "light-ring";
        ring.setAttribute("aria-hidden", "true");
        if (getComputedStyle(surface).position === "static") surface.style.position = "relative";
        surface.appendChild(ring);
        surface.__lightRing = ring;
        return ring;
    }

    function hit(surface, px, py) {
        if (surface === current) {
            if (surface) {
                var rect = surface.getBoundingClientRect();
                surface.style.setProperty("--sx", px - rect.left + "px");
                surface.style.setProperty("--sy", py - rect.top + "px");
            }
            return;
        }
        if (current) current.classList.remove("light-hit");
        current = surface;
        if (!surface) return;
        var box = surface.getBoundingClientRect();
        ringOf(surface);
        surface.style.setProperty("--sx", px - box.left + "px");
        surface.style.setProperty("--sy", py - box.top + "px");
        /* The band sits above the surface's own border — no stacking context
           needed, because it only ever paints the outermost pixels of the box. */
        surface.classList.add("light-hit");
    }

    window.addEventListener(
        "pointermove",
        function (event) {
            if (event.pointerType === "touch") return;
            hit(
                event.target && event.target.closest ? event.target.closest(SURFACES) : null,
                event.clientX,
                event.clientY
            );
        },
        { passive: true }
    );

    /* Leaving the window or the tab drops the light instead of freezing it on
       whichever surface happened to be under the pointer last. */
    function clear() {
        if (!current) return;
        current.classList.remove("light-hit");
        current = null;
    }

    document.documentElement.addEventListener("mouseleave", clear);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) clear();
    });
})();
