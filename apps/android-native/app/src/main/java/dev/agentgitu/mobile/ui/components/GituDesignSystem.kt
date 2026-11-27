package dev.agentgitu.mobile.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.ImageLoader
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import dev.agentgitu.mobile.R
import dev.agentgitu.mobile.data.model.ConnectedServiceItem
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import java.net.URI
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * Springy tactile press feedback modifier — gives interactive pills, buttons, and cards
 * a lively, responsive bounce and subtle haptic tap.
 */
fun Modifier.stitchPressBounce(
    enabled: Boolean = true,
    pressedScale: Float = 0.95f,
    haptic: Boolean = true,
    onClick: () -> Unit,
): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) pressedScale else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "stitchBounceScale",
    )
    val haptics = LocalHapticFeedback.current
    this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .clickable(
            interactionSource = interactionSource,
            indication = ripple(bounded = true),
            enabled = enabled,
            onClick = {
                if (haptic) {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                }
                onClick()
            },
        )
}

/**
 * Exact Stitch card container: rounded-lg (20dp), surface-container-lowest, 1dp outline-variant.
 */
@Composable
fun StitchCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 20.dp,
    containerColor: Color? = null,
    borderColor: Color? = null,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val s = LocalStitchPalette.current
    val shape = RoundedCornerShape(cornerRadius)
    Surface(
        modifier = if (onClick != null) {
            modifier.clip(shape).stitchPressBounce(pressedScale = 0.975f, onClick = onClick)
        } else {
            modifier
        },
        shape = shape,
        color = containerColor ?: s.surfaceContainerLowest,
        border = BorderStroke(1.dp, borderColor ?: s.outlineVariant),
    ) {
        Column(content = content)
    }
}

/**
 * Exact Stitch Floating Pill-Capsule Bottom Navigation:
 * Active item expands (weight 1f) into a primary pill with Icon + Label.
 * Inactive items are compact 44dp circles in surface-container-low with icon only.
 */
@Composable
fun <T> StitchFloatingPillNav(
    items: List<Triple<T, String, ImageVector>>,
    selected: T,
    badgeTabs: Set<T> = emptySet(),
    onSelect: (T) -> Unit,
) {
    val s = LocalStitchPalette.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(s.surface)
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = CircleShape,
            color = s.surfaceContainerLowest,
            border = BorderStroke(1.dp, s.outlineVariant),
            shadowElevation = 6.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items.forEach { (tab, label, icon) ->
                    val active = tab == selected
                    val hasBadge = tab in badgeTabs
                    if (active) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp)
                                .clip(CircleShape)
                                .background(s.primary)
                                .stitchPressBounce(pressedScale = 0.96f) { onSelect(tab) }
                                .padding(horizontal = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                        ) {
                            Icon(icon, contentDescription = label, tint = s.onPrimary, modifier = Modifier.size(20.dp))
                            Text(
                                text = label,
                                color = s.onPrimary,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                            )
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(s.surfaceContainerLow)
                                .stitchPressBounce(pressedScale = 0.90f) { onSelect(tab) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(icon, contentDescription = label, tint = s.onSurfaceVariant, modifier = Modifier.size(20.dp))
                            if (hasBadge) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .padding(9.dp)
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(s.error),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Exact Stitch circular icon button (40dp, surface-container-low or primary) with spring bounce + haptic feedback. */
@Composable
fun StitchCircleIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    primary: Boolean = false,
    outlined: Boolean = false,
    danger: Boolean = false,
    size: Dp = 40.dp,
) {
    val s = LocalStitchPalette.current
    val bg by animateColorAsState(
        targetValue = when {
            primary -> s.primary
            danger -> s.errorContainer
            outlined -> s.surfaceContainerLowest
            else -> s.surfaceContainerLow
        },
        label = "circleBtnBg",
    )
    val fg by animateColorAsState(
        targetValue = when {
            primary -> s.onPrimary
            danger -> s.onErrorContainer
            else -> s.onSurface
        },
        label = "circleBtnFg",
    )
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(bg)
            .then(
                if (outlined) Modifier.border(1.dp, s.outlineVariant, CircleShape) else Modifier,
            )
            .stitchPressBounce(pressedScale = 0.89f, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = fg,
            modifier = Modifier.size(if (size <= 36.dp) 17.dp else 20.dp),
        )
    }
}

/** Stitch pill switcher (rounded-full bg-surface-container-low p-1, active rounded-full bg-surface-container-lowest). */
@Composable
fun <T> StitchSegmentedPills(
    items: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(CircleShape)
            .background(s.surfaceContainerLow)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        items.forEach { (value, label) ->
            val active = value == selected
            val bg by animateColorAsState(
                targetValue = if (active) s.surfaceContainerLowest else Color.Transparent,
                label = "stitchSegBg",
            )
            val fg by animateColorAsState(
                targetValue = if (active) s.onSurface else s.onSurfaceVariant,
                label = "stitchSegFg",
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(CircleShape)
                    .background(bg)
                    .stitchPressBounce(pressedScale = 0.95f) { onSelect(value) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    color = fg,
                    style = MaterialTheme.typography.labelMedium,
                    maxLines = 1,
                )
            }
        }
    }
}

