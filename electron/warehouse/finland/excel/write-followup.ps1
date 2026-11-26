param(
  [Parameter(Mandatory)] [string]$Url,
  [Parameter(Mandatory)] [string]$Sheet,
  [Parameter(Mandatory)] [string]$Table,
  [Parameter(Mandatory)] [string]$In,
  [Parameter(Mandatory)] [string]$Out
)
# Writes follow-up cells (H, I, J, L, M). Each write names its row, delivery and T&T; a row that
# no longer holds that parcel is skipped as "moved". Only the listed cells are touched.
. (Join-Path $PSScriptRoot 'common.ps1')

$h = Open-Workbook $Url $Out
if ($h.wb.ReadOnly) { Fail $Out 'read-only' }
$lo = Get-Table $h $Sheet $Table $Out
$filterRemoved = Clear-Filters $lo.Parent $lo
$cols = Get-Columns $h $lo (@('Delivery Nr', 'T&T', 'Date picked up') + @($FollowUpColumns.Values)) $Out
$wanted = @((Get-Content -LiteralPath $In -Raw -Encoding UTF8 | ConvertFrom-Json) | ForEach-Object { $_ })
$headerRow = $lo.HeaderRowRange.Row

$written = New-Object System.Collections.Generic.List[object]
$moved = New-Object System.Collections.Generic.List[int]
$conflicted = New-Object System.Collections.Generic.List[int]
try {
  foreach ($w in $wanted) {
    $index = [int]$w.row - $headerRow
    if ($index -lt 1 -or $index -gt $lo.ListRows.Count) { $moved.Add([int]$w.row); continue }
    $range = $lo.ListRows.Item($index).Range
    $delivery = Delivery-Text $range.Cells.Item(1, $cols['Delivery Nr']).Value2
    $keys = @(Tracking-Keys $delivery $range.Cells.Item(1, $cols['T&T']).Value2)
    $tracking = ([string]$w.tracking).ToUpperInvariant()
    if ($tracking.StartsWith('JJD')) { $tracking = $tracking.Substring(1) }
    if ($delivery -ne [string]$w.delivery -or -not ($keys -contains "$delivery|$tracking")) { $moved.Add([int]$w.row); continue }

    # Each cell must still hold what the app read; otherwise someone changed it and the parcel is left alone.
    $changed = $false
    if ($null -ne $w.expect) {
      foreach ($p in $w.expect.PSObject.Properties) {
        if (-not $FollowUpColumns.Contains($p.Name)) { continue }
        $now = Cell-Text $range.Cells.Item(1, $cols[$FollowUpColumns[$p.Name]]).Value2 ($FollowUpDates -contains $p.Name)
        if ($now -ne ([string]$p.Value).Trim()) { $changed = $true }
      }
    }
    if ($changed) { $conflicted.Add([int]$w.row); continue }

    $fields = @()
    foreach ($f in $FollowUpColumns.Keys) {
      if (-not ($w.cells.PSObject.Properties.Name -contains $f)) { continue }
      $cell = $range.Cells.Item(1, $cols[$FollowUpColumns[$f]])
      $value = [string]$w.cells.$f
      if ([string]::IsNullOrWhiteSpace($value)) {
        [void]$cell.ClearContents()
      } elseif ($FollowUpDates -contains $f) {
        $oaDate = [double]([datetime]::ParseExact($value, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture).ToOADate())
        Set-Cell $cell 'Value2' $oaDate
        # Same date format as Date picked up in the row (Danish Excel reads format codes in Danish).
        Set-Cell $cell 'NumberFormatLocal' ([string]$range.Cells.Item(1, $cols['Date picked up']).NumberFormatLocal)
      } else {
        # The leading apostrophe stores the text as typed; without it Excel turns "2-3" into a date and "=x" into a formula.
        Set-Cell $cell 'Value2' ("'" + $value)
      }
      $fields += $f
    }
    $written.Add([ordered]@{ row = [int]$w.row; fields = $fields })
  }
} catch {
  Fail $Out 'followup-failed' ("linje " + $_.InvocationInfo.ScriptLineNumber + ": " + $_.Exception.Message)
}
if ($written.Count -gt 0) {
  try { $h.wb.Save() } catch { Fail $Out 'save-failed' $_.Exception.Message }
}
Write-Result @{ ok = $true; written = $written.ToArray(); moved = $moved.ToArray(); conflicted = $conflicted.ToArray(); filterRemoved = $filterRemoved } $Out
