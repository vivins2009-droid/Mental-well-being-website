param (
    [int]$Port = 8080
)

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:${Port}/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "Local web server running at $prefix"
} catch {
    Write-Host "Failed to start listener on $prefix : $_"
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".xlsx" = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

$root = $PSScriptRoot

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath
        if ($localPath -eq "/") {
            $localPath = "/index.html"
        }

        $filePath = [System.IO.Path]::Combine($root, $localPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar))

        if ([System.IO.File]::Exists($filePath)) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            if ($mimeTypes.ContainsKey($ext)) {
                $response.ContentType = $mimeTypes[$ext]
            } else {
                $response.ContentType = "application/octet-stream"
            }
            $buffer = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } else {
            $response.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 - Not Found")
            $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }
        $response.Close()
    } catch {
        # Catch unexpected errors to keep loop running
    }
}
