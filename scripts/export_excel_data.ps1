$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Get-Process excel -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 1

$src = 'C:\Users\user\Desktop\mza (1).xlsm'
$outDir = 'C:\Users\user\Desktop\mza-app\scripts\export'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($src)
$map = @{}
foreach ($s in @($wb.Sheets)) { $map[$s.CodeName] = $s }

function SheetRows($code, $cols) {
  $ws = $map[$code]
  if ($null -eq $ws) { return @() }
  $last = 2
  try {
    $ur = $ws.UsedRange
    if ($null -ne $ur) { $last = [Math]::Max(2, $ur.Row + $ur.Rows.Count - 1) }
  } catch {}
  $rows = @()
  for ($r = 2; $r -le $last; $r++) {
    $vals = @()
    $any = $false
    for ($c = 1; $c -le $cols; $c++) {
      $v = $ws.Cells.Item($r, $c).Value2
      if ($null -ne $v -and "$v" -ne '') { $any = $true }
      if ($v -is [double] -and $v -gt 20000 -and $v -lt 60000) {
        # Excel serial date
        $vals += ([datetime]::FromOADate($v)).ToString('yyyy-MM-dd')
      } else {
        $vals += $(if ($null -eq $v) { $null } else { "$v" })
      }
    }
    if ($any) { $rows += ,$vals }
  }
  return $rows
}

function WriteJson($name, $obj) {
  $path = Join-Path $outDir "$name.json"
  if ($null -eq $obj) { $obj = @() }
  if ($obj -is [System.Array] -and $obj.Count -eq 0) {
    [IO.File]::WriteAllText($path, '[]', [Text.UTF8Encoding]::new($false))
    Write-Output "$name = 0"
    return
  }
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  if (-not $json) { $json = '[]' }
  [IO.File]::WriteAllText($path, $json, [Text.UTF8Encoding]::new($false))
  $count = if ($obj -is [System.Array]) { $obj.Count } else { 1 }
  Write-Output "$name = $count"
}

# Ingredients: A id, B name, C unit, D category
$ings = @()
foreach ($row in (SheetRows 'wsIng' 4)) {
  if (-not $row[0] -or -not $row[1]) { continue }
  $ings += @{ id = "$($row[0])".Trim(); name = "$($row[1])".Trim(); unit = "$($row[2])".Trim(); category = "$($row[3])".Trim() }
}
WriteJson 'ingredients' $ings

# Products: A id, B name, C unit
$prods = @()
foreach ($row in (SheetRows 'wsProd' 3)) {
  if (-not $row[0] -or -not $row[1]) { continue }
  $prods += @{ id = "$($row[0])".Trim(); name = "$($row[1])".Trim(); unit = "$($row[2])".Trim() }
}
WriteJson 'products' $prods

# Resale: A id, B name, C unit, D category (guess)
$res = @()
foreach ($row in (SheetRows 'wsRes' 4)) {
  if (-not $row[0] -or -not $row[1]) { continue }
  $res += @{ id = "$($row[0])".Trim(); name = "$($row[1])".Trim(); unit = "$($row[2])".Trim(); category = "$($row[3])".Trim() }
}
WriteJson 'resale' $res

# Purchases: dump headers first via row1
$purHdr = @()
$wsPur = $map['wsPur']
for ($c = 1; $c -le 10; $c++) { $purHdr += $wsPur.Cells.Item(1, $c).Text }
WriteJson 'purchases_headers' $purHdr

$purs = @()
foreach ($row in (SheetRows 'wsPur' 10)) {
  $purs += @{
    date = "$($row[0])".Trim()
    c2 = "$($row[1])".Trim()
    c3 = "$($row[2])".Trim()
    c4 = "$($row[3])".Trim()
    c5 = "$($row[4])".Trim()
    c6 = "$($row[5])".Trim()
    c7 = "$($row[6])".Trim()
    c8 = "$($row[7])".Trim()
    c9 = "$($row[8])".Trim()
    c10 = "$($row[9])".Trim()
  }
}
WriteJson 'purchases_raw' $purs

$runHdr = @(); $wsRun = $map['wsRun']; for ($c=1;$c -le 10;$c++){ $runHdr += $wsRun.Cells.Item(1,$c).Text }
WriteJson 'production_headers' $runHdr
$runs = @()
foreach ($row in (SheetRows 'wsRun' 9)) {
  $runs += @{ date="$($row[0])".Trim(); id="$($row[1])".Trim(); name="$($row[2])".Trim(); qty="$($row[3])".Trim(); unit="$($row[4])".Trim(); unitCost="$($row[5])".Trim() }
}
WriteJson 'production' $runs

$saleHdr=@(); $wsSale=$map['wsSale']; for($c=1;$c -le 10;$c++){ $saleHdr += $wsSale.Cells.Item(1,$c).Text }
WriteJson 'sales_headers' $saleHdr
$sales=@()
foreach ($row in (SheetRows 'wsSale' 8)) {
  $sales += @{ date="$($row[0])".Trim(); id="$($row[1])".Trim(); name="$($row[2])".Trim(); qty="$($row[3])".Trim(); c5="$($row[4])".Trim(); c6="$($row[5])".Trim(); c7="$($row[6])".Trim(); c8="$($row[7])".Trim() }
}
WriteJson 'sales' $sales

