param(
  [Parameter(Mandatory = $true)]
  [string]$AudioPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$recognizerInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
  Where-Object { $_.Culture.Name -eq 'en-US' } |
  Select-Object -First 1

if ($null -eq $recognizerInfo) {
  throw 'The English (United States) offline speech recognizer is not installed.'
}

$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizerInfo)
try {
  $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $recognizer.SetInputToWaveFile($AudioPath)
  $result = $recognizer.Recognize([TimeSpan]::FromSeconds(30))
  if ($null -ne $result) {
    Write-Output $result.Text
  }
}
finally {
  $recognizer.Dispose()
}
