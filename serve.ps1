# Servidor estático mínimo para abrir o site localmente:  powershell -File serve.ps1
param([int]$Port = 8765)
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch [System.Net.HttpListenerException] {
  Write-Error "Nao foi possivel ouvir em http://localhost:$Port/ (porta ja em uso). Pare o processo que a ocupa ou rode: powershell -File serve.ps1 -Port 8766"
  exit 1
}
Write-Host "Servindo $root em http://localhost:$Port/ (Ctrl+C para parar)"
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8' }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
  $path = Join-Path $root $rel
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($path)
    $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
