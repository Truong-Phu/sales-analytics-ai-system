$output = "D:\graduation_thesis\ngrok-current.txt"

try {
    $tunnels = (Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels
    $url = ($tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url

    if ($url) {
        $content = @"
NGROK_URL=$url
DEMO_URL=$url
SEPAY_WEBHOOK=$url/api/payment/webhook/sepay
UPDATED=$(Get-Date -Format "dd/MM/yyyy HH:mm:ss")
"@
        $content | Out-File -FilePath $output -Encoding utf8
        Write-Host $url
    } else {
        Write-Host ""
    }
} catch {
    Write-Host ""
}
