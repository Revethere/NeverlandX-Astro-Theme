/**
 * Hydrate the media cards on the Moments page.
 *
 * The page ships with whatever the markdown already says (the author's link text
 * or a generic title, the service name, an icon tile). This script then asks for
 * the real metadata and fills in the cover, the title when the page only had a
 * placeholder, and the counts / artist line.
 *
 * Two sources are possible:
 *
 *   - `window.__MEDIA_PROXY__` set in site.config.js: every provider is asked
 *     through the worker, because Bilibili sends 403 to a browser request, and
 *     NetEase / QQ have no CORS header and no JSONP.
 *   - otherwise only YouTube and Spotify are asked directly from the browser —
 *     their oEmbed endpoints allow it. Everything else keeps the fallback.
 *
 * A failed fetch is not an error state: the card already renders, it just shows
 * less, so failures are swallowed silently.
 */
(function () {
    "use strict";

    var proxy = String(window.__MEDIA_PROXY__ || "").replace(/\/+$/, "");

    /** `1234` → `1.2k`, matching the unit rules the build used to use. */
    function formatCount(value) {
        var count = Number(value);
        if (!isFinite(count) || count <= 0) return "";
        var trim = function (text) {
            return text.replace(/\.0$/, "");
        };
        if (count < 1000) return String(Math.round(count));
        if (count < 10000) return trim((count / 1000).toFixed(1)) + "k";
        if (count < 1000000) return Math.round(count / 1000) + "k";
        return trim((count / 1000000).toFixed(1)) + "m";
    }

    function statsLine(data) {
        return [
            [data.views, "views"],
            [data.likes, "likes"],
            [data.danmu, "danmu"]
        ]
            .map(function (pair) {
                var formatted = formatCount(pair[0]);
                return formatted ? formatted + " " + pair[1] : "";
            })
            .filter(Boolean)
            .join(" · ");
    }

    function getJson(url) {
        return fetch(url, { mode: "cors" }).then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.json();
        });
    }

    /** YouTube / Spotify oEmbed: allowed from the browser, title + cover only. */
    function directMetadata(provider, id) {
        if (provider === "youtube") {
            var watch = "https://www.youtube.com/watch?v=" + encodeURIComponent(id);
            return fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(watch)).then(function (
                response
            ) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.json();
            }).then(function (payload) {
                return {
                    title: payload.title || "",
                    author: payload.author_name || "",
                    cover: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
                    meta: ""
                };
            });
        }

        if (provider === "spotify") {
            var track = "https://open.spotify.com/track/" + encodeURIComponent(id);
            return fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(track)).then(function (
                response
            ) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.json();
            }).then(function (payload) {
                return {
                    title: payload.title || "",
                    author: payload.author_name || "",
                    cover: payload.thumbnail_url || "",
                    meta: ""
                };
            });
        }

        return Promise.reject(new Error("no direct endpoint"));
    }

    function metadata(provider, id) {
        if (proxy) {
            var url = proxy + "/?p=" + encodeURIComponent(provider) + "&id=" + encodeURIComponent(id);
            return getJson(url)
                .then(function (payload) {
                    if (!payload || payload.error) throw new Error((payload && payload.error) || "bad payload");
                    return payload;
                })
                // A worker that is down (or a provider it does not cover) still
                // leaves YouTube and Spotify reachable straight from the browser.
                .catch(function () {
                    return directMetadata(provider, id);
                });
        }
        return directMetadata(provider, id);
    }

    function setCover(card, cover) {
        if (!cover) return;
        var current = card.querySelector(".moment-media-cover");
        if (current && current.tagName === "IMG") {
            if (current.getAttribute("src") !== cover) current.setAttribute("src", cover);
            return;
        }
        var image = document.createElement("img");
        image.className = "moment-media-cover";
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.referrerPolicy = "no-referrer";
        image.src = cover;
        if (current) current.replaceWith(image);
        else card.insertBefore(image, card.firstChild);
    }

    function setTitle(card, title) {
        if (!title) return;
        var node = card.querySelector(".moment-media-title");
        if (!node) return;
        // An author-written title always wins: only a placeholder is filled in.
        if (card.dataset.titleSource !== "fallback") return;
        node.textContent = title;
    }

    function setMeta(card, meta) {
        if (!meta) return;
        var node = card.querySelector(".moment-media-meta");
        if (node) {
            node.textContent = meta;
            return;
        }
        var body = card.querySelector(".moment-media-body");
        if (!body) return;
        node = document.createElement("span");
        node.className = "moment-media-meta";
        node.textContent = meta;
        body.appendChild(node);
    }

    function hydrate(card) {
        var provider = card.dataset.provider;
        var id = card.dataset.id;
        if (!provider || !id) return;
        // Bilibili cannot be reached from a browser or from a Worker, so its card
        // is rendered complete at build time — nothing to refresh.
        if (card.dataset.static === "true") return;

        metadata(provider, id)
            .then(function (data) {
                var kind = card.dataset.kind || "video";
                setCover(card, data.cover);
                setTitle(card, data.title);
                var meta = kind === "video" ? data.meta || statsLine(data) : data.author || data.meta || "";
                setMeta(card, meta);
            })
            .catch(function () {
                // Keep the server-rendered fallback; a card that cannot be
                // enriched is still a usable link.
            });
    }

    function start() {
        var cards = document.querySelectorAll(".moment-media[data-provider]");
        for (var index = 0; index < cards.length; index += 1) hydrate(cards[index]);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
