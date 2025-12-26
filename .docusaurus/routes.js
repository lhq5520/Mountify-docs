import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/zh-CN/search',
    component: ComponentCreator('/zh-CN/search', '962'),
    exact: true
  },
  {
    path: '/zh-CN/',
    component: ComponentCreator('/zh-CN/', '22f'),
    routes: [
      {
        path: '/zh-CN/',
        component: ComponentCreator('/zh-CN/', 'de0'),
        routes: [
          {
            path: '/zh-CN/',
            component: ComponentCreator('/zh-CN/', '821'),
            routes: [
              {
                path: '/zh-CN/architecture/overview',
                component: ComponentCreator('/zh-CN/architecture/overview', '5b5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/deploy/',
                component: ComponentCreator('/zh-CN/deploy/', '535'),
                exact: true
              },
              {
                path: '/zh-CN/deploy/docker',
                component: ComponentCreator('/zh-CN/deploy/docker', '349'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/deploy/overview',
                component: ComponentCreator('/zh-CN/deploy/overview', 'f6c'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/deploy/pm2',
                component: ComponentCreator('/zh-CN/deploy/pm2', '648'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/deploy/vercel',
                component: ComponentCreator('/zh-CN/deploy/vercel', 'b49'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/dev-log/overview',
                component: ComponentCreator('/zh-CN/dev-log/overview', '2d5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/dev-log/v1-foundation',
                component: ComponentCreator('/zh-CN/dev-log/v1-foundation', '6b4'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/dev-log/v2-database-payments',
                component: ComponentCreator('/zh-CN/dev-log/v2-database-payments', 'c60'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/dev-log/v3-ui-security',
                component: ComponentCreator('/zh-CN/dev-log/v3-ui-security', '631'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/dev-log/v4-auth-redis',
                component: ComponentCreator('/zh-CN/dev-log/v4-auth-redis', '146'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/dev-log/v5-admin-features',
                component: ComponentCreator('/zh-CN/dev-log/v5-admin-features', '968'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/dev-log/v6-shipping',
                component: ComponentCreator('/zh-CN/dev-log/v6-shipping', '5bd'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/guide/getting-started',
                component: ComponentCreator('/zh-CN/guide/getting-started', 'f18'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/modules/authentication',
                component: ComponentCreator('/zh-CN/modules/authentication', '01b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/modules/caching',
                component: ComponentCreator('/zh-CN/modules/caching', '9f4'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/modules/database',
                component: ComponentCreator('/zh-CN/modules/database', '48f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/modules/payments',
                component: ComponentCreator('/zh-CN/modules/payments', '1ae'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/modules/security',
                component: ComponentCreator('/zh-CN/modules/security', '2b3'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/modules/ui-design',
                component: ComponentCreator('/zh-CN/modules/ui-design', 'e73'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/zh-CN/',
                component: ComponentCreator('/zh-CN/', 'abb'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
