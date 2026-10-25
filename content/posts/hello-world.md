---
title: 你好，世界
date: 2025-08-07 20:00:00
tags:
- Astro
- 主题
categories: 随笔
---

## 这是一篇示例文章

主题自带的示例内容（`content/posts/hello-world.md`）。正文就是普通的 markdown，
写完后 `npm run dev` 就能看到效果，不需要重启。

代码块会由 highlight.js 在浏览器里高亮，语言写在围栏后面即可：

```js
export function greet(name) {
    return `Hello, ${name}!`;
}
```

行内代码 `like this`、**加粗**、*斜体*、~~删除线~~ 都按原样渲染。
需要遮住剧透时可以写 %%被遮住的文字%%，鼠标移上去或点一下才会显示。

数学公式交给 KaTeX，`$...$` 是行内，`$$...$$` 是独立成段（独立公式写成一行）：

$$\int_{-\infty}^{\infty} e^{-x^2}\,\mathrm{d}x = \sqrt{\pi}$$

## 图片

正文里的图片会被点开放大，多张图并排写就能排成一行：

![示例图一](/images/background_01.jpg)
![示例图二](/images/background_02.jpg)
![示例图三](/images/background_03.jpg)

## 视频与音乐

一行里只放一个链接时，会渲染成紧凑的卡片（写法见 README 的「分享视频和音乐」）。
卡片数据来自 `content/data/media.json`，由 `npm run media` 抓取，构建时只读缓存。
