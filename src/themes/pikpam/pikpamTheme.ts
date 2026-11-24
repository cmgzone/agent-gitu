import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export const pikpamTheme = defineTheme({
  name: 'pikpam',
  extends: neutralTheme,
  localTokens: {
    '--pikpam-hero-scrim-top': [
      'oklch(0.98 0.004 240 / 0.72)',
      'oklch(0.10 0.015 255 / 0.52)',
    ],
    '--pikpam-hero-scrim-mid': [
      'oklch(0.97 0.004 240 / 0.88)',
      'oklch(0.10 0.015 255 / 0.82)',
    ],
    '--pikpam-hero-heading-from': ['#000000', '#FFFFFF'],
    '--pikpam-hero-heading-to': ['#666666', '#9B9B9B'],
  },
  tokens: {
    '--font-family-body': 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--font-family-heading': 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--font-family-code': '"Geist Mono", ui-monospace, "SF Mono", Monaco, Consolas, monospace',

    '--color-background-body': ['#F7F8FA', '#000000'],
    '--color-background-surface': ['#FFFFFF', '#181818'],
    '--color-background-card': ['#FFFFFF', '#1F1F1F'],
    '--color-background-popover': ['#FFFFFF', '#272727'],
    '--color-background-muted': ['#EEF1F6', '#181818'],

    '--color-accent': ['#0057D8', '#3B82F6'],
    '--color-on-accent': ['#FFFFFF', '#FFFFFF'],
    '--color-accent-muted': ['#E6F0FF', '#132440'],
    '--color-text-accent': ['#0052CC', '#60A5FA'],
    '--color-icon-accent': ['#0057D8', '#38BDF8'],
    '--focus-outline-color': 'var(--color-accent)',

    '--color-border': ['oklch(0 0 0 / 8%)', 'oklch(1 0 0 / 10%)'],
    '--color-border-emphasized': ['oklch(0 0 0 / 15%)', 'oklch(1 0 0 / 18%)'],

    '--shadow-low': [
      '0 2px 6px oklch(0 0 0 / 6%), 0 6px 16px oklch(0 0 0 / 6%)',
      '0 4px 12px oklch(0 0 0 / 32%), 0 1px 2px oklch(0 0 0 / 24%)',
    ],
    '--shadow-med': [
      '0 4px 12px oklch(0 0 0 / 8%), 0 12px 24px oklch(0 0 0 / 8%)',
      '0 8px 24px oklch(0 0 0 / 45%), 0 2px 6px oklch(0 0 0 / 30%)',
    ],
    '--shadow-high': [
      '0 8px 20px oklch(0 0 0 / 10%), 0 20px 44px oklch(0 0 0 / 12%)',
      '0 18px 48px oklch(0 0 0 / 62%), 0 6px 16px oklch(0 0 0 / 38%)',
    ],

    '--radius-inner': '0.5rem',
    '--radius-element': '0.625rem',
    '--radius-container': '0.875rem',
    '--radius-page': '1.25rem',
  },
  components: {
    button: {
      base: {
        transition: 'transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)',
      },
      ':hover': {
        transform: 'translateY(-1px)',
      },
      ':active': {
        transform: 'scale(0.98)',
      },
    },
    card: {
      base: {
        padding: 'var(--spacing-5)',
        transition: 'border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-medium) var(--ease-standard), transform var(--duration-medium) var(--ease-standard)',
      },
    },
    section: {
      base: {
        padding: 'var(--spacing-5)',
      },
    },
  },
});
