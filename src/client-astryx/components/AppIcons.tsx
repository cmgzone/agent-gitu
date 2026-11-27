import {Icon} from '@astryxdesign/core/Icon';
import {
  Activity,
  ArrowLeft,
  ArrowUp,
  Bot,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Cloud,
  Code2,
  Cpu,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  Globe,
  Home,
  KeyRound,
  Layers,
  Link2,
  ListTodo,
  Lock,
  MessageSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
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
  'local-link': Link2,
  providers: Cpu,
  connections: Link2,
  agents: Bot,
  skills: Sparkles,
  mcp: Plug,
  cron: CalendarDays,
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
  ArrowLeft,
  ArrowUp,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Cloud,
  Code2,
  Cpu,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  Home,
  KeyRound,
  Layers,
  Link2,
  ListTodo,
  Lock,
  MessageSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
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
