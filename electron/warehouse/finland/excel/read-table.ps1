param(
  [Parameter(Mandatory)] [string]$Url,
  [Parameter(Mandatory)] [string]$Sheet,
  [Parameter(Mandatory)] [string]$Table,
  [Parameter(Mandatory)] [string]$Out
)
. (Join-Path $PSScriptRoot 'common.ps1')

$h = Open-Workbook $Url $Out
$lo = Get-Table $h $Sheet $Table $Out
$filterRemoved = Clear-Filters $lo.Parent $lo
$cols = Get-Columns $h $lo (@('Delivery Nr', 'Order type', 'Postal code', 'Courier', 'T&T', 'Date picked up') + @($FollowUpColumns.Values)) $Out
$rows = New-Object System.Collections.Generic.List[object]
$v = Body-Values $lo
if ($null -ne $v) {
  $firstRow = $lo.DataBodyRange.Row
  for ($r = 1; $r -le $v.GetLength(0); $r++) {
    $tt = $v[$r, $cols['T&T']]
    $followUp = [ordered]@{}
    foreach ($f in $FollowUpColumns.Keys) { $followUp[$f] = Cell-Text $v[$r, $cols[$FollowUpColumns[$f]]] ($FollowUpDates -contains $f) }
    $rows.Add([ordered]@{
      row = $firstRow + $r - 1
      delivery = (Delivery-Text $v[$r, $cols['Delivery Nr']])
      trackingText = $(if ($null -eq $tt) { '' } else { [string]$tt })
      pickedUp = $(if ($v[$r, $cols['Date picked up']] -is [double]) { Cell-Text $v[$r, $cols['Date picked up']] $true } else { '' })
      orderType = (Cell-Text $v[$r, $cols['Order type']] $false)
      postalCode = (Cell-Text $v[$r, $cols['Postal code']] $false)
      courier = (Cell-Text $v[$r, $cols['Courier']] $false)
      followUp = $followUp
    })
  }
}
$name = $h.wb.FullName
Write-Result @{ ok = $true; workbook = $name; wasOpen = (-not $h.opened); filterRemoved = $filterRemoved; rows = $rows.ToArray() } $Out
