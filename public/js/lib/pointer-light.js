/* A rim light on the edge of whichever card the pointer is over.
   The cards are opaque white or frosted, so a highlight poured over them would
   only wash the text out — but a card's edge is exactly where light from outside
   would land. So the border itself is lit: a masked ring painted over the card's
   own border, brightest under the cursor, fading along the perimeter, with a
   tight drop-shadow so the bloom hugs the lit stretch instead of glowing evenly
   around the whole box.
   Kept out of the JS registry on purpose: it is decoration, not app state, and
   nothing else needs to know it exists. It also has to run before the first
   frame of a scroll-heavy page, so it latches the pointer move itself instead of
   waiting for the app to be mounted.
   Three rules that keep it from becoming a gimmick:
   - only on precise pointers (a finger has no hover, and a touch-screen laptop
     would flash it on every tap),
   - never for prefers-reduced-motion,
   - only opacity animates, so a ring cannot outlive the pointer. */
(function () {
    "use strict";

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var fine = window.matchMedia("(pointer: fine)");
    if (!fine.matches || reduce.matches) return;

    /* Cards that take the rim light. Kept as a selector rather than an attribute
       so a card added later inherits the behaviour without touching its markup. */
    var CARDS = ".post, .article, .timeline-content, .friend-card, .moment-media, #card-style";

    var currentCard = null;

    function rimOf(card) {
        if (card.__lightRim) return card.__lightRim;
        var rim = document.createElement("span");
        rim.className = "light-rim";
        rim.setAttribute("aria-hidden", "true");
        if (getComputedStyle(card).position === "static") card.style.position = "relative";
        card.appendChild(rim);
        card.__lightRim = rim;
        return rim;
    }

    function hitRim(card, px, py) {
        if (card === currentCard) {
            if (card) {
                var rect = card.getBoundingClientRect();
                card.style.setProperty("--sx", px - rect.left + "px");
                card.style.setProperty("--sy", py - rect.top + "px");
            }
            return;
        }
        if (currentCard) currentCard.classList.remove("light-hit");
        currentCard = card;
        if (!card) return;
        var box = card.getBoundingClientRect();
        rimOf(card);
        card.style.setProperty("--sx", px - box.left + "px");
        card.style.setProperty("--sy", py - box.top + "px");
        /* The ring sits above the card's border — no stacking context needed,
           because it only ever paints the outermost pixels of the box. */
        card.classList.add("light-hit");
    }

    window.addEventListener(
        "pointermove",
        function (event) {
            if (event.pointerType === "touch") return;
            hitRim(
                event.target && event.target.closest ? event.target.closest(CARDS) : null,
                event.clientX,
                event.clientY
            );
        },
        { passive: true }
    );

    /* Leaving the window or the tab drops the light instead of freezing it on
       whichever card happened to be under the pointer last. */
    function clear() {
        if (!currentCard) return;
        currentCard.classList.remove("light-hit");
        currentCard = null;
    }

    document.documentElement.addEventListener("mouseleave", clear);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) clear();
    });
})();
