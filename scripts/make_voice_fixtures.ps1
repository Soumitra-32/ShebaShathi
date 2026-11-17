# Generate a short synthetic speech sample for the local voice E2E test.
# Uses the Windows SAPI voice already installed on the machine. No network
# service is contacted and the text contains no personal data.
param(
  [string]$Output = ".tmp-test/fixtures/voice-en.wav"
)

Add-Type -AssemblyName System.Speech
$target = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Output))
$directory = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $directory | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.SelectVoice("Microsoft Zira Desktop")
  $synth.Rate = -1
  $synth.SetOutputToWaveFile($target)
  $synth.Speak("I paid an extra fee at the passport office. Please help me write a complaint about the delay.")
} finally {
  $synth.Dispose()
}

Write-Output "voice fixture written to $target"
