$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Servidor de Teste DVR TV no Computador" -ForegroundColor Green
Write-Host " Acesse no seu navegador: http://localhost:8080/" -ForegroundColor Yellow
Write-Host " Pressione Ctrl+C para encerrar" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Abre o navegador automaticamente
Start-Process "http://localhost:8080/"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath

        # Proxy para o DVR (remove restrições de CORS no PC)
        if ($path.StartsWith("/dvr/")) {
            $dvrRelPath = $path.Substring(4) # remove /dvr
            $dvrUrl = "http://192.168.100.2" + $dvrRelPath + $request.Url.Query

            $wc = [System.Net.HttpWebRequest]::Create($dvrUrl)
            $wc.Method = $request.HttpMethod
            $wc.Timeout = 10000

            if ($request.Headers["SessionTag"]) {
                $wc.Headers.Add("SessionTag", $request.Headers["SessionTag"])
            }
            if ($request.Headers["If-Modified-Since"]) {
                $wc.IfModifiedSince = [DateTime]::UtcNow
            }

            if ($request.HttpMethod -eq "POST" -or $request.HttpMethod -eq "PUT") {
                $wc.ContentType = $request.ContentType
                $reqStream = $wc.GetRequestStream()
                $request.InputStream.CopyTo($reqStream)
                $reqStream.Close()
            }

            try {
                $dvrResp = $wc.GetResponse()
                $response.StatusCode = [int]$dvrResp.StatusCode
                $response.ContentType = $dvrResp.ContentType
                $response.AddHeader("Access-Control-Allow-Origin", "*")
                $response.AddHeader("Access-Control-Allow-Headers", "*")
                $response.AddHeader("Access-Control-Allow-Methods", "*")
                
                $respStream = $dvrResp.GetResponseStream()
                $respStream.CopyTo($response.OutputStream)
                $dvrResp.Close()
            } catch [System.Net.WebException] {
                $exResp = $_.Exception.Response
                if ($exResp) {
                    $response.StatusCode = [int]$exResp.StatusCode
                    $response.ContentType = $exResp.ContentType
                    $response.AddHeader("Access-Control-Allow-Origin", "*")
                    $exStream = $exResp.GetResponseStream()
                    $exStream.CopyTo($response.OutputStream)
                    $exResp.Close()
                } else {
                    $response.StatusCode = 502
                }
            }
            $response.OutputStream.Close()
            continue
        }

        # Trata requisição OPTIONS para CORS
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Headers", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            $response.StatusCode = 200
            $response.OutputStream.Close()
            continue
        }

        # Servir arquivos estáticos locais (index.html, css, js)
        $localFile = $path.TrimStart('/')
        if ([string]::IsNullOrEmpty($localFile)) { $localFile = "index.html" }

        if (Test-Path $localFile) {
            $bytes = [System.IO.File]::ReadAllBytes($localFile)
            $ext = [System.IO.Path]::GetExtension($localFile).ToLower()
            $mime = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css" }
                ".js"   { "application/javascript" }
                ".png"  { "image/png" }
                ".xml"  { "text/xml" }
                default { "application/octet-stream" }
            }
            $response.ContentType = $mime
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.OutputStream.Close()
    } catch {
        # ignora erros de cancelamento
    }
}
