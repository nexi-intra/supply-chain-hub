param(
  [Parameter(Mandatory)] [string]$Url,
  [Parameter(Mandatory)] [string]$Sheet,
  [Parameter(Mandatory)] [string]$Table,
  [Parameter(Mandatory)] [int]$Row,
  [Parameter(Mandatory)] [string]$Delivery,
  [Parameter(Mandatory)] [string]$Tracking,
  [Parameter(Mandatory)] [string]$Out
)
# Deletes the table row of a parcel that was never sent, and only that row.
. (Join-Path $PSScriptRoot 'common.ps1')

$h = Open-Workbook $Url $Out
if ($h.wb.ReadOnly) { Fail $Out 'read-only' }
$lo = Get-Table $h $Sheet $Table $Out
$filterRemoved = Clear-Filters $lo.Parent $lo
$cols = Get-Columns $h $lo @('Delivery Nr', 'T&T') $Out

$key = "$Delivery|$Tracking"
$v = Body-Values $lo
if ($null -eq $v) { Fail $Out 'sheet-moved' 'tabellen er tom' }
$found = @()
for ($r = 1; $r -le $v.GetLength(0); $r++) {
  $keys = @(Tracking-Keys (Delivery-Text $v[$r, $cols['Delivery Nr']]) $v[$r, $cols['T&T']])
  if ($keys -contains $key) { $found += , @($r, $keys.Count) }
}
if ($found.Count -eq 0) { Fail $Out 'sheet-moved' 'kolliet findes ikke i arket' }
if ($found.Count -gt 1) { Fail $Out 'row-not-unique' "$($found.Count) raekker" }
$index = $found[0][0]
$sheetRow = $lo.HeaderRowRange.Row + $index
# The row must be the one the user saw and approved.
if ($sheetRow -ne $Row) { Fail $Out 'sheet-moved' "kolliet staar nu i raekke $sheetRow" }
# A T&T cell with more parcels than this one would take the others with it.
if ($found[0][1] -ne 1) { Fail $Out 'row-shared' "raekke $sheetRow" }

try {
  $lo.ListRows.Item($index).Delete() | Out-Null
} catch {
  Fail $Out 'delete-failed' "raekke ${sheetRow}: $($_.Exception.Message)"
}
try { $h.wb.Save() } catch { Fail $Out 'save-failed' $_.Exception.Message }
Write-Result @{ ok = $true; row = $sheetRow; filterRemoved = $filterRemoved } $Out
