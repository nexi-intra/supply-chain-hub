param(
  [Parameter(Mandatory)] [string]$Url,
  [Parameter(Mandatory)] [string]$Sheet,
  [Parameter(Mandatory)] [string]$Table,
  [Parameter(Mandatory)] [string]$In,
  [Parameter(Mandatory)] [string]$Out,
  # 0 = at the bottom. Otherwise the sheet row the new rows go after (the header row means the top).
  [int]$AfterRow = 0,
  [string]$AfterDelivery = ''
)
. (Join-Path $PSScriptRoot 'common.ps1')

$h = Open-Workbook $Url $Out
if ($h.wb.ReadOnly) { Fail $Out 'read-only' }
$lo = Get-Table $h $Sheet $Table $Out
$filterRemoved = Clear-Filters $lo.Parent $lo
$names = @('Delivery Nr', 'Order type', 'Postal code', 'Courier', 'T&T', 'Date picked up')
$cols = Get-Columns $h $lo $names $Out
# B..G are written in one assignment per row, so a row is never left half-written.
for ($i = 1; $i -lt $names.Count; $i++) {
  if ($cols[$names[$i]] -ne $cols[$names[0]] + $i) { Fail $Out 'table-changed' ($names[$i] + ' (ikke i raekkefoelge)') }
}
$weekCol = $null
foreach ($c in $lo.ListColumns) { if (([string]$c.Name).Trim() -eq 'Week nr') { $weekCol = $c.Index } }

$wanted = @((Get-Content -LiteralPath $In -Raw -Encoding UTF8 | ConvertFrom-Json) | ForEach-Object { $_ })
$keys = Table-Keys $lo $cols
$toWrite = New-Object System.Collections.Generic.List[object]
$skipped = 0
foreach ($r in $wanted) {
  $k = @(Tracking-Keys (Delivery-Text ([string]$r.delivery)) $r.tracking)
  if ($k.Count -eq 0 -or $keys.Contains($k[0])) { $skipped++; continue }
  [void]$keys.Add($k[0])
  $toWrite.Add($r)
}

# The place was worked out from a read moments ago; if the row there has changed, nothing is written.
$insertAt = 0
if ($AfterRow -gt 0) {
  $headerRow = $lo.HeaderRowRange.Row
  $index = $AfterRow - $headerRow
  if ($index -lt 0 -or $index -gt $lo.ListRows.Count) { Fail $Out 'sheet-moved' "raekke $AfterRow" }
  if ($index -gt 0) {
    $actual = Delivery-Text $lo.ListRows.Item($index).Range.Cells.Item(1, $cols['Delivery Nr']).Value2
    if ($actual -ne $AfterDelivery) { Fail $Out 'sheet-moved' "raekke $AfterRow har $actual, ventede $AfterDelivery" }
  }
  $insertAt = $index + 1
}

# Empty rows at the bottom of the table (only formulas, e.g. Week nr) are filled before new rows are added.
$free = New-Object System.Collections.Generic.List[object]
$count = $lo.ListRows.Count
for ($i = $count; $i -ge 1; $i--) {
  $range = $lo.ListRows.Item($i).Range
  $empty = $true
  foreach ($cell in $range.Cells) {
    if (-not $cell.HasFormula -and -not [string]::IsNullOrWhiteSpace([string]$cell.Value2)) { $empty = $false; break }
  }
  if (-not $empty) { break }
  $free.Insert(0, $range)
}

$written = New-Object System.Collections.Generic.List[int]
$weekOk = $true
$screen = $h.xl.ScreenUpdating
$h.xl.ScreenUpdating = $false
try {
  foreach ($r in $toWrite) {
    # Everything is worked out before a row is added, so a bad value never leaves an empty row behind.
    # Text gets a leading apostrophe so Excel keeps it as typed ("1-2" would otherwise become a date).
    if ($r.postalCode -is [string]) { $postal = "'" + [string]$r.postalCode } else { $postal = [double]$r.postalCode }
    $oaDate = [double]([datetime]::ParseExact([string]$r.pickedUp, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture).ToOADate())
    $values = New-Object 'object[,]' 1, 6
    $values[0, 0] = [double]$r.delivery
    $values[0, 1] = $(if ([string]$r.orderType) { "'" + [string]$r.orderType } else { '' })
    $values[0, 2] = $postal
    $values[0, 3] = [string]$r.courier
    $values[0, 4] = [string]$r.tracking
    $values[0, 5] = $oaDate
    if ($insertAt -gt 0) { $range = $lo.ListRows.Add($insertAt + $written.Count).Range }
    elseif ($free.Count -gt 0) { $range = $free[0]; $free.RemoveAt(0) }
    else { $range = $lo.ListRows.Add().Range }
    Set-Cell $range.Cells.Item(1, $cols['T&T']) 'NumberFormat' '@'
    # A 2D array goes through PowerShell's own setter; InvokeMember gives 0x800A03EC for arrays.
    $block = $range.Cells.Item(1, $cols['Delivery Nr']).Resize(1, 6)
    $block.Value2 = $values
    $d = $range.Cells.Item(1, $cols['Date picked up'])
    # NumberFormat is read localized but written in English codes in Danish Excel (the Danish year code
    # becomes "aaaa", a weekday), so the local format of the row above is copied instead.
    if ($range.Row -gt $lo.HeaderRowRange.Row + 1) { Set-Cell $d 'NumberFormatLocal' ([string]$d.Offset(-1, 0).NumberFormatLocal) }
    if ($null -ne $weekCol -and -not $range.Cells.Item(1, $weekCol).HasFormula) { $weekOk = $false }
    $written.Add($range.Row)
  }
} catch {
  $h.xl.ScreenUpdating = $screen
  Fail $Out 'write-failed' ("linje " + $_.InvocationInfo.ScriptLineNumber + ", efter " + $written.Count + " raekker: " + $_.Exception.Message)
}
$h.xl.ScreenUpdating = $screen

if ($written.Count -gt 0) {
  try { $h.wb.Save() } catch { Fail $Out 'save-failed' $_.Exception.Message }
}
$first = $null; $last = $null
if ($written.Count -gt 0) { $first = $written[0]; $last = $written[$written.Count - 1] }
Write-Result @{ ok = $true; added = $written.Count; skipped = $skipped; firstRow = $first; lastRow = $last; weekFormulaOk = $weekOk; filterRemoved = $filterRemoved } $Out