/** Stitch rounded-full primary CTA button (high-contrast monochrome) with lively spring press animation. */
@Composable
fun StitchPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    icon: ImageVector? = null,
    roundedLg: Boolean = false,
) {
    val s = LocalStitchPalette.current
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled && !busy) 0.95f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "primaryBtnScale",
    )
    val haptics = LocalHapticFeedback.current
    Button(
        onClick = {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        },
        enabled = enabled && !busy,
        interactionSource = interactionSource,
        shape = if (roundedLg) RoundedCornerShape(20.dp) else CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = s.primary,
            contentColor = s.onPrimary,
            disabledContainerColor = s.surfaceContainer,
            disabledContentColor = s.outline,
        ),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
        modifier = modifier
            .heightIn(min = 46.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            },
    ) {
        if (busy) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp,
                color = s.onPrimary,
            )
            Spacer(Modifier.width(8.dp))
        } else if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun StitchSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    danger: Boolean = false,
    outlined: Boolean = false,
) {
    val s = LocalStitchPalette.current
    val bg = when {
        danger -> s.errorContainer
        outlined -> s.surfaceContainerLowest
        else -> s.surfaceContainerLow
    }
    val fg = if (danger) s.onErrorContainer else s.onSurface
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.95f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "secondaryBtnScale",
    )
    val haptics = LocalHapticFeedback.current
    Button(
        onClick = {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        },
        enabled = enabled,
        interactionSource = interactionSource,
        shape = CircleShape,
        border = if (outlined) BorderStroke(1.dp, s.outlineVariant) else null,
        colors = ButtonDefaults.buttonColors(
            containerColor = bg,
            contentColor = fg,
            disabledContainerColor = s.surfaceContainer,
            disabledContentColor = s.outline,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        modifier = modifier
            .heightIn(min = 42.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            },
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
        }
        Text(text, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

enum class BadgeTone {
    NEUTRAL,
    SUCCESS,
    WARNING,
    ERROR,
    PRIMARY,
}

@Composable
fun StitchBadge(
    text: String,
    tone: BadgeTone = BadgeTone.NEUTRAL,
    mono: Boolean = false,
    showDot: Boolean = false,
) {
    val s = LocalStitchPalette.current
    val (bg, fg, border) = when (tone) {
        BadgeTone.SUCCESS -> Triple(s.successContainer, s.onSuccessContainer, Color.Transparent)
        BadgeTone.WARNING -> Triple(s.warningContainer, s.onWarningContainer, Color.Transparent)
        BadgeTone.ERROR -> Triple(s.errorContainer, s.onErrorContainer, Color.Transparent)
        BadgeTone.PRIMARY -> Triple(s.primary, s.onPrimary, Color.Transparent)
        BadgeTone.NEUTRAL -> Triple(s.surfaceContainerLowest, s.onSurfaceVariant, s.outlineVariant)
    }
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(bg)
            .then(if (border != Color.Transparent) Modifier.border(1.dp, border, CircleShape) else Modifier)
            .padding(horizontal = 10.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (showDot) {
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(if (tone == BadgeTone.SUCCESS) s.success else fg),
            )
        }
        Text(
            text = text,
            color = fg,
            style = if (mono) MaterialTheme.typography.labelSmall else MaterialTheme.typography.labelMedium,
            maxLines = 1,
        )
    }
}

/** Stitch input field: rounded-md (14dp), bg-surface-container-low, border-outline-variant. */
@Composable
fun StitchInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    mono: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    headerTrailing: (@Composable () -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailingIcon: (@Composable () -> Unit)? = null,
) {
    val s = LocalStitchPalette.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(text = label, style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
            headerTrailing?.invoke()
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = if (placeholder.isNotBlank()) {
                { Text(placeholder, color = s.outline, style = MaterialTheme.typography.bodyMedium) }
            } else null,
            textStyle = if (mono) {
                MaterialTheme.typography.labelSmall.copy(color = s.onSurface, fontFamily = FontFamily.Monospace)
            } else {
                MaterialTheme.typography.bodyMedium.copy(color = s.onSurface)
            },
            singleLine = singleLine,
            minLines = minLines,
            maxLines = maxLines,
            keyboardOptions = keyboardOptions,
            visualTransformation = visualTransformation,
            trailingIcon = trailingIcon,
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = s.surfaceContainerLow,
                unfocusedContainerColor = s.surfaceContainerLow,
                focusedBorderColor = s.primary,
                unfocusedBorderColor = s.outlineVariant,
                focusedTextColor = s.onSurface,
                unfocusedTextColor = s.onSurface,
                cursorColor = s.primary,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Crisp circular avatar with optional Stitch presence ring + bottom-right status dot. */
@Composable
fun StitchAvatar(
    label: String,
    accentHex: String? = null,
    size: Dp = 44.dp,
    ringColor: Color? = null,
    statusDotColor: Color? = null,
) {
    val s = LocalStitchPalette.current
    val parsedColor = remember(accentHex) {
        accentHex?.takeIf { it.isNotBlank() }?.let {
            runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull()
        } ?: Color(0xFF3F3F46)
    }
    Box(contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .then(
                    if (ringColor != null) {
                        Modifier
                            .clip(CircleShape)
                            .border(2.dp, ringColor, CircleShape)
                            .padding(3.dp)
                    } else Modifier,
                )
                .size(size)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(parsedColor.copy(alpha = 0.92f), parsedColor.copy(alpha = 0.55f)),
                    ),
                )
                .border(1.dp, s.outlineVariant, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = label.trim().take(2).uppercase().ifBlank { "AI" },
                color = Color.White,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
        }
        if (statusDotColor != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(statusDotColor)
                    .border(2.dp, s.surface, CircleShape),
            )
        }
    }
}

