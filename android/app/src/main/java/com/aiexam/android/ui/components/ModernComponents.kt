package com.aiexam.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** A soft, branded canvas that keeps content readable while adding depth. */
@Composable
fun AppBackground(content: @Composable BoxScope.() -> Unit) {
    CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = 54.dp, y = (-108).dp)
                .size(250.dp)
                .background(
                    Brush.radialGradient(
                        listOf(
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                            Color.Transparent,
                        ),
                    ),
                    CircleShape,
                ),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .offset(x = (-90).dp, y = 100.dp)
                .size(270.dp)
                .background(
                    Brush.radialGradient(
                        listOf(
                            MaterialTheme.colorScheme.secondary.copy(alpha = 0.12f),
                            Color.Transparent,
                        ),
                    ),
                    CircleShape,
                ),
        )
        content()
    }
    }
}

@Composable
fun BrandMark(modifier: Modifier = Modifier, size: Dp = 40.dp) {
    Box(
        modifier = modifier
        .size(size * 0.9f)
            .background(
                LearningGradient,
                RoundedCornerShape(14.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.AutoStories,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(size * 0.52f),
        )
    }
}

@Composable
fun IconBadge(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.primaryContainer,
    contentColor: Color = MaterialTheme.colorScheme.onPrimaryContainer,
    size: Dp = 42.dp,
) {
    Box(
        modifier = modifier
            .size(size * 0.9f)
            .background(containerColor, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(21.dp))
    }
}

@Composable
fun StatusPill(
    text: String,
    color: Color = MaterialTheme.colorScheme.primary,
    icon: ImageVector? = null,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = color.copy(alpha = 0.12f),
        contentColor = color,
        shape = RoundedCornerShape(50),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            icon?.let { Icon(it, contentDescription = null, modifier = Modifier.size(14.dp)) }
            Text(text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun SectionHeader(
    eyebrow: String,
    title: String,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(4.dp)
                .height(20.dp)
                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(3.dp)),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        trailing?.invoke()
    }
}

@Composable
fun ScoreRing(
    progress: Float,
    value: String,
    modifier: Modifier = Modifier,
    size: Dp = 96.dp,
    color: Color = MaterialTheme.colorScheme.primary,
    trackColor: Color = color.copy(alpha = 0.18f),
    textColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }
    val animatedProgress by animateFloatAsState(
        if (entered) progress.coerceIn(0f, 1f) else 0f,
        animationSpec = tween(850), label = "score-reveal",
    )
    Box(modifier = modifier.size(size), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(
            progress = { animatedProgress },
            modifier = Modifier.fillMaxSize(),
            color = color,
            trackColor = trackColor,
            strokeWidth = 8.dp,
        )
        Text(value, color = textColor, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
    }
}
