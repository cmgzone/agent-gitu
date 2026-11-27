import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {
  useCalendarDays,
  useCalendarNavigation,
  type ISODateString,
} from '@astryxdesign/core/Calendar';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {IconButton} from '@astryxdesign/core/IconButton';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Selector} from '@astryxdesign/core/Selector';
import {StatusDot, type StatusDotVariant} from '@astryxdesign/core/StatusDot';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TimeInput} from '@astryxdesign/core/TimeInput';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {getHostBridge, type CoworkAvatar} from '../bridge';
import {
  AppIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from '../components/AppIcons';
import {PlushPortrait} from '../components/PlushPortrait';

type ScheduleSource = 'cron' | 'cowork' | 'followup';
type ScheduleRecurrence = 'interval' | 'daily' | 'weekdays' | 'weekly' | 'once';

interface ScheduleAgentSummary {
  id: string;
  name: string;
  color?: string;
  shape?: string;
  avatarUrl?: string;
  tagline?: string;
}

interface ScheduleConvSummary {
  id: string;
  kind: 'dm' | 'group';
  title: string;
  memberIds: string[];
  hasSchedule?: boolean;
}

interface UnifiedScheduleItem {
  id: string;
  source: ScheduleSource;
  sourceId: string;
  title: string;
  goal: string;
  every: string;
  recurrence: ScheduleRecurrence;
  atTime?: string;
  daysOfWeek?: number[];
  runAt?: string;
  timezone?: string;
  enabled: boolean;
  status: 'running' | 'succeeded' | 'failed' | 'scheduled' | 'paused';
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunId?: string;
  failures?: number;
  error?: string;
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  agentShape?: string;
  agentAvatarUrl?: string;
  conversationId?: string;
  conversationTitle?: string;
}

interface SchedulesResponse {
  timezone: string;
  now: string;
  hasProject: boolean;
  items: UnifiedScheduleItem[];
  agents: ScheduleAgentSummary[];
  conversations: ScheduleConvSummary[];
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const INTERVAL_PRESETS = ['15m', '30m', '1h', '4h', '1d'] as const;

function toLocalIsoDate(date: Date): ISODateString {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}` as ISODateString;
}

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

function formatShortDate(iso: string): string {
  const dt = parseIsoDateLocal(iso);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeCountdown(iso?: string): string {
  if (!iso) return 'Paused';
  const diffMs = Date.parse(iso) - Date.now();
  if (!Number.isFinite(diffMs)) return 'Scheduled';
  if (diffMs <= 60_000) return 'Due soon';
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

function formatCadenceSummary(item: UnifiedScheduleItem): string {
  if (item.source === 'followup' || item.recurrence === 'once') {
    if (item.runAt) {
      const dt = new Date(item.runAt);
      if (Number.isFinite(dt.getTime())) {
        return `Once · ${dt.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} ${dt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
      }
    }
    return 'One-time';
  }
  if (item.recurrence === 'daily') {
    return `Daily${item.atTime ? ` · ${item.atTime}` : ''}`;
  }
  if (item.recurrence === 'weekdays') {
    return `Weekdays${item.atTime ? ` · ${item.atTime}` : ''}`;
  }
  if (item.recurrence === 'weekly') {
    const names = (item.daysOfWeek?.length ? item.daysOfWeek : [1])
      .map(d => WEEKDAY_LABELS[d] ?? '')
      .filter(Boolean)
      .join(', ');
    return `${names || 'Weekly'}${item.atTime ? ` · ${item.atTime}` : ''}`;
  }
  return `Every ${item.every}`;
}

function itemTimeLabel(item: UnifiedScheduleItem): string {
  if (item.atTime) return item.atTime;
  const ref = item.runAt || item.nextRunAt;
  if (ref) {
    const dt = new Date(ref);
    if (Number.isFinite(dt.getTime())) {
      return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }
  }
  return item.every;
}

function itemHour(item: UnifiedScheduleItem): number {
  if (item.atTime) {
    const h = Number(item.atTime.split(':')[0]);
    if (Number.isFinite(h)) return h;
  }
  const ref = item.runAt || item.nextRunAt;
  if (ref) {
    const dt = new Date(ref);
    if (Number.isFinite(dt.getTime())) return dt.getHours();
  }
  return 9;
}

