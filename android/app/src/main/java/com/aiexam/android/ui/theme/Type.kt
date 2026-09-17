package com.aiexam.android.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val ExamTypography = Typography(
    displayLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.ExtraBold, fontSize = 56.sp, lineHeight = 64.sp, letterSpacing = (-1.2).sp),
    displayMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.ExtraBold, fontSize = 38.sp, lineHeight = 46.sp, letterSpacing = (-0.8).sp),
    headlineLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 40.sp, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 31.sp, letterSpacing = (-0.4).sp),
    headlineSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 21.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 24.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 21.sp),
    titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, lineHeight = 20.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 13.sp, lineHeight = 18.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 11.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, lineHeight = 15.sp),
    labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, lineHeight = 14.sp, letterSpacing = 0.5.sp),
)

fun Typography.scaled(scale: Float): Typography {
    val safeScale = scale.coerceIn(0.85f, 1.25f)
    fun TextStyle.scaled(): TextStyle = copy(
        fontSize = fontSize * safeScale,
        lineHeight = lineHeight * safeScale,
    )
    return copy(
        displayLarge = displayLarge.scaled(),
        displayMedium = displayMedium.scaled(),
        displaySmall = displaySmall.scaled(),
        headlineLarge = headlineLarge.scaled(),
        headlineMedium = headlineMedium.scaled(),
        headlineSmall = headlineSmall.scaled(),
        titleLarge = titleLarge.scaled(),
        titleMedium = titleMedium.scaled(),
        titleSmall = titleSmall.scaled(),
        bodyLarge = bodyLarge.scaled(),
        bodyMedium = bodyMedium.scaled(),
        bodySmall = bodySmall.scaled(),
        labelLarge = labelLarge.scaled(),
        labelMedium = labelMedium.scaled(),
        labelSmall = labelSmall.scaled(),
    )
}
