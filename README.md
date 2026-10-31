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
[YouTube](YouTube:Video ID)
[QQ 音乐](https://music.163.com/#/song?id=xxx)
[网易云音乐](https://y.qq.com/n/ryqq/songDetail/xxx)
[Spotify](https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC)
```

不建议使用酷狗~~因为没接口）~~。

元数据**不缓存**：每次打开页面，卡片自己取一次，所以新贴的链接不用跑任何命令。

浏览器能直接取的只有 YouTube 和 Spotify（它们的 oEmbed 允许跨域）；B 站的接口带
`Origin` 会返回 403，网易云 / QQ 音乐没有 CORS 头也不支持 JSONP，酷狗没有公开接口。
这三家要显示封面和播放量，就得搭一个小代理——仓库里的 `worker/` 是一个 Cloudflare
Worker（免费额度足够，约 200 行）：

```bash
cd worker
npx wrangler login
npx wrangler deploy      # 会打印一个 https://<name>.<子域>.workers.dev
```

把打印出来的地址填进配置即可：

```js
// src/site.config.js
moments: {
    mediaProxy: "https://<name>.<子域>.workers.dev",
},
```

详细说明见 `worker/README.md`。`mediaProxy` 留空也能用：YouTube / Spotify 正常显示，
其它平台保持「标题 + 服务名 + 占位图标」的降级样子；代理挂掉时也走同样的降级，卡片
始终是一个能点的链接。Worker 侧按「平台 + 编号」在边缘缓存 1 小时，刷新不会把上游打爆。
### B 站的例外

B 站连 Worker 都不放行：所有 `*.bilibili.com` 对数据中心的 IP 一律返回 `412`（API、网页、
移动页、换 UA / Cookie 都一样）。所以 B 站卡片的数据由构建脚本抓：`npm run build` 会先跑
`scripts/refresh-bilibili.mjs`（`prebuild`），扫描正文和朋友圈里的 `Bilibili:BV…` 链接，
把标题、封面、播放量、点赞、弹幕写进 `src/lib/bilibili-snapshot.json`；24 小时内不重复抓，
抓不到就沿用旧值。想立刻刷新跑 `npm run bilibili -- --force`。

结果是：B 站的数字跟着**部署**更新，YouTube / Spotify / 网易云 / QQ 音乐跟着**刷新页面**更新。

## 许可

MIT.