@Composable
fun StitchBanner(
    text: String,
    isError: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (isError) s.errorContainer else s.surfaceContainerLow)
            .border(1.dp, if (isError) s.error.copy(alpha = 0.4f) else s.outlineVariant, RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(
            text = text,
            color = if (isError) s.onErrorContainer else s.onSurface,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

data class OfficialCharacterSpec(
    val shape: String,
    val displayName: String,
    val accentHex: String,
    @DrawableRes val drawableRes: Int,
)

val OFFICIAL_AI_CHARACTERS: List<OfficialCharacterSpec> = listOf(
    OfficialCharacterSpec("dot-orb", "Orb", "#ff6b57", R.drawable.char_orb),
    OfficialCharacterSpec("dot-block", "Block", "#4c7df0", R.drawable.char_block),
    OfficialCharacterSpec("dot-tip", "Tip", "#eab308", R.drawable.char_tip),
    OfficialCharacterSpec("dot-hexa", "Hexa", "#3fd68f", R.drawable.char_hexa),
    OfficialCharacterSpec("dot-nova", "Nova", "#9c6df2", R.drawable.char_nova),
    OfficialCharacterSpec("dot-dia", "Dia", "#29b7ad", R.drawable.char_dia),
    OfficialCharacterSpec("dot-penta", "Penta", "#f39b52", R.drawable.char_penta),
    OfficialCharacterSpec("dot-luna", "Luna", "#4f6396", R.drawable.char_luna),
    OfficialCharacterSpec("dot-plus", "Plus", "#7ccf35", R.drawable.char_plus),
    OfficialCharacterSpec("dot-pill", "Pill", "#ec4899", R.drawable.char_pill),
)

private val CHARACTER_BY_SHAPE: Map<String, OfficialCharacterSpec> =
    OFFICIAL_AI_CHARACTERS.associateBy { it.shape }

private val LEGACY_DOT_SHAPE_MAP: Map<String, String> = mapOf(
    "dot-blue" to "dot-block",
    "dot-mint" to "dot-hexa",
    "dot-orange" to "dot-penta",
    "dot-purple" to "dot-nova",
)

val OFFICIAL_COLOR_PALETTE: List<Pair<String, String>> = listOf(
    "Coral" to "#ff6b57",
    "Cobalt" to "#4c7df0",
    "Amber" to "#eab308",
    "Mint" to "#3fd68f",
    "Violet" to "#9c6df2",
    "Teal" to "#29b7ad",
    "Tangerine" to "#f39b52",
    "Slate" to "#4f6396",
    "Lime" to "#7ccf35",
    "Rose" to "#ec4899",
)

private val HEX_COLOR_REGEX = Regex("^#[0-9a-fA-F]{6}$")

private val MASCOT_BY_NAME: Map<String, String> = mapOf(
    "p.a" to "dot-orb",
    "pa" to "dot-orb",
    "atlas" to "dot-block",
    "nova" to "dot-nova",
    "forge" to "dot-hexa",
    "vault" to "dot-plus",
    "aegis" to "dot-penta",
    "pulse" to "dot-dia",
    "clara" to "dot-pill",
    "scout" to "dot-tip",
    "lyra" to "dot-luna",
)

private fun parseHexRgb(hex: String?): Triple<Int, Int, Int>? {
    val clean = hex?.trim().orEmpty()
    if (!HEX_COLOR_REGEX.matches(clean)) return null
    val r = clean.substring(1, 3).toIntOrNull(16) ?: return null
    val g = clean.substring(3, 5).toIntOrNull(16) ?: return null
    val b = clean.substring(5, 7).toIntOrNull(16) ?: return null
    return Triple(r, g, b)
}

fun parseHexColor(hex: String?, fallback: Color = Color(0xFF9C6DF2)): Color {
    val (r, g, b) = parseHexRgb(hex) ?: return fallback
    return Color(r / 255f, g / 255f, b / 255f, 1f)
}

/**
 * Exact match for `cwLuminance` / `cwThemeElement` contrast ink in `src/server/ui-cowork-colors.ts`.
 */
fun contrastInkFor(color: Color): Color {
    fun linear(channel: Float): Double =
        if (channel <= 0.03928f) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)
    val luminance = 0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue)
    return if (luminance > 0.179) Color(0xFF000000) else Color(0xFFFFFFFF)
}

