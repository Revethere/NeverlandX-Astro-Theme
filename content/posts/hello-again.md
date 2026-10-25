---
title: 再写一篇，看看首页是怎么排的
date: 2025-06-01 09:30:00
tags: Astro
categories: 随笔
---

首页每页显示 5 篇（`site.perPage`），先按 `pinned` 排、再按日期倒序。
这篇比「你好，世界」早，所以排在它后面。

## 置顶

想置顶就在 front matter 里写 `pinned: 10`，数字越大越靠前：

```yaml
---
title: 一篇会被置顶的文章
date: 2025-09-01 12:00:00
pinned: 10
---
```

## 草稿

写 `published: false` 的文章不会进入构建，也不会出现在归档、标签、搜索里，
适合放着慢慢写。
