package com.aiexam.android.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

/** Filled fields use explicit foreground colors, including on translucent dark cards. */
@Composable
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
fun LearningTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    icon: ImageVector? = null,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    error: String? = null,
) {
    val bringIntoView = remember { BringIntoViewRequester() }
    LaunchedEffect(error) { if (error != null) bringIntoView.bringIntoView() }
    val colors = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val outline by animateColorAsState(if (focused) colors.primary.copy(alpha = 0.6f) else Color.Transparent, label = "field-focus")
    val fill by animateColorAsState(if (focused) colors.primaryContainer.copy(alpha = 0.45f) else colors.surfaceContainer, label = "field-fill")
    val shape = RoundedCornerShape(16.dp)
    TextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = placeholder?.let { hint -> { Text(hint) } },
        leadingIcon = icon?.let { image -> { Icon(image, null, Modifier.size(21.dp)) } },
        modifier = modifier.bringIntoViewRequester(bringIntoView).border(1.dp, if (error != null) colors.error else outline, shape),
        isError = error != null,
        supportingText = error?.let { message -> { Text(message) } },
        enabled = enabled,
        singleLine = singleLine,
        shape = shape,
        interactionSource = interaction,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = ImeAction.Next),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = fill,
            unfocusedContainerColor = fill,
            disabledContainerColor = colors.surfaceContainer,
            focusedTextColor = colors.onSurface,
            unfocusedTextColor = colors.onSurface,
            disabledTextColor = colors.onSurfaceVariant,
            focusedLabelColor = colors.primary,
            unfocusedLabelColor = colors.onSurfaceVariant,
            disabledLabelColor = colors.onSurfaceVariant,
            focusedPlaceholderColor = colors.onSurfaceVariant,
            unfocusedPlaceholderColor = colors.onSurfaceVariant,
            focusedLeadingIconColor = colors.primary,
            unfocusedLeadingIconColor = colors.onSurfaceVariant,
            disabledLeadingIconColor = colors.onSurfaceVariant,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent,
            cursorColor = colors.primary,
        ),
    )
}