/**
 * Resolves the exact official Agent Gitu plush character matching `cwEffectiveAvatar`
 * and `cwAvatarShape` in `src/server/ui-cowork.ts`:
 * 1) Explicit `dot-*` shape
 * 2) Valid `#rrggbb` color -> legacy `dot-blue`/`dot-mint`/`dot-orange`/`dot-purple` alias OR closest RGB match
 * 3) Known mascot name
 * 4) Deterministic hash fallback
 */
fun resolveOfficialCharacter(
    shapeName: String? = null,
    accentHex: String? = null,
    label: String = "",
): OfficialCharacterSpec {
    val cleanShape = shapeName?.trim()?.lowercase().orEmpty()
    CHARACTER_BY_SHAPE[cleanShape]?.let { return it }

    val rgb = parseHexRgb(accentHex)
    if (rgb != null) {
        LEGACY_DOT_SHAPE_MAP[cleanShape]?.let { mapped ->
            CHARACTER_BY_SHAPE[mapped]?.let { return it }
        }
        val (r, g, b) = rgb
        return OFFICIAL_AI_CHARACTERS.minBy { spec ->
            val (sr, sg, sb) = parseHexRgb(spec.accentHex) ?: Triple(156, 109, 242)
            (r - sr) * (r - sr) + (g - sg) * (g - sg) + (b - sb) * (b - sb)
        }
    }

    LEGACY_DOT_SHAPE_MAP[cleanShape]?.let { mapped ->
        CHARACTER_BY_SHAPE[mapped]?.let { return it }
    }

    val cleanName = label.trim().lowercase()
    MASCOT_BY_NAME[cleanName]?.let { mapped ->
        CHARACTER_BY_SHAPE[mapped]?.let { return it }
    }

    val seedKey = label.ifBlank { "agent" }
    var hash = 0L
    for (ch in seedKey) hash = (hash * 31L + ch.code.toLong()) and 0xFFFFFFFFL
    val idx = (hash % OFFICIAL_AI_CHARACTERS.size.toLong()).toInt()
    return OFFICIAL_AI_CHARACTERS[idx]
}

/**
 * Resolves the effective character accent hex matching `cwCharacterColor` in `ui-cowork-colors.ts`.
 */
fun resolveCharacterColorHex(
    shapeName: String? = null,
    accentHex: String? = null,
    label: String = "",
): String {
    val clean = accentHex?.trim().orEmpty()
    if (HEX_COLOR_REGEX.matches(clean)) return clean.lowercase()
    return resolveOfficialCharacter(shapeName = shapeName, accentHex = accentHex, label = label).accentHex
}

private fun rgbToHsv(rgb: Triple<Int, Int, Int>): Triple<Double, Double, Double> {
    val r = rgb.first / 255.0
    val g = rgb.second / 255.0
    val b = rgb.third / 255.0
    val high = max(r, max(g, b))
    val low = min(r, min(g, b))
    val d = high - low
    val hue = if (d == 0.0) {
        0.0
    } else {
        val h = when (high) {
            r -> (g - b) / d + (if (g < b) 6.0 else 0.0)
            g -> (b - r) / d + 2.0
            else -> (r - g) / d + 4.0
        }
        h * 60.0
    }
    val sat = if (high == 0.0) 0.0 else d / high
    return Triple(hue, sat, high)
}

