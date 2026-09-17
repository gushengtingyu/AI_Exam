param(
  [string]$EnvPath = ".env",
  [switch]$ReuseExisting
)

$ErrorActionPreference = "Stop"

function ConvertFrom-SecureValue {
  param([Security.SecureString]$Value)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Set-EnvValue {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Name,
    [string]$Value
  )

  $replacement = '{0}="{1}"' -f $Name, $Value.Replace('"', '\"')
  for ($index = 0; $index -lt $Lines.Count; $index += 1) {
    if ($Lines[$index] -match ('^\s*' + [Regex]::Escape($Name) + '\s*=')) {
      $Lines[$index] = $replacement
      return
    }
  }
  $Lines.Add($replacement)
}

function Get-EnvValue {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Name
  )

  foreach ($line in $Lines) {
    if ($line -match ('^\s*' + [Regex]::Escape($Name) + '\s*=\s*(.*)\s*$')) {
      return $matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ""
}

$resolvedPath = [IO.Path]::GetFullPath((Join-Path (Get-Location) $EnvPath))
$lines = [System.Collections.Generic.List[string]]::new()
if ([IO.File]::Exists($resolvedPath)) {
  $lines.AddRange([string[]][IO.File]::ReadAllLines($resolvedPath))
}

$ocrSecret = $null
$textSecret = $null
if ($ReuseExisting) {
  $ocrKey = Get-EnvValue $lines "OCR_API_KEY"
  if ([string]::IsNullOrWhiteSpace($ocrKey)) {
    $ocrKey = Get-EnvValue $lines "VISION_API_KEY"
  }
  $textKey = Get-EnvValue $lines "TEXT_API_KEY"
}
else {
  $ocrSecret = Read-Host "Paste Alibaba OCR API key (hidden)" -AsSecureString
  $textSecret = Read-Host "Paste DeepSeek API key (hidden)" -AsSecureString
  $ocrKey = ConvertFrom-SecureValue $ocrSecret
  $textKey = ConvertFrom-SecureValue $textSecret
}

try {
  if ($ocrKey -notmatch '^sk-ws-' -or $ocrKey.Length -lt 20) {
    throw "Invalid Alibaba OCR API key. Configuration was not changed."
  }
  if ($textKey -notmatch '^sk-' -or $textKey.Length -lt 20) {
    throw "Invalid DeepSeek API key. Configuration was not changed."
  }

  Set-EnvValue $lines "MOCK_MODE" "false"
  Set-EnvValue $lines "OCR_API_KEY" $ocrKey
  Set-EnvValue $lines "OCR_BASE_URL" "https://dashscope.aliyuncs.com/compatible-mode/v1"
  Set-EnvValue $lines "OCR_MODEL" "qwen3.5-ocr"
  Set-EnvValue $lines "VISION_API_KEY" $textKey
  Set-EnvValue $lines "VISION_BASE_URL" "https://api.deepseek.com"
  Set-EnvValue $lines "VISION_MODEL" "deepseek-flash"
  Set-EnvValue $lines "TEXT_API_KEY" $textKey
  Set-EnvValue $lines "TEXT_BASE_URL" "https://api.deepseek.com"
  Set-EnvValue $lines "TEXT_MODEL" "deepseek-flash"
  Set-EnvValue $lines "AI_NODE_MAX_ATTEMPTS" "2"
  Set-EnvValue $lines "AI_PAGE_CONCURRENCY" "2"
  Set-EnvValue $lines "IMAGE_PREPROCESS_CONCURRENCY" "2"
  Set-EnvValue $lines "AI_EXTRACTION_PAGE_BATCH_SIZE" "2"
  Set-EnvValue $lines "AI_EVALUATION_VISUAL_BATCH_SIZE" "8"
  Set-EnvValue $lines "TEACHER_MARK_RED_PIXEL_RATIO" "0.0002"
  Set-EnvValue $lines "AI_TEXT_CONCURRENCY" "2"
  Set-EnvValue $lines "AI_QUESTION_CHUNK_SIZE" "30"
  Set-EnvValue $lines "AI_JOB_HEARTBEAT_MS" "30000"
  Set-EnvValue $lines "JOB_STALE_AFTER_MS" "600000"
  Set-EnvValue $lines "AI_REQUEST_TIMEOUT_MS" "90000"
  Set-EnvValue $lines "OCR_REQUEST_TIMEOUT_MS" "90000"

  $temporaryPath = $resolvedPath + ".tmp"
  [IO.File]::WriteAllLines($temporaryPath, $lines, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporaryPath -Destination $resolvedPath -Force
  Write-Host "Configuration complete. Real API mode is enabled."
}
finally {
  $ocrKey = $null
  $textKey = $null
  if ($null -ne $ocrSecret) { $ocrSecret.Dispose() }
  if ($null -ne $textSecret) { $textSecret.Dispose() }
}
