// The pikpam theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in pikpam.settings.json and the generated pikpam.settings.ts;
// change them with `astryx experimental theme editor set pikpam ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {pikpamSettings} from './pikpam.settings';

export const pikpamTheme = defineTheme({
  extends: pikpamSettings,
  name: 'pikpam',
  tokens: {
    '--color-background-card': ['#ffffff', '#1f1f22'],
    '--color-background-popover': ['#ffffff', '#1f1f22'],
    '--color-background-muted': ['#eef2f6', '#161618'],
    '--color-border': ['#e1e6ec', '#2a2a2e'],
    '--color-border-emphasized': ['#cbd3dc', '#3c3c42'],
    '--color-text-primary': ['#0a1317', '#dfe2e5'],
    '--color-text-secondary': ['#4e606f', '#aaafb5'],
    '--color-on-accent': ['#ffffff', '#0a1317'],
    '--font-family-body':
      "Inter, -apple-system, 'Segoe UI', system-ui, sans-serif",
    '--font-family-heading':
      "Inter, -apple-system, 'Segoe UI', system-ui, sans-serif",
    '--font-family-code':
      "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
});
