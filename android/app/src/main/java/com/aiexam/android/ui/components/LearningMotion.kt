package com.aiexam.android.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ProcessingRing(progress: Float, running: Boolean, modifier: Modifier = Modifier) {
    val rotation = if (running) {
        val transition = rememberInfiniteTransition(label = "processing")
        val angle by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(4200, easing = LinearEasing)), label = "orbit")
        angle
    } else 0f
    Box(modifier.size(170.dp), contentAlignment = Alignment.Center) {
        if (running) Canvas(Modifier.fillMaxSize().graphicsLayer { rotationZ = rotation }) {
            drawCircle(Color.White.copy(alpha = 0.15f), size.minDimension / 2f - 4.dp.toPx(), style = Stroke(1.dp.toPx()))
            drawCircle(Color(0xFFFFD578), 4.dp.toPx(), Offset(size.width / 2f, 4.dp.toPx()))
        }
        ScoreRing(progress, "${(progress * 100).toInt()}%", size = 140.dp, color = Color.White,
            trackColor = Color.White.copy(alpha = 0.2f), textColor = Color.White)
    }
}

// Fixed brand gradients keep white foregrounds legible in both system themes.
val LearningBlue = Color(0xFF246BEE)
val LearningTeal = Color(0xFF007F78)
val LearningCoral = Color(0xFFD75A3C)
val LearningGradient = Brush.linearGradient(listOf(Color(0xFF1760DF), Color(0xFF237BE8), Color(0xFF008C91)))

@Composable
fun Entrance(delayMillis: Int = 0, content: @Composable () -> Unit) {
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }
    AnimatedVisibility(
        visible = entered,
        enter = fadeIn(tween(260, delayMillis)) + slideInVertically(tween(340, delayMillis, FastOutSlowInEasing)) { it / 12 },
    ) { content() }
}

@Composable
fun SpringButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    light: Boolean = false,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.975f else 1f, spring(dampingRatio = 0.72f, stiffness = 500f), label = "button-press")
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        interactionSource = interaction,
        modifier = modifier.heightIn(min = 48.dp).graphicsLayer { scaleX = scale; scaleY = scale },
        shape = RoundedCornerShape(18.dp),
        colors = if (light) ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = LearningBlue)
            else ButtonDefaults.buttonColors(),
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 10.dp),
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = LocalContentColor.current)
        else Icon(Icons.Outlined.DocumentScanner, null, Modifier.size(20.dp))
        Spacer(Modifier.width(9.dp))
        Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
    }
}

/** Vector artwork: a floating paper, growth bars and an orbiting sparkle. */
@Composable
fun LearningIllustration(modifier: Modifier = Modifier, active: Boolean = true) {
    val phase = if (active) {
        val transition = rememberInfiniteTransition(label = "learning-art")
        val motion by transition.animateFloat(
            0f, 1f, infiniteRepeatable(tween(3200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "float",
        )
        motion
    } else 0.5f
    Canvas(modifier) {
        val unit = size.minDimension / 180f
        scale(unit, unit, pivot = Offset.Zero) {
            drawCircle(Color.White.copy(alpha = 0.09f), 76f, Offset(90f, 90f))
            drawCircle(Color.White.copy(alpha = 0.14f), 67f, Offset(90f, 90f), style = Stroke(1.2f))
            drawOval(Color(0xFF073D9F).copy(alpha = 0.18f), Offset(42f, 151f), Size(105f, 14f))
            rotate(-9f + phase * 3f, Offset(90f, 90f)) {
                val lift = phase * 8f
                drawRoundRect(Color(0xFF81C6FF), Offset(45f, 37f - lift), Size(96f, 119f), CornerRadius(16f))
                drawRoundRect(Color.White, Offset(35f, 25f - lift), Size(96f, 119f), CornerRadius(16f))
                drawRoundRect(Color(0xFFE2EEFF), Offset(51f, 42f - lift), Size(42f, 7f), CornerRadius(3.5f))
                drawRoundRect(Color(0xFFEEF3FA), Offset(51f, 57f - lift), Size(63f, 5f), CornerRadius(2.5f))
                listOf(23f, 37f, 53f).forEachIndexed { index, height ->
                    drawRoundRect(listOf(Color(0xFFB7D6FF), Color(0xFF70B3FF), Color(0xFF2F7EF1))[index],
                        Offset(52f + index * 21f, 124f - height - lift), Size(14f, height), CornerRadius(5f))
                }
            }
            val badge = Offset(133f, 112f + phase * 5f)
            drawCircle(Color(0xFFFFD578), 23f, badge)
            drawLine(Color(0xFF73500B), badge + Offset(-9f, 0f), badge + Offset(-2f, 7f), 4f, StrokeCap.Round)
            drawLine(Color(0xFF73500B), badge + Offset(-2f, 7f), badge + Offset(10f, -7f), 4f, StrokeCap.Round)
            val star = Offset(144f, 35f - phase * 8f)
            drawLine(Color(0xFFB5FFF1), star + Offset(-9f, 0f), star + Offset(9f, 0f), 3f, StrokeCap.Round)
            drawLine(Color(0xFFB5FFF1), star + Offset(0f, -9f), star + Offset(0f, 9f), 3f, StrokeCap.Round)
            drawCircle(Color(0xFFFFD578), 4f, Offset(20f, 100f + phase * 10f))
            drawCircle(Color.White.copy(alpha = 0.7f), 3f, Offset(121f, 15f))
        }
    }
}
