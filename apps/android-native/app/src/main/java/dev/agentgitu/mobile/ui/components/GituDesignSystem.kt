package dev.agentgitu.mobile.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.R
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette

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
        modifier = if (onClick != null) modifier.clip(shape).clickable(onClick = onClick) else modifier,
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
                                .clickable { onSelect(tab) }
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
                                .clickable { onSelect(tab) },
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

/** Exact Stitch circular icon button (40dp, surface-container-low or primary). */
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
    val bg = when {
        primary -> s.primary
        danger -> s.errorContainer
        outlined -> s.surfaceContainerLowest
        else -> s.surfaceContainerLow
    }
    val fg = when {
        primary -> s.onPrimary
        danger -> s.onErrorContainer
        else -> s.onSurface
    }
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(bg)
            .then(
                if (outlined) Modifier.border(1.dp, s.outlineVariant, CircleShape) else Modifier,
            )
            .clickable(onClick = onClick),
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
                    .clickable { onSelect(value) }
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

/** Stitch rounded-full primary CTA button (high-contrast monochrome). */
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
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        shape = if (roundedLg) RoundedCornerShape(20.dp) else CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = s.primary,
            contentColor = s.onPrimary,
            disabledContainerColor = s.surfaceContainer,
            disabledContentColor = s.outline,
        ),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
        modifier = modifier.heightIn(min = 46.dp),
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
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        border = if (outlined) BorderStroke(1.dp, s.outlineVariant) else null,
        colors = ButtonDefaults.buttonColors(
            containerColor = bg,
            contentColor = fg,
            disabledContainerColor = s.surfaceContainer,
            disabledContentColor = s.outline,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        modifier = modifier.heightIn(min = 42.dp),
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

private val LEGACY_SHAPE_TO_DOT: Map<String, String> = mapOf(
    "orb" to "dot-orb",
    "home-blob" to "dot-orb",
    "block" to "dot-block",
    "cube" to "dot-block",
    "dot-blue" to "dot-block",
    "tip" to "dot-tip",
    "pyramid" to "dot-tip",
    "hexa" to "dot-hexa",
    "dot-mint" to "dot-hexa",
    "nova" to "dot-nova",
    "dot-purple" to "dot-nova",
    "dia" to "dot-dia",
    "diamond" to "dot-dia",
    "penta" to "dot-penta",
    "dot-orange" to "dot-penta",
    "luna" to "dot-luna",
    "plus" to "dot-plus",
    "pill" to "dot-pill",
)

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

/**
 * Resolves the exact official Agent Gitu plush character matching `cwEffectiveAvatar`
 * in `src/server/ui-cowork.ts` (explicit dot-* shape, legacy shape alias, known mascot
 * name, closest RGB color match, or deterministic hash fallback).
 */
fun resolveOfficialCharacter(
    shapeName: String? = null,
    accentHex: String? = null,
    label: String = "",
): OfficialCharacterSpec {
    val cleanShape = shapeName?.trim()?.lowercase().orEmpty()
    CHARACTER_BY_SHAPE[cleanShape]?.let { return it }
    LEGACY_SHAPE_TO_DOT[cleanShape]?.let { mapped ->
        CHARACTER_BY_SHAPE[mapped]?.let { return it }
    }

    val cleanName = label.trim().lowercase()
    MASCOT_BY_NAME[cleanName]?.let { mapped ->
        CHARACTER_BY_SHAPE[mapped]?.let { return it }
    }

    val hex = accentHex?.trim().orEmpty()
    if (hex.length == 7 && hex.startsWith("#")) {
        val r = hex.substring(1, 3).toIntOrNull(16)
        val g = hex.substring(3, 5).toIntOrNull(16)
        val b = hex.substring(5, 7).toIntOrNull(16)
        if (r != null && g != null && b != null) {
            return OFFICIAL_AI_CHARACTERS.minBy { spec ->
                val sr = spec.accentHex.substring(1, 3).toInt(16)
                val sg = spec.accentHex.substring(3, 5).toInt(16)
                val sb = spec.accentHex.substring(5, 7).toInt(16)
                (r - sr) * (r - sr) + (g - sg) * (g - sg) + (b - sb) * (b - sb)
            }
        }
    }

    val seedKey = label.ifBlank { "agent" }
    var hash = 0
    for (ch in seedKey) hash = hash * 31 + ch.code
    val idx = (hash and 0x7FFFFFFF) % OFFICIAL_AI_CHARACTERS.size
    return OFFICIAL_AI_CHARACTERS[idx]
}

/**
 * Official Agent Gitu AI plush character renderer using the authentic artwork PNGs
 * (`char_orb.png`, `char_block.png`, `char_tip.png`, `char_hexa.png`, `char_nova.png`,
 * `char_dia.png`, `char_penta.png`, `char_luna.png`, `char_plus.png`, `char_pill.png`)
 * with subtle plush breathing / floating motion matching `CHARACTER_CSS`.
 */
@Composable
fun StitchCharacterAvatar(
    label: String,
    accentHex: String? = null,
    shapeName: String? = null,
    size: Dp = 56.dp,
    floating: Boolean = false,
    working: Boolean = false,
    statusDotColor: Color? = null,
) {
    val s = LocalStitchPalette.current
    val spec = remember(shapeName, accentHex, label) {
        resolveOfficialCharacter(shapeName = shapeName, accentHex = accentHex, label = label)
    }
    val glowColor = remember(accentHex, spec.accentHex) {
        val raw = accentHex?.takeIf { it.isNotBlank() } ?: spec.accentHex
        runCatching { Color(android.graphics.Color.parseColor(raw)) }.getOrNull() ?: Color(0xFF9C6DF2)
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

        Image(
            painter = painterResource(id = spec.drawableRes),
            contentDescription = label.ifBlank { spec.displayName },
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    if (shouldAnimate) {
                        translationY = bobPhase * bobRange.dp.toPx()
                        rotationZ = bobPhase * tiltRange
                        val scale = 1f + (1f - kotlin.math.abs(bobPhase)) * 0.018f
                        scaleX = scale
                        scaleY = scale
                    }
                },
        )

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
