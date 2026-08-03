$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Get-Process excel -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 1
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\user\Desktop\mza (1).xlsm')
$out = 'C:\Users\user\Desktop\mza-app\scripts\excel_preview.json'
$map = @{}
foreach ($s in @($wb.Sheets)) { $map[$s.CodeName] = $s }

function Dump($code, $cols, $maxRows) {
  $ws = $map[$code]
  if ($null -eq $ws) { return @{ missing = $true } }
  $rows = @()
  for ($r = 1; $r -le $maxRows; $r++) {
    $obj = [ordered]@{ _r = $r }
    $empty = $true
    for ($c = 1; $c -le $cols; $c++) {
      $v = $ws.Cells.Item($r, $c).Text
      if ($v) { $empty = $false }
      $obj["c$c"] = $v
    }
    if (-not $empty) { $rows += [pscustomobject]$obj }
  }
  return $rows
}

$result = [ordered]@{
  wsIng = Dump 'wsIng' 5 8
  wsProd = Dump 'wsProd' 4 6
  wsRes = Dump 'wsRes' 4 6
  wsPur = Dump 'wsPur' 8 6
  wsRun = Dump 'wsRun' 5 6
  wsSale = Dump 'wsSale' 8 6
  wsWO = Dump 'wsWO' 7 6
  wsEmp = Dump 'wsEmp' 6 6
  wsPay = Dump 'wsPay' 5 6
  wsOH = Dump 'wsOH' 6 10
  wsRec = Dump 'wsRec' 8 6
}
[IO.File]::WriteAllText($out, ($result | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
$wb.Close($false)
$excel.Quit()
[GC]::Collect(); [GC]::WaitForPendingFinalizers()
Write-Output "Wrote $out"
