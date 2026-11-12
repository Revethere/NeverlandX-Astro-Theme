import { articleThemes } from "./article-themes.js";

export const site = {
    title: "NeverlandX",
    subtitle: "",
    description: "your descriptio",
    keywords: "astro, blog, theme",
    author: "your name",
    language: "zh",
    url: "https://example.com",
    perPage: 5,
};

export const theme = {
    avatar: "/images/avatar.webp",

    background: [
        "/images/background_00.webp",
        "/images/background_01.webp",
        "/images/background_02.webp",
    ],

    colors: ["#ffa2c4", "#00bcd4", "#03a9f4", "#00a596", "#ff7d73"],
    tagColors: {
        scheme: "hash",
        salt: "",
        avoidAdjacentDuplicates: true,
    },

    menu: {
        Home: { name: "house", theme: "solid", link: "/" },
        About: { name: "id-card", theme: "solid", link: "/about/" },
        Logs: { name: "scroll", theme: "solid", link: "/logs/" },
        Friends: { name: "user", theme: "solid", link: "/friends/" },
        Moments: { name: "images", theme: "solid", link: "/moments/" },
        // The archive page is the only browse view: tags and categories are
        // filters in its search panel now, so the old group's children are gone.
        Archives: { name: "box-archive", theme: "solid", link: "/archives/" },
    },

    moments: {
        // Off hides /moments/ entirely: its page and feed chunks are not built and
        // the menu entry disappears. The content file can stay where it is.
        enable: true,

        note: "",
        entryAvatar: false,
        // Cloudflare Worker from worker/ that fetches metadata the browser cannot read
        // itself (Bilibili / NetEase / QQ Music). Leave empty and only YouTube / Spotify
        // cards get a title and a cover.
        mediaProxy: "",
    },

    card: {
        enable: true,
        description: "your description\nyour description",
        iconLinks: {
            envelope: {
                name: "envelope",
                theme: "solid",
                link: "mailto:hi@example.com",
            },
            qq: {
                name: "qq",
                theme: "brands",
                link: "http://wpa.qq.com/msgrd?v=3&uin=10000&site=qq&menu=yes",
            },
            github: {
                name: "github",
                theme: "brands",
                link: "https://github.com/yourname",
            },
            bilibili: {
                name: "bilibili",
                theme: "brands",
                link: "https://space.bilibili.com/1",
            },
        },
        daysSince: "2024-01-01",
    },

    // Article themes live in src/article-themes.js; a post picks one with
    // `theme: <name>` in its front matter, unknown names fall back to default.
    articleThemes,

    footer: {
        since: 2024,
        icp: { enable: false, code: "", link: "" },
    },

    polyfill: { enable: true, features: ["default"] },
    highlight: { enable: true, style: "github" },
    math: { enable: true },
    preview: { enable: true },
    crypto: { enable: false },
    search: { enable: true },

    friends: [
        {
            name: "Example",
            avatar: "/images/avatar.png",
            description: "",
            link: "https://example.com/",
        },
    ],
};