private fun multiply4x5(a: FloatArray, b: FloatArray): FloatArray {
    val out = FloatArray(20)
    for (row in 0 until 4) {
        val rOff = row * 5
        for (col in 0 until 4) {
            out[rOff + col] =
                a[rOff + 0] * b[0 + col] +
                a[rOff + 1] * b[5 + col] +
                a[rOff + 2] * b[10 + col] +
                a[rOff + 3] * b[15 + col]
        }
        out[rOff + 4] =
            a[rOff + 0] * b[4] +
            a[rOff + 1] * b[9] +
            a[rOff + 2] * b[14] +
            a[rOff + 3] * b[19] +
            a[rOff + 4]
    }
    return out
}

/**
 * Computes the exact W3C CSS `hue-rotate(...) saturate(...) brightness(...)` 4x5 RGBA
 * ColorMatrix matching `cwCharacterFilter()` in `src/server/ui-cowork-colors.ts`.
 * Returns `null` when the target color already equals the character PNG's base color.
 */
fun computeCharacterColorMatrixValues(
    baseHex: String,
    targetHex: String?,
): FloatArray? {
    val cleanTarget = targetHex?.trim()?.lowercase().orEmpty()
    val cleanBase = baseHex.trim().lowercase()
    if (!HEX_COLOR_REGEX.matches(cleanTarget) || cleanTarget == cleanBase) return null
    val srcRgb = parseHexRgb(cleanBase) ?: return null
    val dstRgb = parseHexRgb(cleanTarget) ?: return null
    val (srcH, srcS, srcV) = rgbToHsv(srcRgb)
    val (dstH, dstS, dstV) = rgbToHsv(dstRgb)

    val hueDeg = ((dstH - srcH + 540.0) % 360.0) - 180.0
    val sat = if (srcS > 0.05) min(2.0, dstS / srcS) else 1.0
    val bri = if (srcV > 0.05) min(1.8, max(0.25, dstV / srcV)) else 1.0

    val rad = hueDeg * PI / 180.0
    val c = cos(rad).toFloat()
    val s = sin(rad).toFloat()
    val hueM = floatArrayOf(
        0.213f + 0.787f * c - 0.213f * s, 0.715f - 0.715f * c - 0.715f * s, 0.072f - 0.072f * c + 0.928f * s, 0f, 0f,
        0.213f - 0.213f * c + 0.143f * s, 0.715f + 0.285f * c + 0.140f * s, 0.072f - 0.072f * c - 0.283f * s, 0f, 0f,
        0.213f - 0.213f * c - 0.787f * s, 0.715f - 0.715f * c + 0.715f * s, 0.072f + 0.928f * c + 0.072f * s, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )
    val sf = sat.toFloat()
    val satM = floatArrayOf(
        0.213f + 0.787f * sf, 0.715f - 0.715f * sf, 0.072f - 0.072f * sf, 0f, 0f,
        0.213f - 0.213f * sf, 0.715f + 0.285f * sf, 0.072f - 0.072f * sf, 0f, 0f,
        0.213f - 0.213f * sf, 0.715f - 0.715f * sf, 0.072f + 0.928f * sf, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )
    val bf = bri.toFloat()
    val briM = floatArrayOf(
        bf, 0f, 0f, 0f, 0f,
        0f, bf, 0f, 0f, 0f,
        0f, 0f, bf, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )
    return multiply4x5(briM, multiply4x5(satM, hueM))
}

/**
 * Official Agent Gitu AI plush character renderer (with custom uploaded photo support
 * and exact CSS-parity hue/saturation/brightness recoloring matching Web / Cloud Agent).
 */
