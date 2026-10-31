# Cloudflare Worker 部署

这个 Worker 只做一件事：把 B 站 / 网易云 / QQ 音乐这些**不允许浏览器跨域读取**的接口，
转成带 CORS 头的 JSON，供 Moments 页的媒体卡片在每次打开页面时实时抓取。

YouTube 和 Spotify 的 oEmbed 本身允许跨域，不配 Worker 也能显示标题和封面；
B 站、网易云、QQ 音乐（以及没有任何公开接口的酷狗）则需要它。

## 部署

```bash
cd worker
npx wrangler login          # 只需要一次，浏览器里授权你的 Cloudflare 账号
npx wrangler deploy
```

`wrangler.toml` 里的 `name` 可以改成你喜欢的名字，部署完会打印一个地址，形如：

```
https://neverlandx-media.<your-subdomain>.workers.dev
```

想用自己的域名（比如 `media.example.com`），在 `wrangler.toml` 里加一条 route：

```toml
routes = [{ pattern = "media.example.com", custom_domain = true }]
```

域名必须在同一个 Cloudflare 账号下。

## 接到博客上

把部署出来的地址填进博客的 `src/site.config.js`：

```js
moments: {
    note: "碎碎念 · 随手拍",
    mediaProxy: "https://neverlandx-media.<your-subdomain>.workers.dev",
},
```

留空则只在前端直连 YouTube / Spotify 的 oEmbed，其它平台的卡片显示你写的标题和平台名。

## 接口

```
GET /?p=<provider>&id=<id>
```

| 参数 | 取值 |
| --- | --- |
| `p` | `bilibili` / `youtube` / `netease` / `qqmusic` / `spotify` |
| `id` | B 站：`BV1…`、`av123`、`short/xxxx`；YouTube：视频 id；网易云：歌曲数字 id；QQ 音乐：`songmid`；Spotify：track id |

返回（字段按平台缺失时会为空）：

```json
{ "provider": "bilibili", "id": "BV1GJ411x7h7", "title": "…", "author": "…",
  "cover": "https://…", "views": 107634678, "likes": 2961884, "danmu": 151176,
  "meta": "107.6m views · 3m likes · 151k danmu" }
```

- 只有白名单里的平台会被转发，`id` 还要通过每个平台自己的形状校验——否则这个端点就成了
  任何人都能用的开放代理。
- 每个 `p`+`id` 的结果在 Cloudflare 边缘缓存 1 小时（`caches.default`），所以刷新页面不会
  每次都打到上游，也就不会被上游限流。
- 上游失败时返回 `502` 和 `{ "error": "…" }`；页面会保留 markdown 里写的标题，不会显示空白卡片。
- 酷狗没有公开接口，Worker 直接不支持它，卡片刻度降级为「标题 + 酷狗音乐」。
