package dev.agentgitu.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.data.model.ScheduleItem
import dev.agentgitu.mobile.data.model.Teammate
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private enum class ScheduleScreenMode {
    CALENDAR,
    LIST,
}

private val DOW_SHORT = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
private val TIME_PRESETS = listOf("08:30", "09:00", "12:00", "17:00", "20:00")
private val INTERVAL_PRESETS = listOf("15m", "30m", "1h", "4h", "1d")

private fun calendarKey(cal: Calendar): String =
    "%04d-%02d-%02d".format(
        Locale.US,
        cal.get(Calendar.YEAR),
        cal.get(Calendar.MONTH) + 1,
        cal.get(Calendar.DAY_OF_MONTH),
    )

private fun todayKey(): String = calendarKey(Calendar.getInstance())

private fun parseIsoToDate(iso: String?): Date? {
    if (iso.isNullOrBlank()) return null
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSSX",
        "yyyy-MM-dd'T'HH:mm:ssX",
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm",
    )
    for (p in patterns) {
        val parsed = runCatching {
            SimpleDateFormat(p, Locale.US).apply {
                if (p.endsWith("'Z'")) timeZone = TimeZone.getTimeZone("UTC")
            }.parse(iso)
        }.getOrNull()
        if (parsed != null) return parsed
    }
    return null
}

