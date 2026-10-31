# NeverlandX

由 Astro 重构的 Hexo 主题 [ParticleX](https://github.com/theme-particlex/hexo-theme-particlex) 的分支。陆陆续续改了一年左右吧，跟原主题还是有相当大的出入。

## 演示

- [revethere.me](https://revethere.me)

## 部分特性及与 ParticleX 的差异

- 首页轮换壁纸及圆环会根据背景图进行一定程度的上色，并为圆环增加了一些质感。
- 归档页搜索支持文章内容。`Front-matter` 新增 `Outdated` 设置。
- 标签 / 分类根据名字按颜色哈希生成，不再出现原主体构建一次换一个色儿的情况。
- 新增 Moments 页面。
- 文章页新增目录。首页文章自动缩略。
- Markdown 新增遮罩语法。代码块自动缩略。
- 加载页更改。

## 目录结构

```
.
├── astro.config.mjs         
├── package.json
├── src
│   ├── site.config.js       # 站点信息与主题设置
│   ├── layouts/Base.astro   # head、加载动画、菜单、页脚、脚本等
│   ├── components/
│   ├── pages/               # 首页、归档、标签、分类、友链、日志、朋友圈、文章页
│   └── lib/
│       ├── content.js       # 生成文章、分类、标签、统计
│       ├── markdown.js      
│       ├── moments.js       # 朋友圈解析
│       └── media-providers.js / media.js
├── content
│   ├── posts/               # 文章
│   ├── pages/               # 关于 / 友链 / 日志 / 朋友圈 / 分类 / 标签
├── public
│   ├── css/main.css
│   ├── js/
│   └── images/              # 头像、壁纸
├── integrations/backgrounds.mjs   # 只把被引用的图片打进构建产物
└── worker/                  # 可选：给 B 站 / 网易云 / QQ 音乐抓元数据的小代理
```

## 安装

### 环境要求

- Node.js ≥ 22
- npm / pnpm / yarn 任意

### 快速开始

```cmd
git clone https://github.com/Revethere/NeverlandX-Astro-Theme.git blog --depth=1
cd blog
npm install
npm run dev
```

构建：

```cmd
npm run build
npm run preview
```

## 配置

大多数配置内容都位于 `src/site.config.js`，其中 `site` 是站点信息，`theme` 是主题选项。

### `site` 配置：

```js
export const site = {
    title: "NeverlandX",
    subtitle: "",
    description: "your description:",
    keywords: "astro, blog, theme",
    author: "your name",
    language: "zh",
    url: "https://example.com",   // 必改
    perPage: 5,
};
```

### `theme` 配置中的几个常用项：

| 配置项                                      | 作用                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| `avatar`                                    | 头像，本地路径（`/images/avatar.png`）或 https 地址      |
| `background`                                | 首页壁纸池，数组，每次访问随机取一张                     |
| `colors` / `tagColors`                      | 分类、标签胶囊的调色板与取色方式                         |
| `menu`                                      | 主菜单，键的顺序即渲染顺序；带 `children` 的会变成下拉组 |
| `moments`                                   | 朋友圈页头的小字                                         |
| `card`                                      | 首页右侧个人信息卡片                                     |
| `footer`                                    | 版权起始年份、备案号                                     |
| `highlight` / `math` / `preview` / `search` | 各功能的开关                                             |
| `friends`                                   | 友链列表                                                 |

## 功能

文章放在 `content/posts/`。

### 写文章

新增的 front matter 字段：

- `toc`：是否开启文章右侧目录。目录支持跟踪当前标题、自动滚动活动目录项及跳转选定标题。
- `outdated`：其值为 `true` 时首页不再渲染该文章，归档页搜索时带上 OUTDATE 标签。

已支持的扩展语法：

- 遮罩：用法 `%%需要遮罩的文字%%`。
- 视频内联：`[](Bilibili:BV号)`、`[](Youtube:Video ID)`。

### 日志（Logs）

`content/pages/logs.md` 每段日志以 `## DATE` 开头：

```markdown
## 2026-01-01 // 写成 26.01.01 也行，根据内容渲染
> what's new?
> nothing new.
```

### 朋友圈（Moments）

~~其实是一个人的朋友圈 XD。~~

图片多了有点性能问题，尽量在改了。

`content/pages/moments.md` 每条动态以 `## DATE TIME` 开头，日期下面可以跟一行 `> LOCATION`：

```markdown
## 2026-01-01 00:00
> 重庆

新年快乐！

![](/images/happynewyear.png)
```

每条动态里的图片、时间、地点排布和显示参考微信，右侧日历参考 QQ。

支持分享视频、音乐：

```markdown
[Bilibili](Bilibili:BV号)
[YouTube](YouTube:VideoID)
[QQ 音乐](https://music.163.com/#/song?id=xxx)
[网易云音乐](https://y.qq.com/n/ryqq/songDetail/xxx)
[Spotify](https://open.spotify.com/track/xxx)
```

由于浏览器能直接抓取的只有 YouTube 和 Spotify；B 站的接口带 `Origin` 会返回 403，网易云 / QQ 音乐没有 CORS 头也不支持 JSONP，酷狗没有公开接口。
`worker/` 是一个 Cloudflare Worker 代理，用于抓取元数据：

```bash
cd worker
npx wrangler login
npx wrangler deploy      # https://<name>.<子域>.workers.dev
```

把打印出来的地址填进配置：

```js
// src/site.config.js
moments: {
    mediaProxy: "https://<name>.<子域>.workers.dev",
},
```

由于 B 站 ban 了数据中心的 IP，因此卡片信息在每次构建时抓取并写入 `src/lib/bilibili-snapshot.json`。

## 许可

MIT.