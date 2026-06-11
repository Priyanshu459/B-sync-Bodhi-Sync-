Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile("C:\Users\priya\OneDrive\Documents\new_browser_\icon.png")
$newImage = new-object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($newImage)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.DrawImage($image, 0, 0, 256, 256)
$graphics.Dispose()
$image.Dispose()
$newImage.Save("C:\Users\priya\OneDrive\Documents\new_browser_\icon_256.png", [System.Drawing.Imaging.ImageFormat]::Png)
$newImage.Dispose()
