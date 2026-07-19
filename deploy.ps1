param([string]$Message)

Set-Location $PSScriptRoot

if (-not $Message) {
    $Message = "update " + (Get-Date -Format "yyyy-MM-dd HH:mm")
}

git add -A

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "変更がありません。コミットをスキップします。"
    exit 0
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Error "commit に失敗しました"; exit 1 }

git push
if ($LASTEXITCODE -ne 0) { Write-Error "push に失敗しました"; exit 1 }

Write-Host "デプロイ完了。GitHub Pages への反映には1〜2分かかります。"
