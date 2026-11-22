import {Icon} from '@astryxdesign/core/Icon';
import {
  Activity,
  Bot,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Cpu,
  ExternalLink,
  Folder,
  Globe,
  KeyRound,
  Layers,
  Link2,
  Monitor,
  Moon,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  User,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import type {ComponentType, SVGProps} from 'react';

export type LucideComp = ComponentType<SVGProps<SVGSVGElement>>;

export const SETTING_ICONS: Record<string, LucideComp> = {
  overview: Layers,
  general: SlidersHorizontal,
  providers: Cpu,
  connections: Link2,
  agents: Bot,
  skills: Sparkles,
  mcp: Plug,
  cron: Clock,
  cowork: Users,
  workspace: Folder,
  project: Folder,
  files: Boxes,
  permissions: Shield,
  developer: Terminal,
  folder: Folder,
  layers: Layers,
  users: Users,
  key: KeyRound,
  globe: Globe,
  activity: Activity,
  sliders: SlidersHorizontal,
  wrench: Wrench,
  wallet: Wallet,
};

export function AppIcon({
  icon: IconComp,
  size = 'sm',
  color = 'inherit',
  label,
}: {
  icon: LucideComp;
  size?: 'xsm' | 'sm' | 'md' | 'lg';
  color?:
    | 'primary'
    | 'secondary'
    | 'tertiary'
    | 'disabled'
    | 'accent'
    | 'info'
    | 'success'
    | 'error'
    | 'warning'
    | 'inherit';
  label?: string;
}) {
  return <Icon icon={IconComp} size={size} color={color} label={label} />;
}

export {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Cpu,
  ExternalLink,
  Folder,
  KeyRound,
  Layers,
  Link2,
  Monitor,
  Moon,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  User,
  Users,
  Wallet,
  Wrench,
  X,
};
