@echo off
echo ========================================================
echo  Iniciando Servidor Web Local para DVR TV
echo  Abra no seu navegador ou na TV Samsung em:
echo  http://localhost:8080/ ou http://SEU_IP_PC:8080/
echo ========================================================
powershell -ExecutionPolicy Bypass -NoProfile -Command "& { $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://*:8080/'); $listener.Start(); Write-Host 'Servidor rodando em http://localhost:8080/ (Pressione Ctrl+C para parar)'; while ($listener.IsListening) { $ctx = $listener.GetContext(); $req = $ctx.Request; $resp = $ctx.Response; $localPath = $req.Url.LocalPath.TrimStart('/'); if ([string]::IsNullOrEmpty($localPath)) { $localPath = 'index.html' }; if (Test-Path $localPath) { $bytes = [System.IO.File]::ReadAllBytes($localPath); $ext = [System.IO.Path]::GetExtension($localPath).ToLower(); switch ($ext) { '.html' { $resp.ContentType = 'text/html; charset=utf-8' } '.css' { $resp.ContentType = 'text/css' } '.js' { $resp.ContentType = 'application/javascript' } '.png' { $resp.ContentType = 'image/png' } '.xml' { $resp.ContentType = 'text/xml' } default { $resp.ContentType = 'application/octet-stream' } } $resp.ContentLength64 = $bytes.Length; $resp.OutputStream.Write($bytes, 0, $bytes.Length) } else { $resp.StatusCode = 404; $buf = [System.Text.Encoding]::UTF8.GetBytes('Not Found'); $resp.ContentLength64 = $buf.Length; $resp.OutputStream.Write($buf, 0, $buf.Length) }; $resp.OutputStream.Close() } }"
pause
