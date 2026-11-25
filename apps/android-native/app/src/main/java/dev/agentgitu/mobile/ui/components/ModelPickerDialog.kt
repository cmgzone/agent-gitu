package dev.agentgitu.mobile.ui.components

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.data.model.ModelsCatalogResponse
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette

/**
 * Native Stitch AI Model Picker Dialog backed by `GET /api/models` and `POST /api/model-selection`
 * (or per-teammate `POST /api/cowork/agents`).
 */
@Composable
fun ModelPickerDialog(
    title: String = "Choose AI Model",
    catalog: ModelsCatalogResponse,
    currentProvider: String?,
    currentModel: String?,
    allowWorkspaceDefault: Boolean = false,
    onRefresh: () -> Unit,
    onSelect: (provider: String?, model: String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val sortedProviders = remember(catalog.providers) {
        catalog.providers.sortedWith(
            compareByDescending<dev.agentgitu.mobile.data.model.ModelProviderInfo> { it.usable }
                .thenBy { it.label.lowercase() },
        )
    }

    var selectedProviderId by remember(currentProvider, sortedProviders) {
        mutableStateOf(
            currentProvider?.takeIf { id -> sortedProviders.any { it.id == id } }
                ?: sortedProviders.firstOrNull { it.usable }?.id
                ?: sortedProviders.firstOrNull()?.id.orEmpty(),
        )
    }
    var search by remember { mutableStateOf("") }

    val activeProvider = sortedProviders.firstOrNull { it.id == selectedProviderId }
    val filteredModels = remember(activeProvider, search) {
        val q = search.trim().lowercase()
        activeProvider?.models.orEmpty().filter { m ->
            q.isEmpty() || m.id.lowercase().contains(q) || (m.label?.lowercase()?.contains(q) == true)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.surfaceContainerLowest,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = s.onSurface)
                StitchCircleIconButton(
                    icon = Icons.Default.Refresh,
                    contentDescription = "Refresh models",
                    outlined = true,
                    size = 34.dp,
                    onClick = onRefresh,
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 420.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (allowWorkspaceDefault) {
                    val isDefault = currentModel.isNullOrBlank()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isDefault) s.secondaryContainer else s.surfaceContainerLow)
                            .border(1.dp, if (isDefault) s.primary else s.outlineVariant, RoundedCornerShape(12.dp))
                            .clickable {
                                onSelect(null, null)
                                onDismiss()
                            }
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Workspace default", style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                            Text(
                                text = catalog.effectiveModel?.substringAfterLast('/') ?: "Auto",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                color = s.onSurfaceVariant,
                            )
                        }
                        if (isDefault) Icon(Icons.Default.Check, contentDescription = null, tint = s.primary, modifier = Modifier.size(16.dp))
                    }
                }

                // Provider Chips
                if (sortedProviders.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        sortedProviders.forEach { prov ->
                            val active = prov.id == selectedProviderId
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(if (active) s.primary else s.surfaceContainerLow)
                                    .border(1.dp, if (active) s.primary else s.outlineVariant, CircleShape)
                                    .clickable { selectedProviderId = prov.id }
                                    .padding(horizontal = 10.dp, vertical = 5.dp),
                            ) {
                                if (prov.usable) {
                                    Box(
                                        modifier = Modifier
                                            .size(6.dp)
                                            .clip(CircleShape)
                                            .background(if (active) s.onPrimary else s.success),
                                    )
                                }
                                Text(
                                    text = prov.label.ifBlank { prov.id },
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                    color = if (active) s.onPrimary else s.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                StitchInputField(
                    value = search,
                    onValueChange = { search = it },
                    label = "Filter models",
                    placeholder = "claude, gpt, gemini, deepseek…",
                )

                if (activeProvider != null && !activeProvider.usable) {
                    Text(
                        text = "${activeProvider.label} is not configured on this server yet.",
                        style = MaterialTheme.typography.labelSmall,
                        color = s.warning,
                    )
                }

                if (filteredModels.isEmpty()) {
                    Text(
                        text = "No models available for this filter. Tap refresh above to reload.",
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurfaceVariant,
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        items(filteredModels, key = { "${selectedProviderId}_${it.id}" }) { m ->
                            val selected = currentModel == m.id && (currentProvider.isNullOrBlank() || currentProvider == selectedProviderId)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if (selected) s.secondaryContainer else s.surfaceContainerLow)
                                    .border(1.dp, if (selected) s.primary else s.outlineVariant, RoundedCornerShape(12.dp))
                                    .clickable {
                                        onSelect(selectedProviderId, m.id)
                                        onDismiss()
                                    }
                                    .padding(horizontal = 11.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                    Text(
                                        text = m.label?.ifBlank { m.id } ?: m.id,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = s.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (!m.label.isNullOrBlank() && m.label != m.id) {
                                        Text(
                                            text = m.id,
                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                            color = s.onSurfaceVariant,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                                if (selected) {
                                    Icon(Icons.Default.Check, contentDescription = "Selected", tint = s.primary, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = s.onSurfaceVariant)
            }
        },
    )
}
