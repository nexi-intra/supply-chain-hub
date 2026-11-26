# Shared helpers for read-table.ps1 and append-rows.ps1 (dot-sourced).
$ErrorActionPreference = 'Stop'

function Write-Result($obj, $Out) {
  ConvertTo-Json -InputObject $obj -Depth 6 -Compress | Set-Content -LiteralPath $Out -Encoding UTF8
}

function Fail($Out, $code, $detail = '') {
  Write-Result @{ ok = $false; error = $code; detail = $detail } $Out
  exit 0
}

function Same-Path($a, $b) {
  return [uri]::UnescapeDataString([string]$a).Trim().ToLowerInvariant() -eq [uri]::UnescapeDataString([string]$b).Trim().ToLowerInvariant()
}

# Uses the workbook if it is already open in Excel; otherwise opens it there and leaves it open,
# so the next read is fast and the rows can be seen.
function Open-Workbook($Url, $Out) {
  $xl = $null
  try { $xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application') } catch { $xl = $null }
  if ($null -eq $xl) {
    try { $xl = New-Object -ComObject Excel.Application } catch { Fail $Out 'excel-missing' $_.Exception.Message }
    # A visible Excel under user control stays open when this script ends.
    $xl.Visible = $true
    $xl.UserControl = $true
  }
  foreach ($wb in $xl.Workbooks) {
    if (Same-Path $wb.FullName $Url) { return @{ xl = $xl; wb = $wb; opened = $false } }
  }
  try { $wb = $xl.Workbooks.Open($Url) } catch { Fail $Out 'open-failed' $_.Exception.Message }
  return @{ xl = $xl; wb = $wb; opened = $true }
}

# Shows all rows: a filter on the table or the sheet would hide parcels from both reading and writing.
function Clear-Filters($ws, $lo) {
  $removed = $false
  if ($null -ne $lo.AutoFilter -and $lo.AutoFilter.FilterMode) { $lo.AutoFilter.ShowAllData(); $removed = $true }
  if ($ws.FilterMode) { $ws.ShowAllData(); $removed = $true }
  return $removed
}

function Get-Table($h, $Sheet, $Table, $Out) {
  $ws = $null
  try { $ws = $h.wb.Worksheets.Item($Sheet) } catch { Fail $Out 'sheet-missing' $Sheet }
  try { return $ws.ListObjects.Item($Table) } catch { Fail $Out 'table-missing' $Table }
}

function Get-Columns($h, $lo, $names, $Out) {
  $cols = @{}
  foreach ($n in $names) {
    $found = $null
    foreach ($c in $lo.ListColumns) { if (([string]$c.Name).Trim() -eq $n) { $found = $c.Index } }
    if ($null -eq $found) { Fail $Out 'table-changed' $n }
    $cols[$n] = $found
  }
  return $cols
}

# Sets a COM property without PowerShell's dynamic binder, which in 5.1 can reuse a cached
# string setter for a later number ("Unable to cast System.Double to System.String").
function Set-Cell($cell, $property, $value) {
  $invokeArgs = New-Object 'object[]' 1
  $invokeArgs[0] = $value
  [void]$cell.GetType().InvokeMember($property, [Reflection.BindingFlags]::SetProperty, $null, $cell, $invokeArgs)
}

# The follow-up fields and their headers in the sheet (columns H, I, J, L and M).
$FollowUpColumns = [ordered]@{
  expected = 'Date transportation expected delivery date'
  received = 'Date Recived/Attempt'
  sla      = 'Transport SLA OK/NOK'
  comment  = 'Comment'
  terminal = 'PN, terminal'
}
$FollowUpDates = @('expected', 'received')

# A cell value as text: Excel dates (numbers) as yyyy-MM-dd, everything else trimmed.
function Cell-Text($v, [bool]$isDate) {
  if ($null -eq $v) { return '' }
  if ($isDate -and $v -is [double]) { return [DateTime]::FromOADate($v).ToString('yyyy-MM-dd') }
  if ($v -is [double]) { return ([int64]$v).ToString() }
  return ([string]$v).Trim()
}

function Delivery-Text($v) {
  if ($null -eq $v) { return '' }
  if ($v -is [double]) { return ([int64]$v).ToString() }
  return ([string]$v).Trim().TrimStart('0')
}

function Tracking-Keys($delivery, $text) {
  $keys = @()
  if (-not $delivery) { return $keys }
  foreach ($m in [regex]::Matches([string]$text, '(?i)J?J?D\d{18}|\d{20}')) {
    $t = $m.Value.ToUpperInvariant()
    if ($t.StartsWith('JJD')) { $t = $t.Substring(1) }
    $keys += "$delivery|$t"
  }
  return $keys
}

# The table body as Excel's 1-based 2D array, read in one call (or $null when the table has no rows).
function Body-Values($lo) {
  if ($null -eq $lo.DataBodyRange) { return $null }
  return ,$lo.DataBodyRange.Value2
}

# All parcel keys in the table, read fresh.
function Table-Keys($lo, $cols) {
  $keys = New-Object 'System.Collections.Generic.HashSet[string]'
  $v = Body-Values $lo
  if ($null -eq $v) { return ,$keys }
  for ($r = 1; $r -le $v.GetLength(0); $r++) {
    foreach ($k in (Tracking-Keys (Delivery-Text $v[$r, $cols['Delivery Nr']]) $v[$r, $cols['T&T']])) { [void]$keys.Add($k) }
  }
  return ,$keys
}