function matchesCalendarDate(item: UnifiedScheduleItem, isoDate: string): boolean {
  const target = parseIsoDateLocal(isoDate);
  const dow = target.getDay();

  if (item.source === 'followup' || item.recurrence === 'once') {
    const ref = item.runAt || item.nextRunAt;
    if (!ref) return false;
    const dt = new Date(ref);
    return Number.isFinite(dt.getTime()) && toLocalIsoDate(dt) === isoDate;
  }

  if (item.recurrence === 'daily') return true;
  if (item.recurrence === 'weekdays') return dow >= 1 && dow <= 5;
  if (item.recurrence === 'weekly') {
    const days = item.daysOfWeek?.length ? item.daysOfWeek : [1];
    return days.includes(dow);
  }

  // Relative interval schedule ('30m', '4h', '1d', '1w'):
  // Sub-day and daily intervals appear every day; multi-day/weekly appear on nextRunAt date.
  const lower = item.every.trim().toLowerCase();
  if (/^\d+$/.test(lower) || /^\d+\s*(s|sec|m|min|h|hour|1d|1\s*day)/i.test(lower)) {
    const todayIso = toLocalIsoDate(new Date());
    return isoDate >= todayIso;
  }
  if (item.nextRunAt) {
    const dt = new Date(item.nextRunAt);
    if (Number.isFinite(dt.getTime())) return toLocalIsoDate(dt) === isoDate;
  }
  return false;
}

function statusDotFor(item: UnifiedScheduleItem): StatusDotVariant {
  if (!item.enabled || item.status === 'paused') return 'neutral';
  if (item.status === 'failed') return 'error';
  if (item.status === 'running') return 'warning';
  if (item.source === 'cron') return 'accent';
  return 'success';
}

function sourceLabel(source: ScheduleSource): string {
  if (source === 'cron') return 'Coding';
  if (source === 'followup') return 'Reminder';
  return 'Routine';
}

function itemAvatar(item: UnifiedScheduleItem): CoworkAvatar | undefined {
  if (!item.agentShape && !item.agentAvatarUrl) return undefined;
  return {
    color: item.agentColor || '',
    shape: item.agentShape || 'orb',
    ...(item.agentAvatarUrl ? {imageUrl: item.agentAvatarUrl} : {}),
  };
}