@Composable
fun StitchCharacterAvatar(
    label: String,
    accentHex: String? = null,
    shapeName: String? = null,
    imageUrl: String? = null,
    size: Dp = 56.dp,
    floating: Boolean = false,
    working: Boolean = false,
    statusDotColor: Color? = null,
) {
    val s = LocalStitchPalette.current
    val context = LocalContext.current
    val media = LocalGituMediaContext.current
    val spec = remember(shapeName, accentHex, label) {
        resolveOfficialCharacter(shapeName = shapeName, accentHex = accentHex, label = label)
    }
    val effectiveHex = remember(shapeName, accentHex, label) {
        resolveCharacterColorHex(shapeName = shapeName, accentHex = accentHex, label = label)
    }
    val glowColor = remember(effectiveHex) {
        parseHexColor(effectiveHex)
    }
    val tintColorFilter = remember(spec.accentHex, effectiveHex) {
        computeCharacterColorMatrixValues(spec.accentHex, effectiveHex)?.let { values ->
            ColorFilter.colorMatrix(ColorMatrix(values))
        }
    }
    val resolvedCustomUrl = remember(imageUrl, media.baseUrl) {
        val raw = imageUrl?.trim().orEmpty()
        if (raw.isBlank()) "" else resolveMediaUrl(raw, media.baseUrl)
    }

    val shouldAnimate = floating || working
    val animDuration = if (working) 1400 else 2800
    val bobRange = if (working) 3.5f else 2.2f
    val tiltRange = if (working) 2.2f else 1.1f

    val bobPhase by if (shouldAnimate) {
        rememberInfiniteTransition(label = "plushFloat").animateFloat(
            initialValue = -1f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = animDuration, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "bobPhase",
        )
    } else {
        remember { mutableFloatStateOf(0f) }
    }

    Box(
        modifier = Modifier.size(size),
        contentAlignment = Alignment.Center,
    ) {
        if (floating || working) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val r = this.size.minDimension * 0.56f
                val c = Offset(this.size.width / 2f, this.size.height / 2f)
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            glowColor.copy(alpha = if (working) 0.34f else 0.22f),
                            Color.Transparent,
                        ),
                        center = c,
                        radius = r,
                    ),
                    radius = r,
                    center = c,
                )
            }
        }

        val avatarMotionModifier = Modifier
            .fillMaxSize()
            .graphicsLayer {
                if (shouldAnimate) {
                    translationY = bobPhase * bobRange.dp.toPx()
                    rotationZ = bobPhase * tiltRange
                    val scale = 1f + (1f - abs(bobPhase)) * 0.018f
                    scaleX = scale
                    scaleY = scale
                }
            }

        if (resolvedCustomUrl.isNotBlank()) {
            val loader = media.imageLoader ?: remember(context) { ImageLoader(context) }
            val cornerShape = RoundedCornerShape((size.value * 0.30f).dp)
            Box(
                modifier = avatarMotionModifier
                    .clip(cornerShape)
                    .background(s.surfaceContainerLow)
                    .border(1.5.dp, glowColor.copy(alpha = 0.72f), cornerShape),
                contentAlignment = Alignment.Center,
            ) {
                SubcomposeAsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(resolvedCustomUrl)
                        .crossfade(true)
                        .build(),
                    imageLoader = loader,
                    contentDescription = label.ifBlank { spec.displayName },
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    error = {
                        Image(
                            painter = painterResource(id = spec.drawableRes),
                            contentDescription = label.ifBlank { spec.displayName },
                            contentScale = ContentScale.Fit,
                            colorFilter = tintColorFilter,
                            modifier = Modifier.fillMaxSize().padding(2.dp),
                        )
                    },
                )
            }
        } else {
            Image(
                painter = painterResource(id = spec.drawableRes),
                contentDescription = label.ifBlank { spec.displayName },
                contentScale = ContentScale.Fit,
                colorFilter = tintColorFilter,
                modifier = avatarMotionModifier,
            )
        }

        if (statusDotColor != null) {
            val dotSize = when {
                size >= 52.dp -> 11.dp
                size >= 38.dp -> 9.dp
                else -> 7.dp
            }
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(1.5.dp)
                    .size(dotSize)
                    .clip(CircleShape)
                    .background(statusDotColor)
                    .border(1.5.dp, s.surface, CircleShape),
            )
        }
    }
}

