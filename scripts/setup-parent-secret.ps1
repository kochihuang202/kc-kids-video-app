$ErrorActionPreference = "Stop"

function ConvertTo-PlainText([Security.SecureString]$SecureValue) {
  return [System.Net.NetworkCredential]::new("", $SecureValue).Password
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$passwordSecure = Read-Host "請輸入家長密碼（8–128 字元，輸入時不會顯示）" -AsSecureString
$password = ConvertTo-PlainText $passwordSecure
if ($password.Length -lt 8 -or $password.Length -gt 128) {
  throw "家長密碼必須是 8–128 個字元。"
}

$salt = [byte[]]::new(16)
[Security.Cryptography.RandomNumberGenerator]::Fill($salt)
$iterations = 310000
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
$passwordSecret = $null

Write-Host "家長密碼雜湊已安全設定完成。" -ForegroundColor Green
