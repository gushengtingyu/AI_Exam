package com.aiexam.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

private val LightColors = lightColorScheme(
    primary = Color(0xFF246BEE), onPrimary = Color.White,
    primaryContainer = Color(0xFFE6EFFF), onPrimaryContainer = Color(0xFF153367),
    secondary = Color(0xFF007F78), onSecondary = Color.White,
    secondaryContainer = Color(0xFFD8F5EF), onSecondaryContainer = Color(0xFF003B36),
    tertiary = Color(0xFFBE4B30), onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFE9DF), onTertiaryContainer = Color(0xFF5A1A08),
    background = Color(0xFFF5F8FC), surface = Color(0xFFF5F8FC),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFEDF2F8), surfaceContainerHigh = Color(0xFFE5ECF5),
    onSurface = Color(0xFF182B46), onSurfaceVariant = Color(0xFF63738A),
    outline = Color(0xFF9191A2), outlineVariant = Color(0xFFDFE7F1),
)
private val DarkColors = darkColorScheme(
    primary = Color(0xFFA7C8FF), onPrimary = Color(0xFF073064),
    primaryContainer = Color(0xFF174782), onPrimaryContainer = Color(0xFFE6EFFF),
    secondary = Color(0xFF61D9C8), onSecondary = Color(0xFF003731),
    secondaryContainer = Color(0xFF005047), onSecondaryContainer = Color(0xFFB0F2E8),
    tertiary = Color(0xFFFFB59F), onTertiary = Color(0xFF5C1A0A),
    tertiaryContainer = Color(0xFF7D3020), onTertiaryContainer = Color(0xFFFFDBCE),
    background = Color(0xFF0F1825), surface = Color(0xFF0F1825),
    surfaceContainerLowest = Color(0xFF0C1420), surfaceContainerLow = Color(0xFF172333),
    surfaceContainer = Color(0xFF1D2B3E), surfaceContainerHigh = Color(0xFF28374C),
    onSurface = Color(0xFFE7E7F0), onSurfaceVariant = Color(0xFFC4C3D0),
    outline = Color(0xFF8E8D9A), outlineVariant = Color(0xFF464650),
)

@Composable
fun AIExamTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    fontScale: Float = 1f,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        darkTheme -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colorScheme, typography = ExamTypography.scaled(fontScale),
        shapes = Shapes(extraSmall = RoundedCornerShape(10.dp), small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(18.dp), large = RoundedCornerShape(24.dp)),
        content = content)
}
