import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeBlack from 'starlight-theme-black';
import remarkMermaid from './src/plugins/remark-mermaid.mjs';

export default defineConfig({
  site: 'https://aouo.ai',
  markdown: {
    remarkPlugins: [remarkMermaid],
  },
  integrations: [
    starlight({
      title: 'AOUO',
      description: 'Local-first vertical agent app platform.',
      favicon: '/favicon.svg',
      disable404Route: true,
      customCss: ['./src/styles/docs-primitives.css'],
      components: {
        Head: './src/components/CustomHead.astro',
        MarkdownContent: './src/components/CustomMarkdownContent.astro',
      },
      logo: {
        src: './public/favicon.svg',
        alt: 'AOUO',
      },
      head: [
        {
          tag: 'script',
          content:
            "try{if(localStorage.getItem('aouo-docs-theme-default')!=='light-v1'){localStorage.setItem('starlight-theme','light');localStorage.setItem('aouo-docs-theme-default','light-v1')}}catch(e){}",
        },
      ],
      plugins: [
        starlightThemeBlack({
          navLinks: [
            { label: 'Get Started', link: '/getting-started/introduction/' },
          ],
          footerText: '© 2026 AOUO · Apache-2.0 · [GitHub](https://github.com/aouoai/aouo)',
        }),
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/aouoai/aouo' },
      ],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'What is aouo?', slug: 'getting-started/introduction' },
          ],
        },
        {
          label: 'Vision',
          items: [
            { label: 'The Host Model', slug: 'concepts/host-model' },
            { label: 'Why Packs', slug: 'concepts/why-packs' },
            { label: 'Example Packs', slug: 'concepts/example-packs' },
            { label: 'Context Compiler', slug: 'concepts/context-compiler' },
            { label: 'Security & Trust', slug: 'concepts/security' },
            { label: 'Builder Direction', slug: 'concepts/builder-direction' },
            { label: 'Desktop Direction', slug: 'concepts/desktop-direction' },
          ],
        },
        {
          label: 'Build a Pack',
          items: [
            { label: 'Five Pillars', slug: 'concepts/five-pillars' },
            { label: 'Pack Spec', slug: 'concepts/pack-spec' },
            { label: 'Your First Pack', slug: 'build-a-pack/first-pack' },
            { label: 'Manifest', slug: 'build-a-pack/manifest' },
            { label: 'Schema & Persist', slug: 'build-a-pack/schema' },
            { label: 'Skills', slug: 'build-a-pack/skills' },
          ],
        },
        {
          label: 'Engineering',
          items: [
            { label: 'Architecture', slug: 'concepts/architecture' },
            { label: 'Telegram Adapter', slug: 'internals/telegram-adapter' },
            { label: 'Message Pipeline', slug: 'internals/message-pipeline' },
            { label: 'Pack Routing', slug: 'internals/pack-routing' },
          ],
        },
      ],
    }),
  ],
});
