import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeBlack from 'starlight-theme-black';

export default defineConfig({
  site: 'https://aouo.ai',
  integrations: [
    starlight({
      title: 'AOUO',
      description: 'Local-first vertical agent app platform.',
      favicon: '/favicon.svg',
      disable404Route: true,
      customCss: ['./src/styles/docs-primitives.css'],
      logo: {
        src: './public/favicon.svg',
        alt: 'aouo',
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
            { label: 'Quick Start', link: '/getting-started/quickstart/' },
          ],
          footerText: 'Apache-2.0 • local-first vertical agent runtime',
        }),
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/aouoai/aouo' },
      ],
      editLink: {
        baseUrl: 'https://github.com/aouoai/aouo/edit/main/packages/docs/',
      },
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Quick Start', slug: 'getting-started/quickstart' },
          ],
        },
        {
          label: 'Runtime',
          items: [
            { label: 'Architecture', slug: 'concepts/architecture' },
            { label: 'Configuration', slug: 'runtime/configuration' },
            { label: 'Telegram', slug: 'runtime/telegram' },
            { label: 'Local Dashboard', slug: 'runtime/local-dashboard' },
          ],
        },
        {
          label: 'Packs',
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
          label: 'Reference',
          items: [{ label: 'CLI', slug: 'reference/cli' }],
        },
      ],
    }),
  ],
});