private val SERVICE_BRAND_DOMAINS: Map<String, String> = mapOf(
    "github" to "github.com",
    "gitlab" to "gitlab.com",
    "bitbucket" to "bitbucket.org",
    "slack" to "slack.com",
    "discord" to "discord.com",
    "notion" to "notion.so",
    "linear" to "linear.app",
    "figma" to "figma.com",
    "atlassian" to "atlassian.com",
    "jira" to "atlassian.com",
    "confluence" to "atlassian.com",
    "trello" to "trello.com",
    "asana" to "asana.com",
    "airtable" to "airtable.com",
    "hubspot" to "hubspot.com",
    "salesforce" to "salesforce.com",
    "shopify" to "shopify.com",
    "stripe" to "stripe.com",
    "paypal" to "paypal.com",
    "twilio" to "twilio.com",
    "supabase" to "supabase.com",
    "firebase" to "firebase.google.com",
    "postgres" to "postgresql.org",
    "postgresql" to "postgresql.org",
    "mysql" to "mysql.com",
    "mongodb" to "mongodb.com",
    "redis" to "redis.io",
    "docker" to "docker.com",
    "kubernetes" to "kubernetes.io",
    "cloudflare" to "cloudflare.com",
    "sentry" to "sentry.io",
    "vercel" to "vercel.com",
    "netlify" to "netlify.com",
    "coolify" to "coolify.io",
    "aws" to "aws.amazon.com",
    "azure" to "azure.microsoft.com",
    "google" to "google.com",
    "gdrive" to "drive.google.com",
    "googledrive" to "drive.google.com",
    "drive" to "drive.google.com",
    "gmail" to "mail.google.com",
    "googlemail" to "mail.google.com",
    "gcalendar" to "calendar.google.com",
    "googlecalendar" to "calendar.google.com",
    "calendar" to "calendar.google.com",
    "googledocs" to "docs.google.com",
    "docs" to "docs.google.com",
    "googlesheets" to "sheets.google.com",
    "sheets" to "sheets.google.com",
    "googleslides" to "slides.google.com",
    "googlemeet" to "meet.google.com",
    "gmaps" to "maps.google.com",
    "youtube" to "youtube.com",
    "spotify" to "spotify.com",
    "brave" to "brave.com",
    "bravesearch" to "brave.com",
    "tavily" to "tavily.com",
    "exa" to "exa.ai",
    "firecrawl" to "firecrawl.dev",
    "playwright" to "playwright.dev",
    "zapier" to "zapier.com",
    "n8n" to "n8n.io",
    "grafana" to "grafana.com",
    "datadog" to "datadoghq.com",
    "telegram" to "telegram.org",
    "x" to "x.com",
    "twitter" to "x.com",
    "linkedin" to "linkedin.com",
    "reddit" to "reddit.com",
    "wordpress" to "wordpress.org",
    "webflow" to "webflow.com",
    "facebook" to "facebook.com",
    "instagram" to "instagram.com",
    "outlook" to "outlook.com",
    "outlookemail" to "outlook.com",
    "microsoftteams" to "teams.microsoft.com",
    "teams" to "teams.microsoft.com",
    "whatsapp" to "whatsapp.com",
    "zoom" to "zoom.us",
    "dropbox" to "dropbox.com",
    "resend" to "resend.com",
    "sendgrid" to "sendgrid.com",
    "postmark" to "postmarkapp.com",
    "openai" to "openai.com",
    "anthropic" to "anthropic.com",
    "clickup" to "clickup.com",
    "intercom" to "intercom.com",
    "zendesk" to "zendesk.com",
    "mailchimp" to "mailchimp.com",
    "pikpam" to "pikpam.com",
    "contabo" to "contabo.com",
)

fun resolveServiceBrandDomain(serviceSlug: String?, baseUrl: String? = null): String {
    val raw = serviceSlug?.trim()?.lowercase().orEmpty()
    if (raw.isNotBlank()) {
        val compact = raw.replace(Regex("[\\s_-]+"), "")
        val stripped = raw.removeSuffix("-mcp").removeSuffix("mcp").removeSuffix("-server")
        val strippedCompact = stripped.replace(Regex("[\\s_-]+"), "")
        listOf(raw, compact, stripped, strippedCompact).forEach { key ->
            SERVICE_BRAND_DOMAINS[key]?.let { return it }
        }
    }
    if (!baseUrl.isNullOrBlank()) {
        runCatching {
            val host = URI(baseUrl.trim()).host?.lowercase().orEmpty()
            if (host.contains(".") && !host.startsWith("localhost") && !host.startsWith("127.")) {
                val cleanHost = host.removePrefix("api.").removePrefix("www.")
                return cleanHost
            }
        }
    }
    return ""
}

fun resolveAppLogoUrl(
    logoUrl: String? = null,
    serviceSlug: String? = null,
    baseUrl: String? = null,
    servicesCatalog: List<ConnectedServiceItem> = emptyList(),
): String? {
    val direct = logoUrl?.trim().orEmpty()
    if (direct.startsWith("https://") || direct.startsWith("http://")) return direct

    val slug = serviceSlug?.trim()?.lowercase().orEmpty()
    if (slug.isNotBlank()) {
        val compact = slug.replace(Regex("[\\s_-]+"), "")
        val catalogLogo = servicesCatalog.firstOrNull { svc ->
            val sSlug = svc.slug.trim().lowercase()
            sSlug == slug || sSlug.replace(Regex("[\\s_-]+"), "") == compact
        }?.logo?.trim()
        if (!catalogLogo.isNullOrBlank() && (catalogLogo.startsWith("https://") || catalogLogo.startsWith("http://"))) {
            return catalogLogo
        }
    }

    val domain = resolveServiceBrandDomain(serviceSlug, baseUrl)
    if (domain.isNotBlank()) {
        return "https://icons.duckduckgo.com/ip3/$domain.ico"
    }
    return null
}

/**
 * Shared real brand logo renderer for Connected Apps, Custom API connections,
 * Agent Profile accounts, and inline Cowork app/credential cards — mirrors Web's
 * `cwServiceIcon()` + `cwToolIconHtml()` with SVG/PNG/ICO decoding via Coil and
 * a crisp white backing plate when a brand mark loads.
 */
