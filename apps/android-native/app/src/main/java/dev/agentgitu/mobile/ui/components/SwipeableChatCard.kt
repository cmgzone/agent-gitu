package dev.agentgitu.mobile.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Swipeable chat request card container:
 * - Slide right (Start -> End): Accept / Allow / Connect (emerald reveal + haptic)
 * - Slide left  (End -> Start): Delete / Decline / Deny (crimson reveal + haptic)
 *
 * Returning `true` from `onAccept` / `onDelete` lets the card smoothly dismiss out of the chat;
 * returning `false` (for example, when a card requires filling out a form first) bounces back cleanly.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeableRequestCard(
    acceptLabel: String = "Accept",
    deleteLabel: String = "Delete",
    enableAcceptSwipe: Boolean = true,
    enableDeleteSwipe: Boolean = true,
    onAccept: () -> Boolean,
    onDelete: () -> Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { target ->
            when (target) {
                SwipeToDismissBoxValue.StartToEnd -> {
                    if (!enableAcceptSwipe) {
                        false
                    } else {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        onAccept()
                    }
                }
                SwipeToDismissBoxValue.EndToStart -> {
                    if (!enableDeleteSwipe) {
                        false
                    } else {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        onDelete()
                    }
                }
                SwipeToDismissBoxValue.Settled -> true
            }
        },
        positionalThreshold = { totalDistance -> totalDistance * 0.34f },
    )

    LaunchedEffect(dismissState.targetValue) {
        if (dismissState.targetValue != SwipeToDismissBoxValue.Settled) {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }

    SwipeToDismissBox(
        state = dismissState,
        modifier = modifier.fillMaxWidth(),
        enableDismissFromStartToEnd = enableAcceptSwipe,
        enableDismissFromEndToStart = enableDeleteSwipe,
        backgroundContent = {
            val direction = dismissState.dismissDirection
            val isAccept = direction == SwipeToDismissBoxValue.StartToEnd
            val isDelete = direction == SwipeToDismissBoxValue.EndToStart
            val bgColor by animateColorAsState(
                targetValue = when {
                    isAccept -> Color(0xFF16A34A)
                    isDelete -> Color(0xFFDC2626)
                    else -> Color.Transparent
                },
                label = "swipeCardBg",
            )
            val iconScale by animateFloatAsState(
                targetValue = if (dismissState.targetValue != SwipeToDismissBoxValue.Settled) 1.18f else 0.92f,
                animationSpec = spring(dampingRatio = 0.55f, stiffness = 500f),
                label = "swipeCardIconScale",
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(18.dp))
                    .background(bgColor)
                    .padding(horizontal = 20.dp),
                contentAlignment = if (isAccept) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                if (isAccept) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.graphicsLayer {
                            scaleX = iconScale
                            scaleY = iconScale
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = acceptLabel,
                            tint = Color.White,
                            modifier = Modifier.size(22.dp),
                        )
                        Text(
                            text = acceptLabel,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White,
                        )
                    }
                } else if (isDelete) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.graphicsLayer {
                            scaleX = iconScale
                            scaleY = iconScale
                        },
                    ) {
                        Text(
                            text = deleteLabel,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White,
                        )
                        Icon(
                            imageVector = Icons.Default.DeleteOutline,
                            contentDescription = deleteLabel,
                            tint = Color.White,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }
        },
        content = { content() },
    )
}
