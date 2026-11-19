param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [Parameter(Mandatory = $true)][string]$PdfPath
)

$ErrorActionPreference = 'Stop'
$word = $null
$documents = $null
$document = $null
$options = $null
$wordProcessId = 0
$ownsWordProcess = $false
$exitCode = 0
$existingWordPids = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })

try {
  $word = New-Object -ComObject Word.Application
  $newWordProcesses = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $existingWordPids })
  if ($newWordProcesses.Count -eq 1) { $wordProcessId = $newWordProcesses[0].Id }
  $ownsWordProcess = $newWordProcesses.Count -eq 1
  if (-not $ownsWordProcess) { throw 'WORD_PDF_BUSY' }
  if ($ownsWordProcess) { [Console]::Out.WriteLine("WORD_PROCESS=$wordProcessId") }

  # The temporary DOCX is opened read-only; never update links or run macros.
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $options = $word.Options
  $options.UpdateLinksAtOpen = $false
  $documents = $word.Documents
  $document = $documents.Open($SourcePath, $false, $true, $false)
  $document.ExportAsFixedFormat($PdfPath, 17)
  if (-not (Test-Path -LiteralPath $PdfPath -PathType Leaf)) {
    throw 'Word did not create a PDF file'
  }
} catch {
  $exitCode = if ($null -eq $word) { 41 } elseif ($_.Exception.Message -eq 'WORD_PDF_BUSY') { 43 } else { 42 }
  [Console]::Error.WriteLine($(if ($exitCode -eq 41) { 'WORD_PDF_UNAVAILABLE' } else { $_.Exception.Message }))
} finally {
  if ($null -ne $document) {
    try { $document.Close(0) } catch { }
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
  }
  if ($null -ne $documents) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($documents) }
  if ($null -ne $options) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($options) }
  if ($null -ne $word -and $ownsWordProcess) {
    try { $word.Quit(0) } catch { }
  }
  if ($null -ne $word) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
  if ($ownsWordProcess) {
    try {
      $wordProcess = Get-Process -Id $wordProcessId -ErrorAction Stop
      if (-not $wordProcess.WaitForExit(2000)) { Stop-Process -Id $wordProcessId -Force -ErrorAction Stop }
    } catch { }
  }
}

exit $exitCode
