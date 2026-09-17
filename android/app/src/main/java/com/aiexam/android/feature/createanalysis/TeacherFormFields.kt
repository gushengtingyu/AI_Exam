package com.aiexam.android.feature.createanalysis

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aiexam.android.ui.components.LearningTextField
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@Composable
internal fun ProfileChoiceField(value: String, onValueChange: (String) -> Unit, label: String, options: List<String>, enabled: Boolean, modifier: Modifier = Modifier, error: String? = null) {
    var choosing by remember { mutableStateOf(false) }
    Column(modifier) {
        LearningTextField(value = value, onValueChange = onValueChange, label = label, enabled = enabled, modifier = Modifier.fillMaxWidth(), error = error)
        AssistChip(onClick = { choosing = true }, enabled = enabled, label = { Text("选择$label") })
    }
    if (choosing) AlertDialog(
        onDismissRequest = { choosing = false },
        title = { Text("选择$label") },
        text = { LazyColumn { items(options) { option -> TextButton(onClick = { onValueChange(option); choosing = false }, modifier = Modifier.fillMaxWidth()) { Text(option) } } } },
        confirmButton = { TextButton(onClick = { choosing = false }) { Text("取消") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ExamDateField(value: String, enabled: Boolean, modifier: Modifier, onChange: (String) -> Unit) {
    var choosing by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { choosing = true }, enabled = enabled, modifier = modifier.heightIn(min = 64.dp), shape = RoundedCornerShape(16.dp)) {
        Column { Text("考试日期", style = MaterialTheme.typography.labelSmall); Text(value, style = MaterialTheme.typography.bodyMedium) }
    }
    if (choosing) {
        val initialDate = remember(value) { runCatching { LocalDate.parse(value) }.getOrDefault(LocalDate.now()) }
        val picker = rememberDatePickerState(initialSelectedDateMillis = initialDate.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        DatePickerDialog(onDismissRequest = { choosing = false }, confirmButton = {
            TextButton(onClick = { picker.selectedDateMillis?.let { onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) }; choosing = false }) { Text("确定") }
        }, dismissButton = { TextButton(onClick = { choosing = false }) { Text("取消") } }) { DatePicker(state = picker) }
    }
}
