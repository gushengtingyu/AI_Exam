param(
  [string]$EnvPath = ".env",
  [string]$Model = "doubao-seed-2-1-turbo-260628",
  [switch]$FromClipboard
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

$resolvedPath = [IO.Path]::GetFullPath((Join-Path (Get-Location) $EnvPath))
$lines = [System.Collections.Generic.List[string]]::new()
if ([IO.File]::Exists($resolvedPath)) {
  $lines.AddRange([string[]][IO.File]::ReadAllLines($resolvedPath))
}

$secret = $null
if ($FromClipboard) {
  $apiKey = (Get-Clipboard -Raw).Trim()
}
else {
  $secret = Read-Host "Paste Volcengine Ark API key (hidden)" -AsSecureString
  $apiKey = ConvertFrom-SecureValue $secret
}
try {
  if ($apiKey -notmatch '^ark-' -or $apiKey.Length -lt 20) {
    throw "Invalid Volcengine Ark API key. Configuration was not changed."
  }

  Set-EnvValue $lines "VISION_PROVIDER" "doubao"
  Set-EnvValue $lines "DOUBAO_API_KEY" $apiKey
  Set-EnvValue $lines "DOUBAO_BASE_URL" "https://ark.cn-beijing.volces.com/api/v3"
  Set-EnvValue $lines "DOUBAO_VISION_MODEL" $Model

  $temporaryPath = $resolvedPath + ".tmp"
  [IO.File]::WriteAllLines($temporaryPath, $lines, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporaryPath -Destination $resolvedPath -Force
  Write-Host "Doubao vision provider configured. Restart the local service to apply it."
}
finally {
  $apiKey = $null
  if ($null -ne $secret) { $secret.Dispose() }
}
