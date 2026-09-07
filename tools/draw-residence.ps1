# =========================================================================
#  一次性前處理（第 2 步／共 2 步）：把 render-residence.mjs 投影好的線段
#  畫成雲端宅邸 App 那一頁的主視覺 assets/residence.png。
#
#  為什麼用 PowerShell：Windows 上沒裝任何繪圖套件，System.Drawing 是 .NET
#  內建的、零安裝。整個專案的原則是不引入相依套件。
#
#  發光的做法：同一條線畫三次 —— 寬且極透明（外圈光暈）、中等、細且亮（線芯）。
#  ⚠️ 背景留**透明**存成 PNG，讓頁面自己的漸層透上來。存成 JPEG 就得把背景烤進去，
#     之後頁面底色一改就會出現一塊色差。
#
#  用法：
#    node tools/render-residence.mjs > segs.json
#    powershell -File tools/draw-residence.ps1 -Segs segs.json
# =========================================================================
param(
  [Parameter(Mandatory=$true)][string]$Segs,
  [string]$Out = 'C:\Users\USER\Desktop\coding\網頁\G-pad\assets\residence.png',
  [int]$Width = 1600,
  [int]$Margin = 54
)

Add-Type -AssemblyName System.Drawing

$data = Get-Content -Raw -Encoding UTF8 $Segs | ConvertFrom-Json
$bb = $data.bbox
$bw = $bb.x1 - $bb.x0
$bh = $bb.y1 - $bb.y0

$scale = ($Width - 2 * $Margin) / $bw
$height = [int][Math]::Round($bh * $scale) + 2 * $Margin

$bmp = New-Object System.Drawing.Bitmap($Width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# 三個 pass：外光暈 → 中層 → 線芯
# ⚠️ 線寬要跟著輸出尺寸縮放，不然換解析度時光暈的比例就變了
$k = $Width / 1600.0
$passes = @(
  @{ w = 9.0 * $k; c = [System.Drawing.Color]::FromArgb( 14, 110, 195, 255) },
  @{ w = 4.2 * $k; c = [System.Drawing.Color]::FromArgb( 34, 140, 215, 255) },
  @{ w = 1.5 * $k; c = [System.Drawing.Color]::FromArgb(220, 210, 238, 255) }
)

# 先把座標換算好，三個 pass 共用（省掉重複計算）
$n = $data.segs.Count
$x1 = New-Object 'single[]' $n; $y1 = New-Object 'single[]' $n
$x2 = New-Object 'single[]' $n; $y2 = New-Object 'single[]' $n
for ($i = 0; $i -lt $n; $i++) {
  $s = $data.segs[$i]
  $x1[$i] = [single]($Margin + ($s[0] - $bb.x0) * $scale)
  $y1[$i] = [single]($Margin + ($s[1] - $bb.y0) * $scale)
  $x2[$i] = [single]($Margin + ($s[2] - $bb.x0) * $scale)
  $y2[$i] = [single]($Margin + ($s[3] - $bb.y0) * $scale)
}

foreach ($p in $passes) {
  $pen = New-Object System.Drawing.Pen($p.c, [single]$p.w)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
  for ($i = 0; $i -lt $n; $i++) { $g.DrawLine($pen, $x1[$i], $y1[$i], $x2[$i], $y2[$i]) }
  $pen.Dispose()
}

$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$kb = [int]((Get-Item $Out).Length / 1KB)
Write-Output ("{0} x {1}（長寬比 {2:N3}）、{3} 條線 -> {4}KB" -f $Width, $height, ($Width / $height), $n, $kb)