private fun parseKeyToCalendar(key: String): Calendar {
    val parts = key.split("-")
    val y = parts.getOrNull(0)?.toIntOrNull() ?: 2026
    val m = (parts.getOrNull(1)?.toIntOrNull() ?: 1) - 1
    val d = parts.getOrNull(2)?.toIntOrNull() ?: 1
    return Calendar.getInstance().apply {
        set(Calendar.YEAR, y)
        set(Calendar.MONTH, m)
        set(Calendar.DAY_OF_MONTH, d)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
}

private fun formatMonthTitle(year: Int, monthZeroBased: Int): String {
    val cal = Calendar.getInstance().apply {
        set(Calendar.YEAR, year)
        set(Calendar.MONTH, monthZeroBased)
        set(Calendar.DAY_OF_MONTH, 1)
    }
    return SimpleDateFormat("MMMM yyyy", Locale.getDefault()).format(cal.time)
}

private fun formatSelectedDateLabel(key: String): String {
    val cal = parseKeyToCalendar(key)
    return SimpleDateFormat("EEE, MMM d", Locale.getDefault()).format(cal.time)
}

private fun formatCountdown(iso: String?): String {
    val dt = parseIsoToDate(iso) ?: return "Paused"
    val diffMs = dt.time - System.currentTimeMillis()
    if (diffMs <= 60_000L) return "Due soon"
    val mins = (diffMs / 60_000L).toInt()
    if (mins < 60) return "in ${mins}m"
    val hours = (mins + 30) / 60
    if (hours < 24) return "in ${hours}h"
    val days = (hours + 12) / 24
    return "in ${days}d"
}

private fun formatCadence(item: ScheduleItem): String {
    if (item.source == "followup" || item.recurrence == "once") {
        val dt = parseIsoToDate(item.runAt ?: item.nextRunAt)
        if (dt != null) {
            val fmt = SimpleDateFormat("MMM d · HH:mm", Locale.getDefault()).format(dt)
            return "Once · $fmt"
        }
        return "One-time"
    }
    val timeSuffix = if (!item.atTime.isNullOrBlank()) " · ${item.atTime}" else ""
    return when (item.recurrence) {
        "daily" -> "Daily$timeSuffix"
        "weekdays" -> "Weekdays$timeSuffix"
        "weekly" -> {
            val days = (item.daysOfWeek.ifEmpty { listOf(1) })
                .mapNotNull { DOW_SHORT.getOrNull(it) }
                .joinToString(", ")
            "${days.ifBlank { "Weekly" }}$timeSuffix"
        }
        else -> "Every ${item.every.ifBlank { "1h" }}"
    }
}

internal fun scheduleMatchesDate(item: ScheduleItem, dateKey: String): Boolean {
    val cal = parseKeyToCalendar(dateKey)
    val dow = cal.get(Calendar.DAY_OF_WEEK) - 1 // Calendar.SUNDAY=1 -> 0

    if (item.source == "followup" || item.recurrence == "once") {
        val dt = parseIsoToDate(item.runAt ?: item.nextRunAt) ?: return false
        val c = Calendar.getInstance().apply { time = dt }
        return calendarKey(c) == dateKey
    }
    return when (item.recurrence) {
        "daily" -> true
        "weekdays" -> dow in 1..5
        "weekly" -> (item.daysOfWeek.ifEmpty { listOf(1) }).contains(dow)
        else -> {
            val lower = item.every.trim().lowercase(Locale.US)
            val subDayOrDaily = Regex("^\\d+$").matches(lower) ||
                Regex("^\\d+\\s*(s|sec|m|min|h|hour|1d|1\\s*day).*").matches(lower)
            if (subDayOrDaily) {
                dateKey >= todayKey()
            } else {
                val dt = parseIsoToDate(item.nextRunAt) ?: return false
                val c = Calendar.getInstance().apply { time = dt }
                calendarKey(c) == dateKey
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchedulesScreen(
    state: AppUiState,
    vm: GituAppViewModel,
    onBack: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val haptics = LocalHapticFeedback.current

    val initialCal = remember { Calendar.getInstance() }
    var viewMode by remember { mutableStateOf(ScheduleScreenMode.CALENDAR) }
    var expandedMonth by remember { mutableStateOf(true) }
    var visibleYear by remember { mutableIntStateOf(initialCal.get(Calendar.YEAR)) }
    var visibleMonth by remember { mutableIntStateOf(initialCal.get(Calendar.MONTH)) }
    var selectedDate by remember { mutableStateOf(todayKey()) }
    var sourceFilter by remember { mutableStateOf("all") }
    var agentFilter by remember { mutableStateOf("all") }
    var showCreateDialog by remember { mutableStateOf(false) }

    val filteredSchedules = remember(state.schedules, sourceFilter, agentFilter) {
        state.schedules.filter { item ->
            val matchSource = sourceFilter == "all" || item.source == sourceFilter
            val matchAgent = agentFilter == "all" || item.agentId == agentFilter
            matchSource && matchAgent
        }
    }

    val daySchedules = remember(filteredSchedules, selectedDate) {
        filteredSchedules.filter { scheduleMatchesDate(it, selectedDate) }
    }

    val nextUpcoming = remember(state.schedules) {
        state.schedules.firstOrNull { it.enabled && !it.nextRunAt.isNullOrBlank() }
    }

    val activeCount = remember(state.schedules) { state.schedules.count { it.enabled } }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // Top Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StitchCircleIconButton(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                onClick = onBack,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text("Schedules", style = MaterialTheme.typography.titleLarge, color = s.onSurface)
                Text(
                    text = buildString {
                        append("$activeCount active")
                        if (state.schedulesTimezone.isNotBlank()) {
                            append(" · ")
                            append(state.schedulesTimezone)
                        }
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = s.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            StitchCircleIconButton(
                icon = Icons.Default.Add,
                contentDescription = "New schedule",
                primary = true,
                onClick = { showCreateDialog = true },
            )
        }

        // Mode Switcher (Calendar | List)
        Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
            StitchSegmentedPills(
                items = listOf(
                    ScheduleScreenMode.CALENDAR to "Calendar",
                    ScheduleScreenMode.LIST to "All (${filteredSchedules.size})",
                ),
                selected = viewMode,
                onSelect = {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    viewMode = it
                },
            )
        }

        PullToRefreshBox(
            isRefreshing = state.schedulesLoading,
            onRefresh = { vm.refreshSchedules() },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Live "Next Up" Hero Banner
                if (nextUpcoming != null) {
                    item(key = "next_up_hero") {
                        StitchCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                if (!nextUpcoming.agentShape.isNullOrBlank() || !nextUpcoming.agentAvatarUrl.isNullOrBlank()) {
                                    StitchCharacterAvatar(
                                        label = nextUpcoming.agentName ?: nextUpcoming.title,
                                        accentHex = nextUpcoming.agentColor,
                                        shapeName = nextUpcoming.agentShape,
                                        imageUrl = nextUpcoming.agentAvatarUrl,
                                        size = 44.dp,
                                        statusDotColor = s.success,
                                    )
                                } else {
                                    Box(
                                        modifier = Modifier
                                            .size(44.dp)
                                            .clip(CircleShape)
                                            .background(s.primary.copy(alpha = 0.14f)),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(Icons.Default.Code, contentDescription = null, tint = s.primary)
                                    }
                                }
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(7.dp)
                                                .clip(CircleShape)
                                                .background(s.success),
                                        )
                                        Text(
                                            text = "Next ${formatCountdown(nextUpcoming.nextRunAt)} · ${nextUpcoming.agentName ?: "Coding"}",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = s.primary,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    }
                                    Text(
                                        text = nextUpcoming.title,
                                        style = MaterialTheme.typography.titleSmall,
                                        color = s.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = formatCadence(nextUpcoming),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = s.onSurfaceVariant,
                                    )
                                }
                                FilledTonalButton(
                                    onClick = {
                                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                        vm.runScheduleNow(nextUpcoming)
                                    },
                                    enabled = !state.busyScheduleIds.contains(nextUpcoming.id),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                ) {
                                    Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Run")
                                }
                            }
                        }
                    }
                }

                // Filter Strip (Type + Teammates)
                item(key = "filter_strip") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        val typeChips = listOf(
                            "all" to "All",
                            "cowork" to "Routines",
                            "followup" to "Reminders",
                            "cron" to "Coding",
                        )
                        typeChips.forEach { (key, label) ->
                            val selected = sourceFilter == key
                            FilterChip(
                                selected = selected,
                                onClick = { sourceFilter = key },
                                label = { Text(label, style = MaterialTheme.typography.labelMedium) },
                            )
                        }
                        if (state.teammates.size > 1) {
                            state.teammates.forEach { ag ->
                                val selected = agentFilter == ag.id
                                val dotColor = parseHexColor(
                                    resolveCharacterColorHex(ag.avatar?.shape, ag.avatar?.color, ag.name),
                                )
                                FilterChip(
                                    selected = selected,
                                    onClick = { agentFilter = if (selected) "all" else ag.id },
                                    leadingIcon = {
                                        Box(
                                            modifier = Modifier
                                                .size(8.dp)
                                                .clip(CircleShape)
                                                .background(dotColor),
                                        )
                                    },
                                    label = { Text(ag.name, style = MaterialTheme.typography.labelMedium) },
                                )
                            }
                        }
                    }
                }

                if (viewMode == ScheduleScreenMode.CALENDAR) {
                    // Calendar Card (Month grid or collapsible 7-day Week strip)
                    item(key = "calendar_grid") {
                        ScheduleCalendarCard(
                            year = visibleYear,
                            monthZeroBased = visibleMonth,
                            selectedDate = selectedDate,
                            expandedMonth = expandedMonth,
                            schedules = filteredSchedules,
                            onToggleExpand = { expandedMonth = !expandedMonth },
                            onPrev = {
                                if (expandedMonth) {
                                    val c = Calendar.getInstance().apply {
                                        set(visibleYear, visibleMonth, 1)
                                        add(Calendar.MONTH, -1)
                                    }
                                    visibleYear = c.get(Calendar.YEAR)
                                    visibleMonth = c.get(Calendar.MONTH)
                                } else {
                                    val c = parseKeyToCalendar(selectedDate).apply { add(Calendar.DAY_OF_MONTH, -7) }
                                    selectedDate = calendarKey(c)
                                    visibleYear = c.get(Calendar.YEAR)
                                    visibleMonth = c.get(Calendar.MONTH)
                                }
                            },
                            onNext = {
                                if (expandedMonth) {
                                    val c = Calendar.getInstance().apply {
                                        set(visibleYear, visibleMonth, 1)
                                        add(Calendar.MONTH, 1)
                                    }
                                    visibleYear = c.get(Calendar.YEAR)
                                    visibleMonth = c.get(Calendar.MONTH)
                                } else {
                                    val c = parseKeyToCalendar(selectedDate).apply { add(Calendar.DAY_OF_MONTH, 7) }
                                    selectedDate = calendarKey(c)
                                    visibleYear = c.get(Calendar.YEAR)
                                    visibleMonth = c.get(Calendar.MONTH)
                                }
                            },
                            onToday = {
                                val now = Calendar.getInstance()
                                visibleYear = now.get(Calendar.YEAR)
                                visibleMonth = now.get(Calendar.MONTH)
                                selectedDate = calendarKey(now)
                            },
                            onSelectDate = { key ->
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                selectedDate = key
                            },
                        )
                    }

                    // Selected Day Agenda Header
                    item(key = "agenda_header") {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column {
                                Text(
                                    text = formatSelectedDateLabel(selectedDate),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = s.onSurface,
                                )
                                Text(
                                    text = "${daySchedules.size} scheduled · swipe right to run, left to remove",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = s.onSurfaceVariant,
                                )
                            }
                            TextButton(onClick = { showCreateDialog = true }) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Add")
                            }
                        }
                    }

                    if (daySchedules.isEmpty()) {
                        item(key = "day_empty") {
                            StitchCard(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(20.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(
                                        Icons.Default.EventAvailable,
                                        contentDescription = null,
                                        tint = s.onSurfaceVariant,
                                        modifier = Modifier.size(28.dp),
                                    )
                                    Text("Open day", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                    Text(
                                        "No routines, reminders, or coding runs scheduled on ${formatSelectedDateLabel(selectedDate)}.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = s.onSurfaceVariant,
                                        textAlign = TextAlign.Center,
                                    )
                                    StitchSecondaryButton(
                                        text = "Schedule on this date",
                                        onClick = { showCreateDialog = true },
                                    )
                                }
                            }
                        }
                    } else {
                        items(daySchedules, key = { "day_${it.id}" }) { item ->
                            ScheduleSwipeRow(
                                item = item,
                                busy = state.busyScheduleIds.contains(item.id),
                                onRun = { vm.runScheduleNow(item) },
                                onToggle = { vm.toggleSchedule(item, it) },
                                onDelete = { vm.deleteSchedule(item) },
                                onOpenChat = item.conversationId?.let { cid ->
                                    { vm.openConversationFromSchedules(cid) }
                                },
                            )
                        }
                    }
                } else {
                    // LIST VIEW
                    if (filteredSchedules.isEmpty()) {
                        item(key = "list_empty") {
                            StitchCard(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(24.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(
                                        Icons.Default.CalendarMonth,
                                        contentDescription = null,
                                        tint = s.onSurfaceVariant,
                                        modifier = Modifier.size(32.dp),
                                    )
                                    Text("No schedules yet", style = MaterialTheme.typography.titleMedium, color = s.onSurface)
                                    Text(
                                        "Schedule recurring teammate digests, one-time date reminders, or automated coding checks.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = s.onSurfaceVariant,
                                        textAlign = TextAlign.Center,
                                    )
                                    StitchPrimaryButton(
                                        text = "New schedule",
                                        onClick = { showCreateDialog = true },
                                    )
                                }
                            }
                        }
                    } else {
                        items(filteredSchedules, key = { "list_${it.id}" }) { item ->
                            ScheduleSwipeRow(
                                item = item,
                                busy = state.busyScheduleIds.contains(item.id),
                                onRun = { vm.runScheduleNow(item) },
                                onToggle = { vm.toggleSchedule(item, it) },
                                onDelete = { vm.deleteSchedule(item) },
                                onOpenChat = item.conversationId?.let { cid ->
                                    { vm.openConversationFromSchedules(cid) }
                                },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateScheduleDialog(
            selectedDate = selectedDate,
            teammates = state.teammates,
            hasProject = state.schedulesHasProject,
            onDismiss = { showCreateDialog = false },
            onSave = { source, goal, title, agentId, recurrence, every, atTime, daysOfWeek, runAt ->
                showCreateDialog = false
                vm.createSchedule(
                    source = source,
                    goal = goal,
                    title = title,
                    agentId = agentId,
                    recurrence = recurrence,
                    every = every,
                    atTime = atTime,
                    daysOfWeek = daysOfWeek,
                    runAt = runAt,
                )
            },
        )
    }
}

@Composable
private fun ScheduleCalendarCard(
    year: Int,
    monthZeroBased: Int,
    selectedDate: String,
    expandedMonth: Boolean,
    schedules: List<ScheduleItem>,
    onToggleExpand: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
    onSelectDate: (String) -> Unit,
) {
    val s = LocalStitchPalette.current
    val today = remember { todayKey() }

    val gridCells = remember(year, monthZeroBased, selectedDate, expandedMonth) {
        if (expandedMonth) {
            val first = Calendar.getInstance().apply {
                set(Calendar.YEAR, year)
                set(Calendar.MONTH, monthZeroBased)
                set(Calendar.DAY_OF_MONTH, 1)
            }
            val startDow = first.get(Calendar.DAY_OF_WEEK) - 1 // 0=Sun
            val daysInMonth = first.getActualMaximum(Calendar.DAY_OF_MONTH)
            val totalSlots = ((startDow + daysInMonth + 6) / 7) * 7
            List(totalSlots) { idx ->
                val dayNum = idx - startDow + 1
                if (dayNum in 1..daysInMonth) {
                    val c = Calendar.getInstance().apply { set(year, monthZeroBased, dayNum) }
                    Triple(calendarKey(c), dayNum, false)
                } else {
                    Triple("", 0, true)
                }
            }
        } else {
            val anchor = parseKeyToCalendar(selectedDate)
            val startOfWeek = (anchor.clone() as Calendar).apply {
                add(Calendar.DAY_OF_MONTH, -(get(Calendar.DAY_OF_WEEK) - 1))
            }
            List(7) { i ->
                val c = (startOfWeek.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, i) }
                Triple(calendarKey(c), c.get(Calendar.DAY_OF_MONTH), false)
            }
        }
    }

    StitchCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Month navigation row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { onToggleExpand() }
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                ) {
                    Text(
                        text = formatMonthTitle(year, monthZeroBased),
                        style = MaterialTheme.typography.titleMedium,
                        color = s.onSurface,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Icon(
                        imageVector = if (expandedMonth) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = if (expandedMonth) "Collapse to week" else "Expand month",
                        tint = s.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "Today",
                        style = MaterialTheme.typography.labelMedium,
                        color = s.primary,
                        modifier = Modifier
                            .clip(CircleShape)
                            .clickable { onToday() }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                    IconButton(onClick = onPrev, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = "Previous", tint = s.onSurface)
                    }
                    IconButton(onClick = onNext, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "Next", tint = s.onSurface)
                    }
                }
            }

            // Weekday header
            Row(modifier = Modifier.fillMaxWidth()) {
                DOW_SHORT.forEach { d ->
                    Text(
                        text = d.take(2),
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Day rows
            gridCells.chunked(7).forEach { week ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    week.forEach { (key, dayNum, empty) ->
                        if (empty) {
                            Spacer(modifier = Modifier.weight(1f).height(42.dp))
                        } else {
                            val hits = schedules.filter { scheduleMatchesDate(it, key) }
                            val isSelected = key == selectedDate
                            val isToday = key == today
                            val bg by animateColorAsState(
                                targetValue = when {
                                    isSelected -> s.primary.copy(alpha = 0.16f)
                                    isToday -> s.surfaceContainerLow
                                    else -> Color.Transparent
                                },
                                label = "dayCellBg",
                            )
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .height(42.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(bg)
                                    .then(
                                        if (isSelected) Modifier.border(1.5.dp, s.primary, RoundedCornerShape(12.dp))
                                        else if (isToday) Modifier.border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
                                        else Modifier,
                                    )
                                    .clickable { onSelectDate(key) }
                                    .padding(vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = dayNum.toString(),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = if (isSelected || isToday) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isSelected || isToday) s.primary else s.onSurface,
                                )
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    hits.take(3).forEach { item ->
                                        val dotColor = when {
                                            !item.enabled -> s.outlineVariant
                                            item.status == "failed" -> s.error
                                            !item.agentColor.isNullOrBlank() || !item.agentShape.isNullOrBlank() ->
                                                parseHexColor(resolveCharacterColorHex(item.agentShape, item.agentColor, item.agentName ?: item.title))
                                            else -> s.primary
                                        }
                                        Box(
                                            modifier = Modifier
                                                .size(5.dp)
                                                .clip(CircleShape)
                                                .background(dotColor),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduleSwipeRow(
    item: ScheduleItem,
    busy: Boolean,
    onRun: () -> Unit,
    onToggle: (Boolean) -> Unit,
    onDelete: () -> Unit,
    onOpenChat: (() -> Unit)?,
) {
    val s = LocalStitchPalette.current
    SwipeableRequestCard(
        acceptLabel = "Run now",
        deleteLabel = "Remove",
        enableAcceptSwipe = !busy,
        enableDeleteSwipe = !busy,
        onAccept = {
            onRun()
            false // Keep card in place after triggering manual run
        },
        onDelete = {
            onDelete()
            true
        },
    ) {
        StitchCard(
            modifier = Modifier.fillMaxWidth(),
            onClick = onOpenChat,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (!item.agentShape.isNullOrBlank() || !item.agentAvatarUrl.isNullOrBlank()) {
                    StitchCharacterAvatar(
                        label = item.agentName ?: item.title,
                        accentHex = item.agentColor,
                        shapeName = item.agentShape,
                        imageUrl = item.agentAvatarUrl,
                        size = 40.dp,
                        statusDotColor = when {
                            !item.enabled -> s.outlineVariant
                            item.status == "failed" -> s.error
                            item.status == "running" -> s.primary
                            else -> s.success
                        },
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(s.surfaceContainerLow),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = if (item.source == "cron") Icons.Default.Code else Icons.Default.Schedule,
                            contentDescription = null,
                            tint = if (item.enabled) s.primary else s.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.titleSmall,
                        color = if (item.enabled) s.onSurface else s.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = buildString {
                            append(formatCadence(item))
                            append(" · ")
                            append(item.agentName ?: if (item.source == "cron") "Coding" else "Reminder")
                            if (item.enabled && !item.nextRunAt.isNullOrBlank()) {
                                append(" · ")
                                append(formatCountdown(item.nextRunAt))
                            }
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    AnimatedVisibility(visible = !item.error.isNullOrBlank()) {
                        Text(
                            text = item.error.orEmpty(),
                            style = MaterialTheme.typography.labelSmall,
                            color = s.error,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                IconButton(
                    onClick = onRun,
                    enabled = !busy,
                    modifier = Modifier.size(34.dp),
                ) {
                    Icon(
                        Icons.Default.PlayArrow,
                        contentDescription = "Run now",
                        tint = s.primary,
                        modifier = Modifier.size(20.dp),
                    )
                }

                if (item.source != "followup") {
                    Switch(
                        checked = item.enabled,
                        enabled = !busy,
                        onCheckedChange = onToggle,
                    )
                }
            }
        }
    }
}

@Composable
private fun CreateScheduleDialog(
    selectedDate: String,
    teammates: List<Teammate>,
    hasProject: Boolean,
    onDismiss: () -> Unit,
    onSave: (
        source: String,
        goal: String,
        title: String?,
        agentId: String?,
        recurrence: String,
        every: String?,
        atTime: String?,
        daysOfWeek: List<Int>?,
        runAt: String?,
    ) -> Unit,
) {
    val s = LocalStitchPalette.current
    var source by remember { mutableStateOf("cowork") }
    var goal by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    var selectedAgentId by remember { mutableStateOf(teammates.firstOrNull()?.id.orEmpty()) }
    var recurrence by remember { mutableStateOf("weekdays") }
    var dateText by remember { mutableStateOf(selectedDate) }
    var timeText by remember { mutableStateOf("09:00") }
    var selectedDays by remember { mutableStateOf(setOf(1, 3, 5)) }
    var everyText by remember { mutableStateOf("1h") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.surfaceContainerLowest,
        title = { Text("New Schedule", color = s.onSurface) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Schedule type
                StitchSegmentedPills(
                    items = buildList {
                        add("cowork" to "Routine")
                        add("followup" to "Reminder")
                        if (hasProject) add("cron" to "Coding")
                    },
                    selected = source,
                    onSelect = {
                        source = it
                        if (it == "followup") recurrence = "once"
                        else if (recurrence == "once") recurrence = "weekdays"
                    },
                )

                // Agent selector
                if (source != "cron" && teammates.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Teammate", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            teammates.forEach { ag ->
                                FilterChip(
                                    selected = selectedAgentId == ag.id,
                                    onClick = { selectedAgentId = ag.id },
                                    label = { Text(ag.name) },
                                )
                            }
                        }
                    }
                } else if (source == "cron") {
                    StitchInputField(
                        value = title,
                        onValueChange = { title = it },
                        label = "Short title (optional)",
                        placeholder = "Nightly test suite",
                    )
                }

                StitchInputField(
                    value = goal,
                    onValueChange = { goal = it },
                    label = if (source == "followup") "Reminder note" else "Instructions / goal",
                    placeholder = if (source == "followup") "Follow up with client on launch" else "Summarize unread messages & priorities",
                )

                // Repeat pattern
                if (source != "followup") {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Repeat", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            listOf(
                                "daily" to "Daily",
                                "weekdays" to "Weekdays",
                                "weekly" to "Weekly",
                                "once" to "Once",
                                "interval" to "Interval",
                            ).forEach { (key, label) ->
                                FilterChip(
                                    selected = recurrence == key,
                                    onClick = { recurrence = key },
                                    label = { Text(label) },
                                )
                            }
                        }
                    }
                }

                // Date + Time OR Interval controls
                if (source == "followup" || recurrence == "once") {
                    StitchInputField(
                        value = dateText,
                        onValueChange = { dateText = it },
                        label = "Calendar date (YYYY-MM-DD)",
                        placeholder = selectedDate,
                        mono = true,
                    )
                }

                if (recurrence == "interval" && source != "followup") {
                    StitchInputField(
                        value = everyText,
                        onValueChange = { everyText = it },
                        label = "Every (e.g. 30m, 1h, 4h, 1d)",
                        placeholder = "1h",
                        mono = true,
                    )
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        INTERVAL_PRESETS.forEach { preset ->
                            FilterChip(
                                selected = everyText == preset,
                                onClick = { everyText = preset },
                                label = { Text(preset) },
                            )
                        }
                    }
                } else {
                    StitchInputField(
                        value = timeText,
                        onValueChange = { timeText = it },
                        label = "Time (24h HH:MM)",
                        placeholder = "09:00",
                        mono = true,
                    )
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        TIME_PRESETS.forEach { preset ->
                            FilterChip(
                                selected = timeText == preset,
                                onClick = { timeText = preset },
                                label = { Text(preset) },
                            )
                        }
                    }
                }

                if (source != "followup" && recurrence == "weekly") {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Days of week", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            DOW_SHORT.forEachIndexed { idx, label ->
                                val active = selectedDays.contains(idx)
                                FilterChip(
                                    selected = active,
                                    onClick = {
                                        selectedDays = if (active) selectedDays - idx else selectedDays + idx
                                    },
                                    label = { Text(label) },
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = goal.trim().isNotEmpty(),
                onClick = {
                    val effectiveRec = if (source == "followup") "once" else recurrence
                    val cleanTime = timeText.trim().ifBlank { "09:00" }
                    val runAtIso = if (effectiveRec == "once") {
                        runCatching {
                            val localFmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US)
                            val dt = localFmt.parse("${dateText.trim()}T$cleanTime")
                            if (dt != null) {
                                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                                    timeZone = TimeZone.getTimeZone("UTC")
                                }.format(dt)
                            } else null
                        }.getOrNull()
                    } else null
                    onSave(
                        source,
                        goal.trim(),
                        title.trim().ifBlank { null },
                        selectedAgentId.ifBlank { null },
                        effectiveRec,
                        if (effectiveRec == "interval") everyText.trim().ifBlank { "1h" } else null,
                        if (effectiveRec in listOf("daily", "weekdays", "weekly")) cleanTime else null,
                        if (effectiveRec == "weekly") selectedDays.sorted().ifEmpty { listOf(1) } else null,
                        runAtIso,
                    )
                },
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = s.onSurfaceVariant)
            }
        },
    )
}
