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
        Friends: { name: "user", theme: "solid", link: "/friends/" },
        Moments: { name: "images", theme: "solid", link: "/moments/" },
        Archives: {
            name: "box-archive",
            theme: "solid",
            link: "/archives/",
            children: {
                Logs: { link: "/logs/" },
                Categories: { link: "/categories/" },
                Tags: { link: "/tags/" },
            },
        },
    },

    moments: {
        note: "",
        entryAvatar: false,
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