@Composable
fun AppServiceLogo(
    logoUrl: String? = null,
    serviceSlug: String? = null,
    baseUrl: String? = null,
    fallbackLabel: String = "App",
    servicesCatalog: List<ConnectedServiceItem> = emptyList(),
    size: Dp = 36.dp,
) {
    val s = LocalStitchPalette.current
    val context = LocalContext.current
    val media = LocalGituMediaContext.current
    val loader = media.imageLoader ?: remember(context) { ImageLoader(context) }

    val primaryUrl = remember(logoUrl, serviceSlug, baseUrl, servicesCatalog) {
        resolveAppLogoUrl(logoUrl, serviceSlug, baseUrl, servicesCatalog)
    }
    val fallbackFaviconUrl = remember(serviceSlug, baseUrl, primaryUrl) {
        val domain = resolveServiceBrandDomain(serviceSlug, baseUrl)
        val ddg = if (domain.isNotBlank()) "https://icons.duckduckgo.com/ip3/$domain.ico" else null
        if (ddg != null && ddg != primaryUrl) ddg else null
    }

    var activeUrl by remember(primaryUrl) { mutableStateOf(primaryUrl) }
    var imageLoaded by remember(primaryUrl) { mutableStateOf(false) }

    val slugNorm = remember(serviceSlug) { serviceSlug?.trim()?.lowercase()?.replace(Regex("[\\s_-]+"), "").orEmpty() }
    val corner = RoundedCornerShape((size.value * 0.28f).dp)

    Box(
        modifier = Modifier
            .size(size)
            .clip(corner)
            .background(if (imageLoaded) Color.White else s.surfaceContainerLow)
            .border(1.dp, s.outlineVariant, corner),
        contentAlignment = Alignment.Center,
    ) {
        if (!activeUrl.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(context)
                    .data(activeUrl)
                    .crossfade(true)
                    .build(),
                imageLoader = loader,
                contentDescription = fallbackLabel,
                contentScale = ContentScale.Fit,
                onSuccess = { imageLoaded = true },
                onError = {
                    imageLoaded = false
                    if (activeUrl != fallbackFaviconUrl && fallbackFaviconUrl != null) {
                        activeUrl = fallbackFaviconUrl
                    } else {
                        activeUrl = null
                    }
                },
                modifier = Modifier.size((size.value * 0.64f).dp),
                error = {
                    AppServiceFallbackGlyph(slugNorm = slugNorm, fallbackLabel = fallbackLabel)
                },
            )
        } else {
            AppServiceFallbackGlyph(slugNorm = slugNorm, fallbackLabel = fallbackLabel)
        }
    }
}

@Composable
private fun AppServiceFallbackGlyph(slugNorm: String, fallbackLabel: String) {
    val s = LocalStitchPalette.current
    when {
        slugNorm in setOf("mail", "gmail", "googlemail", "outlook", "outlookemail", "resend", "sendgrid", "postmark") -> {
            Icon(Icons.Default.Email, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
        }
        slugNorm in setOf("calendar", "googlecalendar", "gcalendar", "calendly") -> {
            Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
        }
        else -> {
            val ch = fallbackLabel.trim().firstOrNull()?.uppercaseChar()
            if (ch != null && ch.isLetterOrDigit()) {
                Text(ch.toString(), style = MaterialTheme.typography.labelLarge, color = s.primary)
            } else {
                Icon(Icons.Default.Extension, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
            }
        }
    }
}

/** Format an ISO-8601 timestamp (e.g. 2026-11-25T14:24:09.612Z) as HH:mm cleanly. */
fun formatShortTime(raw: String?): String {
    if (raw.isNullOrBlank()) return ""
    val trimmed = raw.trim()
    val afterT = trimmed.substringAfter('T', "")
    if (afterT.length >= 5 && afterT[2] == ':') {
        return afterT.substring(0, 5)
    }
    if (trimmed.length >= 5 && trimmed[2] == ':') {
        return trimmed.substring(0, 5)
    }
    return trimmed.take(10)
}

@Composable
fun StitchOrbPulse(
    size: Dp = 56.dp,
    animate: Boolean = true,
) {
    val s = LocalStitchPalette.current
    val pulse by if (animate) {
        rememberInfiniteTransition(label = "stitchOrb").animateFloat(
            initialValue = 0.85f,
            targetValue = 1.0f,
            animationSpec = infiniteRepeatable(tween(1800, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "p",
        )
    } else {
        remember { mutableFloatStateOf(0.95f) }
    }
    Canvas(modifier = Modifier.size(size)) {
        val r = this.size.minDimension / 2f
        val c = Offset(r, r)
        drawCircle(
            brush = Brush.radialGradient(listOf(s.primary.copy(alpha = 0.25f * pulse), Color.Transparent), c, r),
            radius = r,
            center = c,
        )
        drawCircle(color = s.surfaceContainerHigh, radius = r * 0.72f, center = c)
        drawCircle(color = s.primary, radius = r * 0.35f * pulse, center = c)
    }
}
