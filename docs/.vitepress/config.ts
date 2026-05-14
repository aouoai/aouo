import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'aouo',
  description: 'Domain Companion Agent Runtime — Install packs, not plugins.',
  lang: 'en-US',
  cleanUrls: true,
  ignoreDeadLinks: false,

  head: [
    ['link', { rel: 'icon', href: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔮</text></svg>' }],
    ['meta', { property: 'og:title', content: 'aouo' }],
    ['meta', { property: 'og:description', content: 'An open-source OS for vertical AI agents.' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'aouo',

    nav: [
      { text: 'Docs', link: '/getting-started/introduction' },
      { text: 'Build a Pack', link: '/build-a-pack/first-pack' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/getting-started/introduction' },
          { text: 'Quick Start', link: '/getting-started/quickstart' },
        ],
      },
      {
        text: 'Concepts',
        items: [
          { text: 'Architecture', link: '/concepts/architecture' },
          { text: 'Five Pillars', link: '/concepts/five-pillars' },
          { text: 'Pack Spec', link: '/concepts/pack-spec' },
        ],
      },
      {
        text: 'Build a Pack',
        items: [
          { text: 'Your First Pack', link: '/build-a-pack/first-pack' },
          { text: 'Manifest (pack.yml)', link: '/build-a-pack/manifest' },
          { text: 'Skills', link: '/build-a-pack/skills' },
          { text: 'Schema & Persist', link: '/build-a-pack/schema' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI', link: '/reference/cli' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/aouoai/aouo' },
      { icon: 'x', link: 'https://x.com/aouo_ai' },
    ],

    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: '© 2026 aouo',
    },

    editLink: {
      pattern: 'https://github.com/aouoai/aouo/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
