import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Quick Start',
      items: ['guide/getting-started'],
    },
    {
      type: 'category',
      label: 'How to deploy',
      items: [
        'deploy/overview',
        'deploy/vercel',
        'deploy/pm2',
        'deploy/docker',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: ['architecture/overview'],
    },
    {
      type: 'category',
      label: 'Modules',
      items: [
        'modules/database',
        'modules/authentication',
        'modules/payments',
        'modules/caching',
        'modules/security',
        'modules/ui-design',
      ],
    },
    {
      type: 'category',
      label: 'Development Log',
      items: [
        'dev-log/overview',
        'dev-log/v1-foundation',
        'dev-log/v2-database-payments',
        'dev-log/v3-ui-security',
        'dev-log/v4-auth-redis',
        'dev-log/v5-admin-features',
        'dev-log/v6-shipping',
      ],
    },
  ],
};

export default sidebars;
