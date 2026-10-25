---
title: Logs
layout: logs
comments: false
---

## 25.06.01

- 主题第一版：把 ParticleX 从 Hexo + Vue 搬到 Astro，排版与交互照旧
- 归档页的搜索改为构建期生成索引，不再依赖运行时抓页面
- 新增朋友圈（Moments）页面，支持图片九宫格、视频与音乐卡片
- 用一个 `<script>` 打包了原来分布在若干 mixin 里的交互逻辑

## 25.05.20

- 决定不用 Vue 了：主题的交互都是手写的动画，没必要为 `$refs` 和 `v-show`
  背一个运行时
