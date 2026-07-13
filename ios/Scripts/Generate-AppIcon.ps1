Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$size = 1024
$output = Join-Path $PSScriptRoot "..\MeteoScope\Assets.xcassets\AppIcon.appiconset\AppIcon-1024.png"
$bitmap = New-Object System.Drawing.Bitmap(
    $size,
    $size,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

try {
    $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $size, $size)),
        ([System.Drawing.Color]::FromArgb(255, 5, 26, 76)),
        ([System.Drawing.Color]::FromArgb(255, 0, 132, 255)),
        55
    )
    $graphics.FillRectangle($background, 0, 0, $size, $size)
    $background.Dispose()

    $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(35, 255, 255, 255))
    $graphics.FillEllipse($glow, 84, 84, 856, 856)
    $glow.Dispose()

    $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(88, 190, 235, 255), 18)
    $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawArc($ringPen, 162, 300, 700, 700, 205, 130)
    $graphics.DrawArc($ringPen, 282, 420, 460, 460, 205, 130)
    $graphics.DrawArc($ringPen, 402, 540, 220, 220, 205, 130)
    $ringPen.Dispose()

    $sunBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 199, 52))
    $graphics.FillEllipse($sunBrush, 570, 210, 230, 230)
    $sunBrush.Dispose()

    $cloudShadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(46, 0, 18, 60))
    $graphics.FillEllipse($cloudShadow, 216, 406, 268, 268)
    $graphics.FillEllipse($cloudShadow, 386, 324, 330, 330)
    $graphics.FillEllipse($cloudShadow, 608, 432, 214, 214)
    $graphics.FillRectangle($cloudShadow, 282, 520, 470, 168)
    $cloudShadow.Dispose()

    $cloud = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 246, 251, 255))
    $graphics.FillEllipse($cloud, 198, 384, 268, 268)
    $graphics.FillEllipse($cloud, 368, 302, 330, 330)
    $graphics.FillEllipse($cloud, 590, 410, 214, 214)
    $graphics.FillRectangle($cloud, 264, 498, 470, 168)
    $cloud.Dispose()

    $drop = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 126, 224, 255))
    $dropPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $dropPath.AddBezier(330, 680, 330, 680, 276, 758, 276, 802)
    $dropPath.AddBezier(276, 802, 276, 852, 384, 852, 384, 802)
    $dropPath.AddBezier(384, 802, 384, 758, 330, 680, 330, 680)
    $graphics.FillPath($drop, $dropPath)
    $dropPath.Dispose()

    $dropPath2 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $dropPath2.AddBezier(512, 700, 512, 700, 466, 768, 466, 806)
    $dropPath2.AddBezier(466, 806, 466, 850, 558, 850, 558, 806)
    $dropPath2.AddBezier(558, 806, 558, 768, 512, 700, 512, 700)
    $graphics.FillPath($drop, $dropPath2)
    $dropPath2.Dispose()

    $dropPath3 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $dropPath3.AddBezier(676, 680, 676, 680, 622, 758, 622, 802)
    $dropPath3.AddBezier(622, 802, 622, 852, 730, 852, 730, 802)
    $dropPath3.AddBezier(730, 802, 730, 758, 676, 680, 676, 680)
    $graphics.FillPath($drop, $dropPath3)
    $dropPath3.Dispose()
    $drop.Dispose()

    $center = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $graphics.FillEllipse($center, 480, 850, 64, 64)
    $center.Dispose()

    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Output "Generated $output"
