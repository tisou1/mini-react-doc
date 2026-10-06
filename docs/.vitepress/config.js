import { defineConfig } from 'vitepress';
import { exampleAssetsPlugin, copyExampleAssets } from '../../scripts/example-assets.js';

const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535.');
}

export default defineConfig({
  lang: 'zh-CN',
  title: 'mini-react',
  description: '从 Element 到 DOM，跟着源码理解 React 的工作原理。',
  cleanUrls: true,
  markdown: { lineNumbers: true },
  themeConfig: {
    siteTitle: 'mini-react / 原理手册',
    nav: [
      { text: '原理总览', link: '/principles' },
      { text: '注释源码', link: '/source' },
      { text: '交互实验', link: '/examples' },
    ],
    sidebar: [
      { text: '开始阅读', items: [
        { text: '阅读导航', link: '/' },
        { text: '完整原理讲解', link: '/principles' },
        { text: '一次更新的路径', link: '/architecture' },
      ] },
      { text: '对照实现', items: [
        { text: '带注释的完整源码', link: '/source' },
        { text: 'API 与兼容范围', link: '/api' },
        { text: '动手实验与断点', link: '/examples' },
      ] },
    ],
    outline: { level: [2, 3], label: '本页内容' },
    search: {
      provider: 'local',
      options: { locales: { root: { translations: {
        button: { buttonText: '搜索原理', buttonAriaLabel: '搜索原理文档' },
        modal: { noResultsText: '没有找到相关内容', resetButtonTitle: '清空搜索',
          footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } },
      } } } },
    },
    docFooter: { prev: '上一节', next: '下一节' },
    sidebarMenuLabel: '阅读目录',
    darkModeSwitchLabel: '切换深浅模式',
    returnToTopLabel: '回到顶部',
    footer: { message: '跟着一次更新，读懂实现；所有简化均在文档中注明。' },
  },
  vite: {
    server: { host: '127.0.0.1', port, strictPort: false },
    plugins: [exampleAssetsPlugin()],
  },
  buildEnd: ({ outDir }) => copyExampleAssets(outDir),
});