export function ScheduleCalendarSection({
  onJumpToConversation,
}: {
  onJumpToConversation?: (conversationId: string) => void;
}) {
  const host = getHostBridge();
  const isCompact = useMediaQuery('(max-width: 900px)');

  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<ISODateString>(todayIso);
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'list'>('month');
  const [sourceFilter, setSourceFilter] = useState<'all' | ScheduleSource>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');

  const [data, setData] = useState<SchedulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create schedule dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newSource, setNewSource] = useState<ScheduleSource>('cowork');
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newAgentId, setNewAgentId] = useState('');
  const [newConversationId, setNewConversationId] = useState('');
  const [newRecurrence, setNewRecurrence] = useState<ScheduleRecurrence>('weekdays');
  const [newDate, setNewDate] = useState<ISODateString | undefined>(todayIso);
  const [newTime, setNewTime] = useState<string | undefined>('09:00');
  const [newDays, setNewDays] = useState<number[]>([1, 3, 5]);
  const [newEvery, setNewEvery] = useState('1h');
  const [saving, setSaving] = useState(false);

  const nav = useCalendarNavigation({initialValue: selectedDate, numberOfMonths: 1});
  const activeMonth = nav.visibleCalendarMonths[0] ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  };
  const {weeks, dayNames} = useCalendarDays({
    year: activeMonth.year,
    month: activeMonth.month,
    weekStartsOn: 0,
    hasVariableRowCount: true,
  });

  const loadSchedules = useCallback(async () => {
    if (!host) return;
    setLoading(true);
    try {
      const res = await host.api<SchedulesResponse>('/api/schedules');
      setData(res);
      if (!newAgentId && res.agents[0]?.id) {
        setNewAgentId(res.agents[0].id);
      }
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not load schedules.',
        true,
      );
    } finally {
      setLoading(false);
    }
  }, [host, newAgentId]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter(item => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (agentFilter !== 'all' && item.agentId !== agentFilter) return false;
      return true;
    });
  }, [data?.items, sourceFilter, agentFilter]);

  const activeCount = useMemo(
    () => (data?.items ?? []).filter(i => i.enabled).length,
    [data?.items],
  );

  const nextUpcoming = useMemo(() => {
    return (data?.items ?? []).find(i => i.enabled && i.nextRunAt) ?? null;
  }, [data?.items]);

  const dayItems = useMemo(() => {
    return filteredItems
      .filter(item => matchesCalendarDate(item, selectedDate))
      .sort((a, b) => itemTimeLabel(a).localeCompare(itemTimeLabel(b)));
  }, [filteredItems, selectedDate]);

  const weekDates = useMemo(() => {
    const anchor = parseIsoDateLocal(selectedDate);
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - anchor.getDay());
    return Array.from({length: 7}, (_, idx) => {
      const dt = new Date(start);
      dt.setDate(start.getDate() + idx);
      return toLocalIsoDate(dt);
    });
  }, [selectedDate]);

  const openCreateForDate = (iso: ISODateString, preferredSource?: ScheduleSource) => {
    setNewDate(iso);
    if (preferredSource) {
      setNewSource(preferredSource);
      if (preferredSource === 'followup') setNewRecurrence('once');
    }
    setNewTitle('');
    setNewGoal('');
    setCreateOpen(true);
  };

  const handleToggle = async (item: UnifiedScheduleItem, enabled: boolean) => {
    if (!host || item.source === 'followup') return;
    setBusyId(item.id);
    try {
      const res = await host.api<SchedulesResponse>(
        `/api/schedules/${item.source}/${encodeURIComponent(item.sourceId)}`,
        {
          method: 'PATCH',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({enabled}),
        },
      );
      setData(res);
      host.toast(enabled ? `Resumed "${item.title}"` : `Paused "${item.title}"`);
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not update schedule.',
        true,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRunNow = async (item: UnifiedScheduleItem) => {
    if (!host) return;
    setBusyId(item.id);
    try {
      const res = await host.api<SchedulesResponse & {message?: string}>(
        `/api/schedules/${item.source}/${encodeURIComponent(item.sourceId)}/run`,
        {method: 'POST'},
      );
      setData(res);
      host.toast(res.message || `Triggered "${item.title}"`);
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not run schedule now.',
        true,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: UnifiedScheduleItem) => {
    if (!host) return;
    setBusyId(item.id);
    try {
      const res = await host.api<SchedulesResponse>(
        `/api/schedules/${item.source}/${encodeURIComponent(item.sourceId)}`,
        {method: 'DELETE'},
      );
      setData(res);
      host.toast(`Removed "${item.title}"`);
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not delete schedule.',
        true,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateSubmit = async () => {
    if (!host || !newGoal.trim()) {
      host?.toast('Enter a goal or reminder note first.', true);
      return;
    }
    setSaving(true);
    try {
      const effectiveRecurrence: ScheduleRecurrence =
        newSource === 'followup' ? 'once' : newRecurrence;
      const dateStr = newDate || selectedDate;
      const timeStr = (newTime || '09:00').slice(0, 5);
      const runAtIso =
        effectiveRecurrence === 'once'
          ? new Date(`${dateStr}T${timeStr}:00`).toISOString()
          : undefined;

      const payload: Record<string, unknown> = {
        source: newSource,
        goal: newGoal.trim(),
        ...(newTitle.trim() ? {title: newTitle.trim()} : {}),
        ...(newSource !== 'cron' && newConversationId
          ? {conversationId: newConversationId}
          : {}),
        ...(newSource !== 'cron' && newAgentId ? {agentId: newAgentId} : {}),
        recurrence: effectiveRecurrence,
        ...(effectiveRecurrence === 'interval' ? {every: newEvery.trim() || '1h'} : {}),
        ...(effectiveRecurrence === 'daily' ||
        effectiveRecurrence === 'weekdays' ||
        effectiveRecurrence === 'weekly'
          ? {atTime: timeStr}
          : {}),
        ...(effectiveRecurrence === 'weekly'
          ? {daysOfWeek: newDays.length ? newDays : [1]}
          : {}),
        ...(runAtIso ? {runAt: runAtIso, dueAt: runAtIso} : {}),
        timezone: data?.timezone,
      };

      const res = await host.api<SchedulesResponse>('/api/schedules', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(payload),
      });
      setData(res);
      setCreateOpen(false);
      host.toast('Schedule saved to calendar.');
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not create schedule.',
        true,
      );
    } finally {
      setSaving(false);
    }
  };

  const renderScheduleRow = (item: UnifiedScheduleItem) => {
    const avatar = itemAvatar(item);
    const isBusy = busyId === item.id;
    const subtitleParts = [
      formatCadenceSummary(item),
      item.agentName ? item.agentName : sourceLabel(item.source),
      item.enabled && item.nextRunAt
        ? formatRelativeCountdown(item.nextRunAt)
        : 'Paused',
    ];
    if (item.error) subtitleParts.push(`Error: ${item.error}`);

    return (
      <ListItem
        key={item.id}
        label={item.title}
        description={subtitleParts.join(' · ')}
        startContent={
          <HStack gap={2} align="center">
            <StatusDot
              variant={statusDotFor(item)}
              label={item.enabled ? item.status : 'paused'}
              isPulsing={item.status === 'running'}
            />
            {avatar ? (
              <PlushPortrait
                avatar={avatar}
                name={item.agentName || item.title}
                size="sm"
              />
            ) : (
              <AppIcon
                icon={item.source === 'cron' ? Code2 : Clock}
                size="sm"
                color="secondary"
              />
            )}
          </HStack>
        }
        onClick={
          item.conversationId && onJumpToConversation
            ? () => onJumpToConversation(item.conversationId!)
            : undefined
        }
        endContent={
          <HStack gap={2} align="center">
            <IconButton
              icon={<AppIcon icon={Play} />}
              label={`Run ${item.title} now`}
              variant="ghost"
              size="sm"
              isDisabled={isBusy}
              onClick={e => {
                e.stopPropagation();
                void handleRunNow(item);
              }}
            />
            {item.source !== 'followup' ? (
              <Switch
                label={`Toggle ${item.title}`}
                isLabelHidden
                value={item.enabled}
                isDisabled={isBusy}
                onChange={val => void handleToggle(item, val)}
              />
            ) : null}
            <IconButton
              icon={<AppIcon icon={Trash2} />}
              label={`Delete ${item.title}`}
              variant="ghost"
              size="sm"
              isDisabled={isBusy}
              onClick={e => {
                e.stopPropagation();
                void handleDelete(item);
              }}
            />
          </HStack>
        }
      />
    );
  };

  const agentOptions = useMemo(
    () =>
      (data?.agents ?? []).map(a => ({
        value: a.id,
        label: a.name,
      })),
    [data?.agents],
  );

  const conversationOptions = useMemo(
    () => [
      {value: '', label: 'Direct chat with selected teammate'},
      ...(data?.conversations ?? []).map(c => ({
        value: c.id,
        label: `${c.title} (${c.kind === 'group' ? 'Team' : 'DM'})`,
      })),
    ],
    [data?.conversations],
  );

  const timeBuckets = [
    {id: 'morning', label: 'Morning', min: 0, max: 11},
    {id: 'afternoon', label: 'Afternoon', min: 12, max: 16},
    {id: 'evening', label: 'Evening', min: 17, max: 23},
  ] as const;

  return (
    <VStack gap={4} width="100%">
      {/* Next Up Hero Strip */}
      <Card padding={4}>
        <HStack justify="between" align="center" gap={3} wrap="wrap">
          <HStack gap={3} align="center">
            {nextUpcoming && itemAvatar(nextUpcoming) ? (
              <PlushPortrait
                avatar={itemAvatar(nextUpcoming)}
                name={nextUpcoming.agentName || nextUpcoming.title}
                size="md"
              />
            ) : (
              <AppIcon icon={CalendarDays} size="lg" color="accent" />
            )}
            <VStack gap={0.5}>
              <HStack gap={2} align="center">
                <StatusDot
                  variant={nextUpcoming ? 'success' : 'neutral'}
                  label={nextUpcoming ? 'Active schedule' : 'No active schedules'}
                  isPulsing={Boolean(nextUpcoming)}
                />
                <Heading level={4}>
                  {nextUpcoming
                    ? `Next up ${formatRelativeCountdown(nextUpcoming.nextRunAt)} · ${nextUpcoming.agentName || sourceLabel(nextUpcoming.source)}`
                    : 'Schedule Calendar'}
                </Heading>
                <Badge count={activeCount} />
              </HStack>
              <Text color="secondary">
                {nextUpcoming
                  ? `${nextUpcoming.title} (${formatCadenceSummary(nextUpcoming)}) · ${data?.timezone || 'Local time'}`
                  : `Plan recurring teammate routines, coding jobs, and dated reminders · ${data?.timezone || 'Local time'}`}
              </Text>
            </VStack>
          </HStack>

          <HStack gap={2} align="center" wrap="wrap">
            {nextUpcoming ? (
              <Button
                label="Run next now"
                variant="secondary"
                size="sm"
                icon={<AppIcon icon={Play} />}
                isDisabled={busyId === nextUpcoming.id}
                onClick={() => void handleRunNow(nextUpcoming)}
              />
            ) : null}
            <IconButton
              icon={<AppIcon icon={RefreshCw} />}
              label="Refresh schedules"
              variant="ghost"
              size="sm"
              isDisabled={loading}
              onClick={() => void loadSchedules()}
            />
            <Button
              label="New schedule"
              variant="primary"
              size="sm"
              icon={<AppIcon icon={Plus} />}
              onClick={() => openCreateForDate(selectedDate)}
            />
          </HStack>
        </HStack>
      </Card>

      {/* Toolbar: View Switcher + Filters */}
      <HStack justify="between" align="center" gap={3} wrap="wrap">
        <SegmentedControl
          label="Schedule view mode"
          size="sm"
          value={viewMode}
          onChange={v => setViewMode(v as 'month' | 'week' | 'list')}>
          <SegmentedControlItem value="month" label="Month" />
          <SegmentedControlItem value="week" label="Week" />
          <SegmentedControlItem value="list" label="List" />
        </SegmentedControl>

        <HStack gap={2} align="center" wrap="wrap">
          <SegmentedControl
            label="Filter by schedule type"
            size="sm"
            value={sourceFilter}
            onChange={v => setSourceFilter(v as 'all' | ScheduleSource)}>
            <SegmentedControlItem value="all" label="All" />
            <SegmentedControlItem value="cowork" label="Routines" />
            <SegmentedControlItem value="followup" label="Reminders" />
            <SegmentedControlItem value="cron" label="Coding" />
          </SegmentedControl>

          {(data?.agents.length ?? 0) > 1 ? (
            <Selector
              label="Teammate filter"
              isLabelHidden
              size="sm"
              value={agentFilter}
              onChange={v => setAgentFilter(String(v || 'all'))}
              options={[
                {value: 'all', label: 'All teammates'},
                ...(data?.agents ?? []).map(a => ({value: a.id, label: a.name})),
              ]}
            />
          ) : null}
        </HStack>
      </HStack>

      {/* VIEW 1: MONTH CALENDAR + SELECTED DAY AGENDA */}
      {viewMode === 'month' ? (
        <Grid columns={isCompact ? 1 : 12} gap={4} align="start">
          <GridSpan columns={isCompact ? 1 : 7}>
            <Card padding={4}>
              <VStack gap={3}>
                <HStack justify="between" align="center" gap={2}>
                  <Heading level={4}>{nav.monthYearLabel}</Heading>
                  <HStack gap={1} align="center">
                    <Button
                      label="Today"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedDate(todayIso);
                        const now = new Date();
                        const delta =
                          (now.getFullYear() - activeMonth.year) * 12 +
                          (now.getMonth() + 1 - activeMonth.month);
                        if (delta !== 0) nav.navigateMonth(delta);
                      }}
                    />
                    <IconButton
                      icon={<AppIcon icon={ChevronLeft} />}
                      label="Previous month"
                      variant="ghost"
                      size="sm"
                      onClick={() => nav.navigateMonth(-1)}
                    />
                    <IconButton
                      icon={<AppIcon icon={ChevronRight} />}
                      label="Next month"
                      variant="ghost"
                      size="sm"
                      onClick={() => nav.navigateMonth(1)}
                    />
                  </HStack>
                </HStack>

                <Grid columns={7} gap={1.5}>
                  {dayNames.map(name => (
                    <HStack key={name} justify="center">
                      <Text color="secondary">{name}</Text>
                    </HStack>
                  ))}
                  {weeks.flat().map(day => {
                    const hits = filteredItems.filter(it =>
                      matchesCalendarDate(it, day.iso),
                    );
                    const isSelected = day.iso === selectedDate;
                    const isToday = day.iso === todayIso;
                    return (
                      <SelectableCard
                        key={day.iso}
                        label={`${day.iso}, ${hits.length} scheduled`}
                        isSelected={isSelected}
                        padding={2}
                        variant={day.isOutside ? 'muted' : 'default'}
                        onChange={() => setSelectedDate(day.iso)}>
                        <VStack gap={1.5} align="start">
                          <HStack justify="between" align="center" width="100%">
                            <Text
                              color={
                                isToday
                                  ? 'accent'
                                  : day.isOutside
                                    ? 'tertiary'
                                    : 'primary'
                              }>
                              {day.dayNumber}
                            </Text>
                            {hits.length > 3 ? (
                              <Badge count={hits.length} />
                            ) : null}
                          </HStack>
                          <HStack gap={1} align="center" wrap="wrap">
                            {hits.slice(0, 3).map(h => (
                              <StatusDot
                                key={h.id}
                                variant={statusDotFor(h)}
                                label={`${h.agentName || sourceLabel(h.source)}: ${h.title}`}
                              />
                            ))}
                          </HStack>
                        </VStack>
                      </SelectableCard>
                    );
                  })}
                </Grid>
              </VStack>
            </Card>
          </GridSpan>

          <GridSpan columns={isCompact ? 1 : 5}>
            <Card padding={4}>
              <VStack gap={3}>
                <HStack justify="between" align="center" gap={2}>
                  <VStack gap={0.5}>
                    <Heading level={4}>{formatShortDate(selectedDate)}</Heading>
                    <Text color="secondary">
                      {dayItems.length === 1
                        ? '1 scheduled run'
                        : `${dayItems.length} scheduled runs`}
                    </Text>
                  </VStack>
                  <Button
                    label="Add on date"
                    variant="secondary"
                    size="sm"
                    icon={<AppIcon icon={Plus} />}
                    onClick={() => openCreateForDate(selectedDate, 'followup')}
                  />
                </HStack>

                <Divider />

                {dayItems.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<AppIcon icon={CalendarDays} size="lg" color="secondary" />}
                    title="Open day"
                    description="No teammate routines, coding jobs, or reminders are scheduled on this date."
                    actions={
                      <Button
                        label="Schedule something"
                        variant="primary"
                        size="sm"
                        onClick={() => openCreateForDate(selectedDate)}
                      />
                    }
                  />
                ) : (
                  <List>{dayItems.map(renderScheduleRow)}</List>
                )}
              </VStack>
            </Card>
          </GridSpan>
        </Grid>
      ) : null}

      {/* VIEW 2: WEEKLY TIME-WINDOW GRID */}
      {viewMode === 'week' ? (
        <Card padding={4}>
          <VStack gap={3}>
            <HStack justify="between" align="center" gap={2}>
              <Heading level={4}>
                {formatShortDate(weekDates[0]!)} – {formatShortDate(weekDates[6]!)}
              </Heading>
              <HStack gap={1} align="center">
                <Button
                  label="This week"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDate(todayIso)}
                />
                <IconButton
                  icon={<AppIcon icon={ChevronLeft} />}
                  label="Previous week"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const dt = parseIsoDateLocal(selectedDate);
                    dt.setDate(dt.getDate() - 7);
                    setSelectedDate(toLocalIsoDate(dt));
                  }}
                />
                <IconButton
                  icon={<AppIcon icon={ChevronRight} />}
                  label="Next week"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const dt = parseIsoDateLocal(selectedDate);
                    dt.setDate(dt.getDate() + 7);
                    setSelectedDate(toLocalIsoDate(dt));
                  }}
                />
              </HStack>
            </HStack>

            <Grid columns={isCompact ? 1 : 7} gap={2}>
              {weekDates.map(iso => {
                const isToday = iso === todayIso;
                const isSelected = iso === selectedDate;
                const colItems = filteredItems
                  .filter(it => matchesCalendarDate(it, iso))
                  .sort((a, b) => itemTimeLabel(a).localeCompare(itemTimeLabel(b)));
                return (
                  <Card
                    key={iso}
                    padding={2.5}
                    variant={isSelected ? 'elevated' : 'default'}>
                    <VStack gap={2}>
                      <HStack justify="between" align="center">
                        <Text color={isToday ? 'accent' : 'primary'}>
                          {formatShortDate(iso)}
                        </Text>
                        <IconButton
                          icon={<AppIcon icon={Plus} size="xsm" />}
                          label={`Add on ${iso}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => openCreateForDate(iso)}
                        />
                      </HStack>
                      <Divider />
                      {timeBuckets.map(bucket => {
                        const bucketHits = colItems.filter(it => {
                          const h = itemHour(it);
                          return h >= bucket.min && h <= bucket.max;
                        });
                        if (bucketHits.length === 0) return null;
                        return (
                          <VStack key={bucket.id} gap={1}>
                            <Text color="tertiary">{bucket.label}</Text>
                            {bucketHits.map(item => (
                              <ClickableCard
                                key={item.id}
                                padding={2}
                                onClick={() => {
                                  setSelectedDate(iso);
                                  setViewMode('month');
                                }}>
                                <VStack gap={1}>
                                  <HStack gap={1.5} align="center">
                                    <StatusDot
                                      variant={statusDotFor(item)}
                                      label={item.status}
                                    />
                                    <Text color="secondary">
                                      {itemTimeLabel(item)}
                                    </Text>
                                  </HStack>
                                  <Text>{item.agentName || item.title}</Text>
                                </VStack>
                              </ClickableCard>
                            ))}
                          </VStack>
                        );
                      })}
                      {colItems.length === 0 ? (
                        <Text color="tertiary">Free</Text>
                      ) : null}
                    </VStack>
                  </Card>
                );
              })}
            </Grid>
          </VStack>
        </Card>
      ) : null}

      {/* VIEW 3: DENSE LIST VIEW */}
      {viewMode === 'list' ? (
        <Card padding={4}>
          <VStack gap={3}>
            <HStack justify="between" align="center">
              <Heading level={4}>All Schedules</Heading>
              <Text color="secondary">
                {filteredItems.length}{' '}
                {filteredItems.length === 1 ? 'entry' : 'entries'}
              </Text>
            </HStack>
            <Divider />
            {filteredItems.length === 0 ? (
              <EmptyState
                isCompact
                icon={<AppIcon icon={Clock} size="lg" color="secondary" />}
                title="No schedules yet"
                description="Create a recurring teammate routine, one-time calendar reminder, or automated coding job."
                actions={
                  <Button
                    label="New schedule"
                    variant="primary"
                    size="sm"
                    onClick={() => openCreateForDate(selectedDate)}
                  />
                }
              />
            ) : (
              <List>{filteredItems.map(renderScheduleRow)}</List>
            )}
          </VStack>
        </Card>
      ) : null}

      {/* CREATE SCHEDULE DIALOG */}
      <Dialog
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        width={520}
        purpose="form">
        <Layout
          header={
            <DialogHeader
              title="New Schedule"
              onOpenChange={setCreateOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3} padding={4}>
                <SegmentedControl
                  label="Schedule type"
                  layout="fill"
                  size="sm"
                  value={newSource}
                  onChange={v => {
                    const next = v as ScheduleSource;
                    setNewSource(next);
                    if (next === 'followup') setNewRecurrence('once');
                    else if (newRecurrence === 'once') setNewRecurrence('weekdays');
                  }}>
                  <SegmentedControlItem value="cowork" label="Teammate routine" />
                  <SegmentedControlItem value="followup" label="One-time reminder" />
                  <SegmentedControlItem value="cron" label="Coding job" />
                </SegmentedControl>

                {newSource !== 'cron' ? (
                  <Grid columns={isCompact ? 1 : 2} gap={3}>
                    <Selector
                      label="Teammate"
                      value={newAgentId}
                      onChange={v => setNewAgentId(String(v || ''))}
                      options={agentOptions}
                      width="100%"
                    />
                    <Selector
                      label="Chat room"
                      value={newConversationId}
                      onChange={v => setNewConversationId(String(v || ''))}
                      options={conversationOptions}
                      width="100%"
                    />
                  </Grid>
                ) : (
                  <TextInput
                    label="Short title"
                    isOptional
                    value={newTitle}
                    onChange={setNewTitle}
                    placeholder="e.g. Nightly test suite & lint"
                    width="100%"
                  />
                )}

                <TextArea
                  label={newSource === 'followup' ? 'Reminder note' : 'Instructions / goal'}
                  isRequired
                  value={newGoal}
                  onChange={setNewGoal}
                  placeholder={
                    newSource === 'followup'
                      ? 'e.g. Follow up with client on launch sign-off'
                      : newSource === 'cron'
                        ? 'e.g. Run tests and fix any regressions'
                        : 'e.g. Summarize unread messages and today’s priorities'
                  }
                  rows={3}
                  width="100%"
                />

                {newSource !== 'followup' ? (
                  <Selector
                    label="Repeat"
                    value={newRecurrence}
                    onChange={v => setNewRecurrence(v as ScheduleRecurrence)}
                    options={[
                      {value: 'daily', label: 'Every day at a set time'},
                      {value: 'weekdays', label: 'Weekdays (Mon – Fri)'},
                      {value: 'weekly', label: 'Specific days of the week'},
                      {value: 'once', label: 'Once on a calendar date'},
                      {value: 'interval', label: 'Repeating interval (e.g. 30m, 4h)'},
                    ]}
                    width="100%"
                  />
                ) : null}

                {newSource === 'followup' || newRecurrence === 'once' ? (
                  <Grid columns={isCompact ? 1 : 2} gap={3}>
                    <DateInput
                      label="Date"
                      value={newDate}
                      onChange={setNewDate}
                    />
                    <TimeInput
                      label="Time"
                      value={newTime}
                      onChange={setNewTime}
                    />
                  </Grid>
                ) : newRecurrence === 'interval' ? (
                  <VStack gap={2}>
                    <TextInput
                      label="Interval"
                      value={newEvery}
                      onChange={setNewEvery}
                      placeholder="e.g. 30m, 1h, 4h, 1d"
                      width="100%"
                    />
                    <HStack gap={1.5} wrap="wrap">
                      {INTERVAL_PRESETS.map(preset => (
                        <Button
                          key={preset}
                          label={preset}
                          size="sm"
                          variant={newEvery === preset ? 'primary' : 'secondary'}
                          onClick={() => setNewEvery(preset)}
                        />
                      ))}
                    </HStack>
                  </VStack>
                ) : (
                  <VStack gap={3}>
                    <TimeInput
                      label="Run time"
                      value={newTime}
                      onChange={setNewTime}
                    />
                    {newRecurrence === 'weekly' ? (
                      <VStack gap={1.5}>
                        <Text color="secondary">Days of week</Text>
                        <HStack gap={1.5} wrap="wrap">
                          {WEEKDAY_LABELS.map((dayLabel, idx) => {
                            const active = newDays.includes(idx);
                            return (
                              <Button
                                key={dayLabel}
                                label={dayLabel}
                                size="sm"
                                variant={active ? 'primary' : 'secondary'}
                                onClick={() =>
                                  setNewDays(prev =>
                                    prev.includes(idx)
                                      ? prev.filter(d => d !== idx)
                                      : [...prev, idx].sort((a, b) => a - b),
                                  )
                                }
                              />
                            );
                          })}
                        </HStack>
                      </VStack>
                    ) : null}
                  </VStack>
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack justify="end" gap={2} padding={3} width="100%">
                <Button
                  label="Cancel"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreateOpen(false)}
                />
                <Button
                  label={saving ? 'Saving…' : 'Save schedule'}
                  variant="primary"
                  size="sm"
                  isDisabled={saving || !newGoal.trim()}
                  onClick={() => void handleCreateSubmit()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </VStack>
  );
}
