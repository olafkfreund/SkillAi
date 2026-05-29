// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import mdx from '@astrojs/mdx'

export default defineConfig({
  site: 'https://olafkfreund.github.io',
  base: '/SkillAi',
  trailingSlash: 'never',
  integrations: [
    starlight({
      title: 'SkillAI',
      description:
        'Internal AI-powered recruiting portal — ranks candidates fast, archives them forever, integrates with Claude.',
      logo: {
        light: '/src/assets/logo-light.svg',
        dark: '/src/assets/logo-dark.svg',
        replacesTitle: false,
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      defaultLocale: 'en',
      social: {
        github: 'https://github.com/olafkfreund/SkillAi',
      },
      editLink: {
        baseUrl: 'https://github.com/olafkfreund/SkillAi/edit/core-mvp-foundation/docs-site/',
      },
      lastUpdated: true,
      pagination: true,
      head: [
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#059669' },
        },
      ],
      sidebar: [
        {
          label: 'Overview',
          items: [
            { label: 'What is SkillAI', link: '/overview/what-is-skillai' },
            { label: 'Product tour', link: '/overview/product-tour' },
            { label: 'Live demo', link: '/overview/live-demo' },
          ],
        },
        {
          label: 'Getting started',
          items: [
            { label: 'Quick start', link: '/getting-started/quick-start' },
            { label: 'Development workflow', link: '/getting-started/development' },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { label: 'System overview', link: '/architecture/system-overview' },
            { label: 'Tech stack', link: '/architecture/tech-stack' },
            { label: 'Multi-tenancy & RLS', link: '/architecture/multi-tenancy-rls' },
            { label: 'AI scoring pipeline', link: '/architecture/ai-scoring-pipeline' },
            { label: 'File storage', link: '/architecture/file-storage' },
            { label: 'Performance baselines', link: '/architecture/performance' },
          ],
        },
        {
          label: 'REST API',
          items: [
            { label: 'Overview', link: '/rest-api/overview' },
            { label: 'Authentication', link: '/rest-api/authentication' },
            { label: 'Rate limiting', link: '/rest-api/rate-limiting' },
            { label: 'Endpoint reference', link: '/rest-api/endpoints' },
          ],
        },
        {
          label: 'MCP server',
          items: [
            { label: 'Overview', link: '/mcp-server/overview' },
            { label: 'Connecting from Claude Code', link: '/mcp-server/connecting' },
            { label: 'Tool catalogue', link: '/mcp-server/tools' },
            { label: 'Resources', link: '/mcp-server/resources' },
            { label: 'Prompts', link: '/mcp-server/prompts' },
          ],
        },
        {
          label: 'Database',
          items: [
            { label: 'Schema overview', link: '/database/overview' },
            { label: 'Table reference', autogenerate: { directory: 'database/tables' } },
          ],
        },
        {
          label: 'Code patterns',
          autogenerate: { directory: 'code-patterns' },
        },
        {
          label: 'Operations',
          items: [
            { label: 'AWS deployment', link: '/operations/aws-deploy' },
            { label: 'Backup & recovery', link: '/operations/backup-runbook' },
            { label: 'Health & monitoring', link: '/operations/health-monitoring' },
          ],
        },
        {
          label: 'Design decisions',
          items: [
            { label: 'Index', link: '/decisions/' },
            { label: 'DEC-001 — Build vs buy', link: '/decisions/dec-001-build-vs-buy' },
            { label: 'DEC-002 — Drizzle over Prisma', link: '/decisions/dec-002-drizzle-over-prisma' },
            { label: 'DEC-003 — Row-Level Security', link: '/decisions/dec-003-row-level-security' },
            { label: 'DEC-004 — Claude as primary AI', link: '/decisions/dec-004-claude-primary' },
            { label: 'DEC-005 — Local storage + Garage', link: '/decisions/dec-005-storage' },
            { label: 'DEC-006 — Auth.js over Clerk', link: '/decisions/dec-006-authjs-over-clerk' },
            { label: 'DEC-007 — Manual transcript upload', link: '/decisions/dec-007-manual-transcript-upload' },
            { label: 'DEC-008 — Manual archive on expiry', link: '/decisions/dec-008-manual-archive' },
            { label: 'DEC-009 — Soft budget signal', link: '/decisions/dec-009-soft-budget-signal' },
            { label: 'DEC-010 — Internal bench model', link: '/decisions/dec-010-internal-bench' },
            { label: 'DEC-011 — GDPR erasure pattern', link: '/decisions/dec-011-gdpr-erasure' },
          ],
        },
        { label: 'Roadmap', link: '/roadmap' },
      ],
    }),
    mdx(),
  ],
})
