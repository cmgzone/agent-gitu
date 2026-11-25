package dev.agentgitu.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.data.local.ThemePreference

/**
 * Exact Stitch Agent Gitu Cowork Mobile color system (Zinc monochrome + semantic accents).
 */
@Immutable
data class StitchPalette(
    val isDark: Boolean,
    val surface: Color,
    val surfaceDim: Color,
    val surfaceContainerLowest: Color,
    val surfaceContainerLow: Color,
    val surfaceContainer: Color,
    val surfaceContainerHigh: Color,
    val onSurface: Color,
    val onSurfaceVariant: Color,
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
    val secondaryContainer: Color,
    val onSecondaryContainer: Color,
    val tertiary: Color,
    val onTertiary: Color,
    val tertiaryContainer: Color,
    val onTertiaryContainer: Color,
    val outline: Color,
    val outlineVariant: Color,
    val success: Color,
    val successContainer: Color,
    val onSuccessContainer: Color,
    val warning: Color,
    val warningContainer: Color,
    val onWarningContainer: Color,
    val error: Color,
    val onError: Color,
    val errorContainer: Color,
    val onErrorContainer: Color,
)

val DarkStitchPalette = StitchPalette(
    isDark = true,
    surface = Color(0xFF0E0E10),
    surfaceDim = Color(0xFF09090B),
    surfaceContainerLowest = Color(0xFF18181B),
    surfaceContainerLow = Color(0xFF222226),
    surfaceContainer = Color(0xFF27272A),
    surfaceContainerHigh = Color(0xFF303036),
    onSurface = Color(0xFFFAFAFA),
    onSurfaceVariant = Color(0xFFA1A1AA),
    primary = Color(0xFFFAFAFA),
    onPrimary = Color(0xFF18181B),
    primaryContainer = Color(0xFFE4E4E7),
    onPrimaryContainer = Color(0xFF18181B),
    secondaryContainer = Color(0xFF27272A),
    onSecondaryContainer = Color(0xFFFAFAFA),
    tertiary = Color(0xFFE4E4E7),
    onTertiary = Color(0xFF18181B),
    tertiaryContainer = Color(0xFF27272A),
    onTertiaryContainer = Color(0xFFFAFAFA),
    outline = Color(0xFF71717A),
    outlineVariant = Color(0xFF27272A),
    success = Color(0xFF15803D),
    successContainer = Color(0xFFDCFCE7),
    onSuccessContainer = Color(0xFF14532D),
    warning = Color(0xFFB45309),
    warningContainer = Color(0xFFFEF3C7),
    onWarningContainer = Color(0xFF78350F),
    error = Color(0xFFF87171),
    onError = Color(0xFF450A0A),
    errorContainer = Color(0xFF7F1D1D),
    onErrorContainer = Color(0xFFFEE2E2),
)

val LightStitchPalette = StitchPalette(
    isDark = false,
    surface = Color(0xFFEFEFEF),
    surfaceDim = Color(0xFFDFDFE3),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFE4E4E7),
    surfaceContainer = Color(0xFFDCDCE0),
    surfaceContainerHigh = Color(0xFFD4D4D8),
    onSurface = Color(0xFF18181B),
    onSurfaceVariant = Color(0xFF52525B),
    primary = Color(0xFF18181B),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFF27272A),
    onPrimaryContainer = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFE4E4E7),
    onSecondaryContainer = Color(0xFF18181B),
    tertiary = Color(0xFF27272A),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFE4E4E7),
    onTertiaryContainer = Color(0xFF18181B),
    outline = Color(0xFF71717A),
    outlineVariant = Color(0xFFDFDFE3),
    success = Color(0xFF15803D),
    successContainer = Color(0xFFDCFCE7),
    onSuccessContainer = Color(0xFF14532D),
    warning = Color(0xFFB45309),
    warningContainer = Color(0xFFFEF3C7),
    onWarningContainer = Color(0xFF78350F),
    error = Color(0xFFBA1A1A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF93000A),
)

val LocalStitchPalette = staticCompositionLocalOf { DarkStitchPalette }

private val DarkColors = darkColorScheme(
    primary = DarkStitchPalette.primary,
    onPrimary = DarkStitchPalette.onPrimary,
    primaryContainer = DarkStitchPalette.primaryContainer,
    onPrimaryContainer = DarkStitchPalette.onPrimaryContainer,
    secondary = DarkStitchPalette.tertiary,
    onSecondary = DarkStitchPalette.onTertiary,
    secondaryContainer = DarkStitchPalette.secondaryContainer,
    onSecondaryContainer = DarkStitchPalette.onSecondaryContainer,
    background = DarkStitchPalette.surface,
    onBackground = DarkStitchPalette.onSurface,
    surface = DarkStitchPalette.surfaceContainerLowest,
    onSurface = DarkStitchPalette.onSurface,
    surfaceVariant = DarkStitchPalette.surfaceContainerLow,
    onSurfaceVariant = DarkStitchPalette.onSurfaceVariant,
    outline = DarkStitchPalette.outline,
    outlineVariant = DarkStitchPalette.outlineVariant,
    error = DarkStitchPalette.error,
    onError = DarkStitchPalette.onError,
    errorContainer = DarkStitchPalette.errorContainer,
    onErrorContainer = DarkStitchPalette.onErrorContainer,
)

private val LightColors = lightColorScheme(
    primary = LightStitchPalette.primary,
    onPrimary = LightStitchPalette.onPrimary,
    primaryContainer = LightStitchPalette.primaryContainer,
    onPrimaryContainer = LightStitchPalette.onPrimaryContainer,
    secondary = LightStitchPalette.tertiary,
    onSecondary = LightStitchPalette.onTertiary,
    secondaryContainer = LightStitchPalette.secondaryContainer,
    onSecondaryContainer = LightStitchPalette.onSecondaryContainer,
    background = LightStitchPalette.surface,
    onBackground = LightStitchPalette.onSurface,
    surface = LightStitchPalette.surfaceContainerLowest,
    onSurface = LightStitchPalette.onSurface,
    surfaceVariant = LightStitchPalette.surfaceContainerLow,
    onSurfaceVariant = LightStitchPalette.onSurfaceVariant,
    outline = LightStitchPalette.outline,
    outlineVariant = LightStitchPalette.outlineVariant,
    error = LightStitchPalette.error,
    onError = LightStitchPalette.onError,
    errorContainer = LightStitchPalette.errorContainer,
    onErrorContainer = LightStitchPalette.onErrorContainer,
)

// Exact Stitch typography scale
private val StitchTypography = Typography(
    displaySmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.25).sp),
    headlineMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-0.15).sp),
    headlineSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp, letterSpacing = 0.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.2.sp),
    labelSmall = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
)

@Composable
fun AgentGituTheme(
    preference: ThemePreference = ThemePreference.DARK,
    content: @Composable () -> Unit,
) {
    val dark = when (preference) {
        ThemePreference.SYSTEM -> isSystemInDarkTheme()
        ThemePreference.LIGHT -> false
        ThemePreference.DARK -> true
    }
    val palette = if (dark) DarkStitchPalette else LightStitchPalette
    CompositionLocalProvider(LocalStitchPalette provides palette) {
        MaterialTheme(
            colorScheme = if (dark) DarkColors else LightColors,
            typography = StitchTypography,
            content = content,
        )
    }
}