$woHdr=@(); $wsWO=$map['wsWO']; for($c=1;$c -le 8;$c++){ $woHdr += $wsWO.Cells.Item(1,$c).Text }
WriteJson 'writeoffs_headers' $woHdr
$wos=@()
foreach ($row in (SheetRows 'wsWO' 8)) {
  $wos += @{ date="$($row[0])".Trim(); c2="$($row[1])".Trim(); c3="$($row[2])".Trim(); c4="$($row[3])".Trim(); c5="$($row[4])".Trim(); c6="$($row[5])".Trim(); c7="$($row[6])".Trim(); c8="$($row[7])".Trim() }
}
WriteJson 'writeoffs' $wos

$empHdr=@(); $wsEmp=$map['wsEmp']; for($c=1;$c -le 8;$c++){ $empHdr += $wsEmp.Cells.Item(1,$c).Text }
WriteJson 'employees_headers' $empHdr
$emps=@()
foreach ($row in (SheetRows 'wsEmp' 6)) {
  $emps += @{ c1="$($row[0])".Trim(); c2="$($row[1])".Trim(); c3="$($row[2])".Trim(); c4="$($row[3])".Trim(); c5="$($row[4])".Trim(); c6="$($row[5])".Trim() }
}
WriteJson 'employees' $emps

$payHdr=@(); $wsPay=$map['wsPay']; for($c=1;$c -le 6;$c++){ $payHdr += $wsPay.Cells.Item(1,$c).Text }
WriteJson 'payroll_headers' $payHdr
$pays=@()
foreach ($row in (SheetRows 'wsPay' 5)) {
  $pays += @{ date="$($row[0])".Trim(); c2="$($row[1])".Trim(); c3="$($row[2])".Trim(); c4="$($row[3])".Trim(); c5="$($row[4])".Trim() }
}
WriteJson 'payroll' $pays

$ohHdr=@(); $wsOH=$map['wsOH']; for($c=1;$c -le 6;$c++){ $ohHdr += $wsOH.Cells.Item(1,$c).Text }
WriteJson 'expenses_headers' $ohHdr
$ohs=@()
foreach ($row in (SheetRows 'wsOH' 6)) {
  # skip title/summary rows without amount
  $ohs += @{ date="$($row[0])".Trim(); type="$($row[1])".Trim(); name="$($row[2])".Trim(); c4="$($row[3])".Trim(); c5="$($row[4])".Trim(); gel="$($row[5])".Trim() }
}
WriteJson 'expenses' $ohs

# Recipes matrix: row1 product names from col4+, col A/B ingredient ids/names
$wsRec = $map['wsRec']
$recLastCol = 3
$recLastRow = 2
try {
  $ur = $wsRec.UsedRange
  $recLastCol = $ur.Column + $ur.Columns.Count - 1
  $recLastRow = $ur.Row + $ur.Rows.Count - 1
} catch {}
$prodNames = @{}
for ($c = 4; $c -le $recLastCol; $c++) {
  $nm = "$($wsRec.Cells.Item(1, $c).Text)".Trim()
  if ($nm) { $prodNames[$c] = $nm }
}
$recipeLines = @()
for ($r = 2; $r -le $recLastRow; $r++) {
  $ingId = "$($wsRec.Cells.Item($r, 1).Text)".Trim()
  if (-not $ingId) { continue }
  foreach ($c in $prodNames.Keys) {
    $q = $wsRec.Cells.Item($r, $c).Value2
    if ($null -ne $q -and "$q" -ne '' -and [double]$q -ne 0) {
      $recipeLines += @{ ingredientId = $ingId; productName = $prodNames[$c]; qty = [double]$q }
    }
  }
}
WriteJson 'recipes' $recipeLines

# Snapshot of Excel computed product costs for comparison
$snap = @()
$wsProd = $map['wsProd']
$lastP = 2
try { $ur=$wsProd.UsedRange; $lastP=$ur.Row+$ur.Rows.Count-1 } catch {}
for ($r=2; $r -le $lastP; $r++) {
  $id = "$($wsProd.Cells.Item($r,1).Text)".Trim()
  if (-not $id) { continue }
  $snap += @{
    id = $id
    name = "$($wsProd.Cells.Item($r,2).Text)".Trim()
    qtyIn = "$($wsProd.Cells.Item($r,4).Text)".Trim()
    ingUnit = "$($wsProd.Cells.Item($r,5).Text)".Trim()
    ohUnit = "$($wsProd.Cells.Item($r,6).Text)".Trim()
    fullUnit = "$($wsProd.Cells.Item($r,8).Text)".Trim()
    sold = "$($wsProd.Cells.Item($r,10).Text)".Trim()
    stock = "$($wsProd.Cells.Item($r,11).Text)".Trim()
  }
}
WriteJson 'excel_product_snapshot' $snap

$wb.Close($false)
$excel.Quit()
[GC]::Collect(); [GC]::WaitForPendingFinalizers()
Write-Output 'EXPORT DONE'
