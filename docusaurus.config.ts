import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Mountify Documentation',
  tagline: 'Build a Production-Grade E-Commerce Platform from Scratch',
  favicon: 'img/favicon.ico',
  url: 'https://mountify-docs.example.com',
  baseUrl: '/',
  organizationName: 'mountify',
  projectName: 'mountify-docs',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  // local search
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en', 'zh'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        docsRouteBasePath: '/',
        indexBlog: false,
      },
    ],
  ],

  themeConfig: {
    image: 'img/mountify-social-card.jpg',
    navbar: {
      title: 'Mountify',
      logo: {
        alt: 'Mountify Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/lhq5520/Mountify-Commerce',
          label: 'GitHub',
          position: 'right',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Getting Started', to: '/guide/getting-started' },
            { label: 'Architecture', to: '/architecture/overview' },
          ],
        },
        {
          title: 'Modules',
          items: [
            { label: 'Authentication', to: '/modules/authentication' },
            { label: 'Payments', to: '/modules/payments' },
            { label: 'Caching', to: '/modules/caching' },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'GitHub', href: 'https://github.com/lhq5520/Mountify-Commerce' },
            { label: 'Development Log', to: '/dev-log/overview' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Mountify. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'sql', 'typescript', 'json'],
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;