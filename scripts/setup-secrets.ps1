$ErrorActionPreference = "Stop"

function ConvertTo-PlainText([Security.SecureString]$SecureValue) {
  return [System.Net.NetworkCredential]::new("", $SecureValue).Password
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$passwordSecure = Read-Host "請輸入家長初始密碼（8–128 字元，不會顯示）" -AsSecureString
$password = ConvertTo-PlainText $passwordSecure
if ($password.Length -lt 8 -or $password.Length -gt 128) {
  throw "家長密碼必須是 8–128 個字元。"
}

$salt = [byte[]]::new(16)
[Security.Cryptography.RandomNumberGenerator]::Fill($salt)
$iterations = 100000
$derive = [Security.Cryptography.Rfc2898DeriveBytes]::new(
  $password,
  $salt,
  $iterations,
  [Security.Cryptography.HashAlgorithmName]::SHA256
)
try {
  $passwordHash = $derive.GetBytes(32)
} finally {
  $derive.Dispose()
  $password = $null
}
$passwordSecret = "pbkdf2_sha256`$$iterations`$$(ConvertTo-Base64Url $salt)`$$(ConvertTo-Base64Url $passwordHash)"
$passwordSecret | npx wrangler secret put PARENT_PASSWORD_HASH

$sessionBytes = [byte[]]::new(48)
[Security.Cryptography.RandomNumberGenerator]::Fill($sessionBytes)
(ConvertTo-Base64Url $sessionBytes) | npx wrangler secret put SESSION_SECRET

$youtubeSecure = Read-Host "請輸入 YouTube Data API Key（不會顯示）" -AsSecureString
$youtubeKey = ConvertTo-PlainText $youtubeSecure
if ([string]::IsNullOrWhiteSpace($youtubeKey)) {
  throw "YouTube API Key 不可空白。"
}
$youtubeKey | npx wrangler secret put YOUTUBE_API_KEY
$youtubeKey = $null

Write-Host "三個 Worker Secrets 已設定完成。" -ForegroundColor Green
