param(
  [Parameter(Mandatory)] [string]$Url,
  [Parameter(Mandatory)] [string]$Sheet,
  [Parameter(Mandatory)] [string]$Table,
  [Parameter(Mandatory)] [int]$Row,
  [Parameter(Mandatory)] [string]$Delivery,
  [Parameter(Mandatory)] [string]$OldTracking,
  [Parameter(Mandatory)] [string]$NewTracking,
  [Parameter(Mandatory)] [string]$Courier,
  [Parameter(Mandatory)] [string]$Out
)
# Overwrites T&T and Courier in one row, and only if the row still has the delivery and the old number.
. (Join-Path $PSScriptRoot 'common.ps1')

$h = Open-Workbook $Url $Out
if ($h.wb.ReadOnly) { Fail $Out 'read-only' }
$lo = Get-Table $h $Sheet $Table $Out
$filterRemoved = Clear-Filters $lo.Parent $lo
$cols = Get-Columns $h $lo @('Delivery Nr', 'Courier', 'T&T') $Out

$index = $Row - $lo.HeaderRowRange.Row
if ($index -lt 1 -or $index -gt $lo.ListRows.Count) { Fail $Out 'sheet-moved' "raekke $Row" }
$range = $lo.ListRows.Item($index).Range
$actual = Delivery-Text $range.Cells.Item(1, $cols['Delivery Nr']).Value2
$keys = @(Tracking-Keys $actual $range.Cells.Item(1, $cols['T&T']).Value2)
# The cell must hold exactly the old number, so another parcel's number is never overwritten.
if ($actual -ne $Delivery -or $keys.Count -ne 1 -or $keys[0] -ne "$Delivery|$OldTracking") {
  Fail $Out 'sheet-moved' "raekke $Row har $actual"
}
# Courier and T&T sit next to each other and are written in one assignment, so they never disagree.
if ($cols['T&T'] -ne $cols['Courier'] + 1) { Fail $Out 'table-changed' 'Courier og T&T (ikke ved siden af hinanden)' }

try {
  Set-Cell $range.Cells.Item(1, $cols['T&T']) 'NumberFormat' '@'
  $values = New-Object 'object[,]' 1, 2
  $values[0, 0] = $Courier
  $values[0, 1] = $NewTracking
  $block = $range.Cells.Item(1, $cols['Courier']).Resize(1, 2)
  # A 2D array goes through PowerShell's own setter; InvokeMember gives 0x800A03EC for arrays.
  $block.Value2 = $values
} catch {
  Fail $Out 'fix-failed' "raekke ${Row}: $($_.Exception.Message)"
}
try { $h.wb.Save() } catch { Fail $Out 'save-failed' $_.Exception.Message }
Write-Result @{ ok = $true; row = $Row; filterRemoved = $filterRemoved } $Out
