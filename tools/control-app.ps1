# =====================================================================
#  لوحة تحكم نظام إدارة الموارد البشرية (HR-SYSTEM)
#  تُشغَّل من الملف control-app.bat في مجلد النظام.
#  متوافقة مع Windows PowerShell 5.1 (Windows 10/11 و Windows Server).
# =====================================================================
#  -ScheduledBackup : يُستدعى من المهمة المجدولة HRSystemBackup لأخذ نسخة احتياطية بدون واجهة.
#  -RestartNow      : يُعيد تشغيل الخادم مباشرة بصلاحية المدير بدون فتح الواجهة.
# =====================================================================
param([switch]$ScheduledBackup, [switch]$RestartNow)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------
# التشغيل بصلاحية المدير (مطلوبة للتشغيل الدائم وجدار الحماية)
# ---------------------------------------------------------------------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if ($ScheduledBackup) { exit 1 }
    $argList = '-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "' + $PSCommandPath + '"'
    if ($RestartNow) { $argList += ' -RestartNow' }
    try {
        if ($RestartNow) {
            Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -Wait | Out-Null
        } else {
            Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs | Out-Null
        }
    } catch {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show('لوحة التحكم تحتاج صلاحية المدير (Administrator). أعد فتحها ووافق على طلب الصلاحية.', 'نظام الموارد البشرية') | Out-Null
    }
    exit
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ---------------------------------------------------------------------
# الثوابت والمسارات
# ---------------------------------------------------------------------
$script:AppName    = 'نظام إدارة الموارد البشرية'
$script:AppDir     = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
# وقت تعديل ملف اللوحة عند فتحها: إذا تحدّث النظام واللوحة مفتوحة تبقى تعمل بالنسخة القديمة من نفسها
$script:PanelFile  = $PSCommandPath
$script:PanelStamp = (Get-Item -LiteralPath $PSCommandPath).LastWriteTimeUtc
$script:RepoUrl    = 'https://github.com/omaralmayahi-ai/HR-SYSTEM.git'
$script:Branch     = 'main'
$script:TaskName   = 'HRSystem'
$script:FwRuleName = 'HRSystem'
$script:DefaultPort = 5000
$script:ServerFile = 'dist\server.cjs'
$script:EnvFile    = Join-Path $AppDir '.env'
$script:EnvExample = Join-Path $AppDir '.env.example'
$script:DataDir    = Join-Path $AppDir 'data'
$script:LogDir     = Join-Path $AppDir 'logs'
$script:BackupDir  = Join-Path $AppDir 'backups'
$script:BackupTask = 'HRSystemBackup'
$script:BackupSchedule = Join-Path $BackupDir 'schedule.json'
$script:ServerLog  = Join-Path $LogDir 'server.log'
$script:PanelLog   = Join-Path $LogDir 'control-panel.log'
$script:Busy       = $false
$script:Utf8NoBom  = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ---------------------------------------------------------------------
# أدوات عامة
# ---------------------------------------------------------------------
function Update-PathFromRegistry {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

# كل ما يظهر في السجلّ يُحفظ أيضاً في logs\control-panel.log للرجوع إليه
function Save-PanelLog([string]$text) {
    try { [IO.File]::AppendAllText($script:PanelLog, $text, $script:Utf8NoBom) } catch { }
}

function Write-Log([string]$text) {
    $stamp = (Get-Date).ToString('HH:mm:ss')
    foreach ($line in ($text -split "`r?`n")) {
        if ($line.Length -gt 0) {
            if ($script:LogBox) { $script:LogBox.AppendText("[$stamp] $line`r`n") }
            Save-PanelLog ((Get-Date).ToString('yyyy-MM-dd ') + "[$stamp] $line`r`n")
        }
    }
    if ($script:LogBox) { [System.Windows.Forms.Application]::DoEvents() }
}

function Show-Info([string]$text, [string]$title = 'نظام الموارد البشرية') {
    $opts = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
    [System.Windows.Forms.MessageBox]::Show($text, $title, 'OK', 'Information', 'Button1', $opts) | Out-Null
}

function Show-Error([string]$text, [string]$title = 'خطأ') {
    $opts = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
    [System.Windows.Forms.MessageBox]::Show($text, $title, 'OK', 'Error', 'Button1', $opts) | Out-Null
}

function Confirm-Action([string]$text, [string]$title = 'تأكيد') {
    $opts = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
    $r = [System.Windows.Forms.MessageBox]::Show($text, $title, 'YesNo', 'Question', 'Button2', $opts)
    return ($r -eq [System.Windows.Forms.DialogResult]::Yes)
}

# تشغيل أمر طويل مع عرض مخرجاته في السجلّ بدون تجميد الواجهة.
# ملاحظة: بعض الأدوات (pg_dump, pg_restore, tar) لا تفهم المسارات العربية في معاملاتها،
# لذلك نشغّلها من داخل المجلد المطلوب ($workDir) ونمرر لها أسماء ملفات قصيرة بالإنجليزية.
function Invoke-Logged([string]$file, [string]$arguments, [string]$title, [string]$workDir) {
    if ($title) { Write-Log "── $title" }
    $tmp = [IO.Path]::GetTempFileName()
    $script:LastOutput = New-Object System.Collections.Generic.List[string]
    $cmdLine = '/d /s /c ""' + $file + '" ' + $arguments + ' > "' + $tmp + '" 2>&1"'
    $psi = New-Object Diagnostics.ProcessStartInfo 'cmd.exe', $cmdLine
    if ($workDir) { $psi.WorkingDirectory = $workDir } else { $psi.WorkingDirectory = $script:AppDir }
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = [Diagnostics.Process]::Start($psi)
    $pos = 0
    $fs = $null
    try {
        while ($true) {
            $exited = $proc.HasExited
            if ($null -eq $fs) {
                try { $fs = New-Object IO.FileStream($tmp, 'Open', 'Read', 'ReadWrite') } catch { $fs = $null }
            }
            if ($null -ne $fs -and $fs.Length -gt $pos) {
                $fs.Seek($pos, 'Begin') | Out-Null
                $buf = New-Object byte[] ($fs.Length - $pos)
                $n = $fs.Read($buf, 0, $buf.Length)
                $pos += $n
                $chunk = [Text.Encoding]::UTF8.GetString($buf, 0, $n)
                $chunk = [regex]::Replace($chunk, '\x1B\[[0-9;?]*[A-Za-z]', '')
                foreach ($line in ($chunk -split "`r?`n")) {
                    if ($line.Trim().Length -gt 0) {
                        $script:LastOutput.Add($line)
                        if ($script:LogBox) { $script:LogBox.AppendText("   $line`r`n") }
                        Save-PanelLog "   $line`r`n"
                    }
                }
            }
            if ($exited) { break }
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 150
        }
    } finally {
        if ($null -ne $fs) { $fs.Close() }
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
    return $proc.ExitCode
}

function Assert-Step([int]$code, [string]$message) {
    if ($code -ne 0) { throw $message }
}

# ---------------------------------------------------------------------
# ملف الإعدادات .env
# ---------------------------------------------------------------------
function Read-EnvFile {
    $result = @{}
    if (Test-Path $script:EnvFile) {
        foreach ($line in [IO.File]::ReadAllLines($script:EnvFile, $script:Utf8NoBom)) {
            if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') { $result[$matches[1]] = $matches[2].Trim() }
        }
    }
    return $result
}

function Set-EnvValues([hashtable]$values) {
    if (-not (Test-Path $script:EnvFile)) {
        if (Test-Path $script:EnvExample) { Copy-Item $script:EnvExample $script:EnvFile }
        else { [IO.File]::WriteAllText($script:EnvFile, '', $script:Utf8NoBom) }
    }
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.AddRange([string[]][IO.File]::ReadAllLines($script:EnvFile, $script:Utf8NoBom))
    foreach ($key in $values.Keys) {
        $found = $false
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match ('^\s*' + [regex]::Escape($key) + '\s*=')) {
                $lines[$i] = "$key=$($values[$key])"
                $found = $true
            }
        }
        if (-not $found) { $lines.Add("$key=$($values[$key])") }
    }
    [IO.File]::WriteAllLines($script:EnvFile, $lines.ToArray(), $script:Utf8NoBom)
}

function Get-AppPort {
    $cfg = Read-EnvFile
    $p = 0
    if ($cfg.ContainsKey('PORT') -and [int]::TryParse($cfg['PORT'], [ref]$p) -and $p -gt 0) { return $p }
    return $script:DefaultPort
}

# النظام يستمع افتراضياً على كل الشبكة (0.0.0.0) كما كان سابقاً
function Get-AppHost {
    $cfg = Read-EnvFile
    if ($cfg.ContainsKey('HOST') -and $cfg['HOST']) { return $cfg['HOST'] }
    return '0.0.0.0'
}

function Get-DbSettings {
    $cfg = Read-EnvFile
    $s = @{ Host = 'localhost'; Port = '5432'; User = 'postgres'; Password = ''; Name = 'hr_system' }
    if ($cfg['SQL_HOST'])     { $s.Host = $cfg['SQL_HOST'] }
    if ($cfg['SQL_PORT'])     { $s.Port = $cfg['SQL_PORT'] }
    if ($cfg['SQL_USER'])     { $s.User = $cfg['SQL_USER'] }
    if ($cfg.ContainsKey('SQL_PASSWORD')) { $s.Password = $cfg['SQL_PASSWORD'] }
    if ($cfg['SQL_DB_NAME'])  { $s.Name = $cfg['SQL_DB_NAME'] }
    return $s
}

function Save-DbSettings([hashtable]$s) {
    Set-EnvValues @{ SQL_HOST = $s.Host; SQL_PORT = $s.Port; SQL_USER = $s.User; SQL_PASSWORD = $s.Password; SQL_DB_NAME = $s.Name }
}

function New-Secret {
    $bytes = New-Object byte[] 48
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '')
}

function New-HexKey {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Test-HexKey([string]$v) { return ($v -match '^[0-9a-fA-F]{64}$') }

function Ensure-EnvFile {
    $cfg = Read-EnvFile
    $values = @{}
    if (-not $cfg.ContainsKey('PORT')) { $values.PORT = "$($script:DefaultPort)" }
    if (-not $cfg.ContainsKey('HOST')) { $values.HOST = '0.0.0.0' }
    if (-not $cfg['JWT_SECRET'] -or $cfg['JWT_SECRET'] -like 'your_*' -or $cfg['JWT_SECRET'].Length -lt 16) {
        $values.JWT_SECRET = New-Secret
        Write-Log '✔ تم توليد مفتاح جلسات جديد (JWT_SECRET).'
    }
    # مفتاح تشفير data\local_storage.json: لا يُستبدل أبداً إذا وُجد ملف بيانات مشفّر (يصبح غير قابل للقراءة)
    $key = $cfg['LOCAL_DB_ENCRYPTION_KEY']
    if (-not (Test-HexKey $key)) {
        if (Test-Path (Join-Path $script:DataDir 'local_storage.json')) {
            Write-Log '⚠ مفتاح التشفير LOCAL_DB_ENCRYPTION_KEY غير صالح أو غير موجود، وملف data\local_storage.json موجود. لم يُولَّد مفتاح جديد حتى لا يضيع الملف — ضع المفتاح الأصلي في .env.'
        } else {
            $values.LOCAL_DB_ENCRYPTION_KEY = New-HexKey
            Write-Log '✔ تم توليد مفتاح تشفير جديد للتخزين الاحتياطي المحلي.'
        }
    }
    if ($values.Count -gt 0 -or -not (Test-Path $script:EnvFile)) { Set-EnvValues $values }
}

# ---------------------------------------------------------------------
# البحث عن البرامج المطلوبة
# ---------------------------------------------------------------------
function Get-NodeExe {
    Update-PathFromRegistry
    $c = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $p = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $p) { return $p }
    return $null
}

function Get-NpmCmd {
    $node = Get-NodeExe
    if (-not $node) { return $null }
    $p = Join-Path (Split-Path $node) 'npm.cmd'
    if (Test-Path $p) { return $p }
    $c = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}

function Get-NodeVersion {
    $ErrorActionPreference = 'Continue'
    $node = Get-NodeExe
    if (-not $node) { return $null }
    try { return (& $node --version).Trim() } catch { return $null }
}

function Test-NodeVersionOk([string]$v) {
    if ($v -notmatch '^v(\d+)\.(\d+)') { return $false }
    return ([int]$matches[1] -ge 20)
}

function Get-PgBin {
    Update-PathFromRegistry
    $c = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($c) { return (Split-Path $c.Source) }
    $roots = @("$env:ProgramFiles\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL")
    foreach ($root in $roots) {
        if (Test-Path $root) {
            $dirs = Get-ChildItem $root -Directory | Sort-Object { [double]($_.Name -replace '[^\d.]', '') } -Descending
            foreach ($d in $dirs) {
                $bin = Join-Path $d.FullName 'bin'
                if (Test-Path (Join-Path $bin 'psql.exe')) { return $bin }
            }
        }
    }
    return $null
}

function Get-GitExe {
    Update-PathFromRegistry
    $c = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $p = Join-Path $env:ProgramFiles 'Git\cmd\git.exe'
    if (Test-Path $p) { return $p }
    return $null
}

function Test-WingetAvailable {
    return [bool](Get-Command winget.exe -ErrorAction SilentlyContinue)
}

# تشغيل psql لاستعلام قصير وإرجاع النتيجة
function Invoke-Psql([hashtable]$db, [string]$database, [string]$sql) {
    $ErrorActionPreference = 'Continue'
    $bin = Get-PgBin
    if (-not $bin) { return @{ Code = 99; Output = 'لم يتم العثور على PostgreSQL على هذه الحاسبة.' } }
    $env:PGPASSWORD = $db.Password
    $env:PGCLIENTENCODING = 'UTF8'
    $env:PGCONNECT_TIMEOUT = '4'
    try {
        $out = & (Join-Path $bin 'psql.exe') -h $db.Host -p $db.Port -U $db.User -d $database -w -tAc $sql 2>&1
        $code = $LASTEXITCODE
    } finally {
        Remove-Item Env:PGPASSWORD, Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
    }
    return @{ Code = $code; Output = (($out | ForEach-Object { "$_" }) -join "`n").Trim() }
}

function Test-DbServer([hashtable]$db) {
    return (Invoke-Psql $db 'postgres' 'select 1')
}

function Test-DbExists([hashtable]$db) {
    $r = Invoke-Psql $db 'postgres' ("select 1 from pg_database where datname = '" + ($db.Name -replace "'", "''") + "'")
    return ($r.Code -eq 0 -and $r.Output -eq '1')
}

# اتصال سريع بقاعدة النظام نفسها (يُستخدم في لوحة الحالة)
function Test-AppDb {
    $db = Get-DbSettings
    $r = Invoke-Psql $db $db.Name 'select 1'
    return ($r.Code -eq 0)
}

function New-Database([hashtable]$db) {
    $ErrorActionPreference = 'Continue'
    $bin = Get-PgBin
    $env:PGPASSWORD = $db.Password
    try {
        $out = & (Join-Path $bin 'createdb.exe') -h $db.Host -p $db.Port -U $db.User -w -E UTF8 $db.Name 2>&1
        $code = $LASTEXITCODE
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    if ($code -ne 0) { throw ('تعذّر إنشاء قاعدة البيانات: ' + (($out | ForEach-Object { "$_" }) -join ' ')) }
}

# ---------------------------------------------------------------------
# حالة الخادم
# ---------------------------------------------------------------------
function Get-ListeningPid([int]$port) {
    $ErrorActionPreference = 'Continue'
    try {
        $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($c) { return [int]$c.OwningProcess }
    } catch {
        $line = netstat -ano -p tcp | Select-String (":$port\s+.*LISTENING\s+(\d+)") | Select-Object -First 1
        if ($line -and $line.Matches[0].Groups[1].Value) { return [int]$line.Matches[0].Groups[1].Value }
    }
    return $null
}

# النظام يعمل إذا ردّ على مسار الإعدادات العامة (لا يحتاج تسجيل دخول)
function Test-AppResponds {
    $port = Get-AppPort
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/settings/public" -TimeoutSec 3 -UseBasicParsing
        return $true
    } catch {
        $resp = $null
        try { $resp = $_.Exception.Response } catch { }
        return ($null -ne $resp)
    }
}

function Get-Health {
    if (Test-AppResponds) { return @{ Running = $true; Db = (Test-AppDb) } }
    return @{ Running = $false; Db = $false }
}

function Get-AutoStartTask {
    return Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
}

function Get-AppVersion {
    $pkg = Join-Path $script:AppDir 'package.json'
    $v = '?'
    if (Test-Path $pkg) {
        try { $v = ([IO.File]::ReadAllText($pkg, $script:Utf8NoBom) | ConvertFrom-Json).version } catch { }
    }
    $ErrorActionPreference = 'Continue'
    $git = Get-GitExe
    if ($git -and (Test-Path (Join-Path $script:AppDir '.git'))) {
        $sha = (& $git -C $script:AppDir rev-parse --short HEAD 2>$null)
        if ($sha) { $v = "$v ($sha)" }
    }
    return $v
}

function Get-LanAddresses {
    try {
        return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
            ForEach-Object { $_.IPAddress })
    } catch { return @() }
}

function Get-AppUrl {
    return "http://localhost:$(Get-AppPort)"
}

function Test-Built {
    return ((Test-Path (Join-Path $script:AppDir $script:ServerFile)) -and (Test-Path (Join-Path $script:AppDir 'dist\index.html')))
}

# ---------------------------------------------------------------------
# التشغيل والإيقاف
# ---------------------------------------------------------------------
function Wait-ForServer([int]$seconds) {
    for ($i = 0; $i -lt ($seconds * 2); $i++) {
        if (Test-AppResponds) { return (Get-Health) }
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 500
    }
    return (Get-Health)
}

function Test-AppActive {
    if (Test-AppResponds) { return $true }
    $task = Get-AutoStartTask
    if ($task -and $task.State -eq 'Running') { return $true }
    foreach ($p in (@((Get-AppPort), 5000, 5001) | Select-Object -Unique)) {
        $procId = Get-ListeningPid $p
        if ($procId) {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq 'node') { return $true }
        }
    }
    return $false
}

function Start-App {
    $port = Get-AppPort
    if (Test-AppResponds) { Write-Log 'النظام يعمل مسبقاً.'; return }
    if (-not (Test-Built)) { throw 'النظام غير مبني بعد. استخدم "تنصيب أول مرة" أو "إعادة البناء".' }
    if (-not (Test-Path $script:EnvFile)) { throw 'ملف الإعدادات .env غير موجود. استخدم "تنصيب أول مرة".' }

    $owner = Get-ListeningPid $port
    $ownerProc = if ($owner) { Get-Process -Id $owner -ErrorAction SilentlyContinue } else { $null }
    $task = Get-AutoStartTask
    if (($ownerProc -and $ownerProc.ProcessName -eq 'node') -or ($task -and $task.State -eq 'Running')) {
        Write-Log 'إيقاف جلسة سابقة عالقة للنظام قبل التشغيل...'
        Stop-App
        $owner = Get-ListeningPid $port
    }
    if ($owner) { throw "المنفذ $port مشغول ببرنامج آخر (رقم العملية $owner). استخدم ""فحص المنفذ"" أو غيّر المنفذ من الإعدادات." }

    $task = Get-AutoStartTask
    if ($task) {
        Write-Log 'تشغيل النظام (التشغيل الدائم)...'
        Start-ScheduledTask -TaskName $script:TaskName
    } else {
        $node = Get-NodeExe
        if (-not $node) { throw 'Node.js غير منصّب.' }
        if (Test-Path $script:ServerLog) { Move-Item $script:ServerLog "$($script:ServerLog).old" -Force -ErrorAction SilentlyContinue }
        Write-Log 'تشغيل النظام...'
        # وضع الإنتاج: الواجهة المبنية من dist (أسرع بكثير من وضع التطوير)
        $env:NODE_ENV = 'production'
        try {
            Start-Process -FilePath $node -ArgumentList $script:ServerFile -WorkingDirectory $script:AppDir `
                -WindowStyle Hidden -RedirectStandardOutput $script:ServerLog `
                -RedirectStandardError (Join-Path $script:LogDir 'server-error.log') | Out-Null
        } finally { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue }
    }
    $h = Wait-ForServer 40
    if ($h.Running) {
        Write-Log "✔ النظام يعمل على $(Get-AppUrl)"
        if (-not $h.Db) { Write-Log '⚠ تنبيه: قاعدة البيانات غير متصلة — النظام يعمل بالتخزين المحلي الاحتياطي. استخدم "فحص النظام".' }
    } else {
        throw 'لم يبدأ النظام خلال 40 ثانية. راجع "عرض سجلّ الخادم".'
    }
}

function Stop-NodeOnPort([int]$port) {
    $procId = Get-ListeningPid $port
    if ($procId) {
        $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -eq 'node') {
            Write-Log "إيقاف الخادم على المنفذ $port (العملية $procId)..."
            try {
                $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
                if ($cim -and $cim.ParentProcessId) {
                    $parent = Get-Process -Id $cim.ParentProcessId -ErrorAction SilentlyContinue
                    if ($parent -and $parent.ProcessName -eq 'cmd') {
                        & taskkill.exe /F /T /PID $cim.ParentProcessId 2>$null | Out-Null
                    }
                }
            } catch { }
            & taskkill.exe /F /T /PID $procId 2>$null | Out-Null
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        } elseif ($p) {
            Write-Log "⚠ المنفذ $port تستخدمه عملية أخرى ($($p.ProcessName)) — لم يتم إيقافها."
        }
    }
}

function Stop-App {
    $task = Get-AutoStartTask
    if ($task) {
        if ($task.State -eq 'Running') {
            Write-Log 'إيقاف مهمة التشغيل الدائم...'
        }
        Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 300
    }
    try {
        $appProcs = Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -and (
                    $_.CommandLine -match 'run-server\.cmd' -or
                    $_.CommandLine -match 'dist[\\/]server\.cjs' -or
                    ($_.CommandLine.IndexOf($script:AppDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
                )
            }
        foreach ($ap in $appProcs) {
            & taskkill.exe /F /T /PID $ap.ProcessId 2>$null | Out-Null
        }
    } catch { }
    $port = Get-AppPort
    # المنفذ الرئيسي + منافذ محتملة سابقة + منافذ وضع التطوير (Vite 5173 و HMR 24678)
    foreach ($p in (@($port, 5000, 5001, 5173, 24678) | Select-Object -Unique)) { Stop-NodeOnPort $p }
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-ListeningPid $port)) { break }
        Start-Sleep -Milliseconds 250
    }
    Write-Log '✔ النظام متوقف.'
}

function Restart-AppIfWasRunning([bool]$wasRunning) {
    if ($wasRunning) { Start-App }
}

# ---------------------------------------------------------------------
# التشغيل الدائم (مهمة مجدولة تبدأ مع تشغيل Windows)
# ---------------------------------------------------------------------
function Enable-AutoStart {
    $runner = Join-Path $script:AppDir 'tools\run-server.cmd'
    if (-not (Test-Path $runner)) { throw 'الملف tools\run-server.cmd غير موجود.' }
    $node = Get-NodeExe
    if (-not $node) { throw 'Node.js غير منصّب.' }
    if (-not (Test-Built)) { throw 'النظام غير مبني بعد. استخدم "إعادة البناء" أولاً.' }
    if (Test-AppResponds) { Stop-App }

    $action    = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/d /c ""' + $runner + '" "' + $node + '""') -WorkingDirectory $script:AppDir
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
                    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $script:TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
        -Description 'نظام إدارة الموارد البشرية — يعمل تلقائياً مع تشغيل Windows' -Force | Out-Null
    Write-Log '✔ تم تفعيل التشغيل الدائم: النظام يبدأ تلقائياً مع تشغيل الحاسبة، ويُعاد تشغيله إذا توقف.'
    if (-not (Get-FolderProtection)) {
        Write-Log '⚠ مجلدات النظام غير محمية: أي مستخدم على هذه الحاسبة يستطيع تعديل ملفات النظام التي تعمل بصلاحيات SYSTEM. يُنصح بحمايتها (زر "حماية المجلدات").'
    }
    Start-App
}

function Disable-AutoStart {
    $task = Get-AutoStartTask
    if (-not $task) { Write-Log 'التشغيل الدائم غير مفعّل أصلاً.'; return }
    $wasRunning = Test-AppResponds
    Stop-App
    Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false
    Write-Log '✔ تم إلغاء التشغيل الدائم.'
    if ($wasRunning -and (Confirm-Action 'هل تريد تشغيل النظام الآن بشكل عادي (يتوقف عند إعادة تشغيل الحاسبة)؟')) { Start-App }
}

# ---------------------------------------------------------------------
# جدار الحماية
# ---------------------------------------------------------------------
function Set-FirewallRule([bool]$enabled, [int]$port) {
    $ErrorActionPreference = 'Continue'
    netsh advfirewall firewall delete rule name="$($script:FwRuleName)" | Out-Null
    if ($enabled) {
        $null = netsh advfirewall firewall add rule name="$($script:FwRuleName)" dir=in action=allow protocol=TCP localport=$port
        Write-Log "✔ تم فتح المنفذ $port في جدار حماية Windows."
    }
}

function Test-FirewallRule {
    $ErrorActionPreference = 'Continue'
    $null = netsh advfirewall firewall show rule name="$($script:FwRuleName)" 2>$null
    return ($LASTEXITCODE -eq 0)
}

# ---------------------------------------------------------------------
# مراحل التنصيب والتحديث
# ---------------------------------------------------------------------
function Get-LockHash {
    $lock = Join-Path $script:AppDir 'package-lock.json'
    if (-not (Test-Path $lock)) { return '' }
    return (Get-FileHash -Path $lock -Algorithm SHA256).Hash
}

function Install-Dependencies([bool]$force) {
    $nm = Join-Path $script:AppDir 'node_modules'
    $stamp = Join-Path $nm '.hr-lock-hash'
    $hash = Get-LockHash
    if ((Test-Path $nm) -and -not $force -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $hash)) {
        Write-Log 'المكتبات محدّثة.'
        return
    }
    $npm = Get-NpmCmd
    if (-not $npm) { throw 'npm غير موجود. تأكد من تنصيب Node.js.' }
    $code = Invoke-Logged $npm 'ci --no-audit --no-fund' 'تنصيب المكتبات (يحتاج إنترنت، قد يستغرق دقائق)...'
    if ($code -ne 0) {
        Write-Log '⚠ فشل npm ci، محاولة npm install...'
        $code = Invoke-Logged $npm 'install --no-audit --no-fund' ''
    }
    Assert-Step $code 'فشل تنصيب المكتبات. تأكد من الاتصال بالإنترنت، أو استخدم "تحديث من ملف ZIP" بحزمة جاهزة.'
    $hash = Get-LockHash
    if ($hash) { [IO.File]::WriteAllText($stamp, $hash, $script:Utf8NoBom) }
}

function Invoke-Build {
    $npm = Get-NpmCmd
    if (-not $npm) { throw 'npm غير موجود.' }
    $code = Invoke-Logged $npm 'run build' 'بناء النظام (الواجهة + الخادم)...'
    Assert-Step $code 'فشل بناء النظام. راجع الأخطاء في السجلّ أعلاه.'
    Write-Log '✔ تم البناء.'
}

function Ensure-Prerequisites {
    $nodeVer = Get-NodeVersion
    if (-not $nodeVer -or -not (Test-NodeVersionOk $nodeVer)) {
        $msg = 'Node.js (الإصدار 20 أو أحدث) غير منصّب على هذه الحاسبة.'
        if (Test-WingetAvailable) {
            if (Confirm-Action ($msg + "`n`nهل تريد تنصيبه تلقائياً الآن؟ (يحتاج إنترنت)")) {
                $null = Invoke-Logged 'winget' 'install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements' 'تنصيب Node.js...'
                Update-PathFromRegistry
                $nodeVer = Get-NodeVersion
                if (-not $nodeVer) { throw 'لم يكتمل تنصيب Node.js. نصّبه يدوياً من nodejs.org ثم أعد المحاولة.' }
                Write-Log "✔ Node.js $nodeVer"
            } else { throw $msg }
        } else {
            Start-Process 'https://nodejs.org/ar/download'
            throw ($msg + ' فتحت لك صفحة التحميل. نصّب نسخة LTS ثم أعد المحاولة.')
        }
    } else {
        Write-Log "✔ Node.js $nodeVer"
    }

    if (-not (Get-PgBin)) {
        Start-Process 'https://www.postgresql.org/download/windows/'
        throw 'PostgreSQL غير منصّب. فتحت لك صفحة التحميل: نصّب الإصدار 16، واحفظ كلمة مرور المستخدم postgres، ثم أعد المحاولة.'
    }
    Write-Log "✔ PostgreSQL موجود في $(Get-PgBin)"
}

function Ensure-Database {
    $db = Get-DbSettings
    while ($true) {
        $r = Test-DbServer $db
        if ($r.Code -eq 0) { break }
        Write-Log "⚠ تعذّر الاتصال بـ PostgreSQL: $($r.Output)"
        $db = Show-DbDialog $db 'أدخل بيانات الاتصال بقاعدة البيانات (كلمة مرور postgres التي اخترتها عند تنصيب PostgreSQL)'
        if (-not $db) { throw 'تم إلغاء إعداد قاعدة البيانات.' }
    }
    Save-DbSettings $db
    Write-Log "✔ الاتصال بـ PostgreSQL ناجح ($($db.Host):$($db.Port))"
    if (-not (Test-DbExists $db)) {
        New-Database $db
        Write-Log "✔ تم إنشاء قاعدة البيانات $($db.Name) (الجداول تُنشأ تلقائياً عند أول تشغيل)"
    } else {
        Write-Log "✔ قاعدة البيانات $($db.Name) موجودة"
    }
}

function Invoke-FirstInstall {
    Write-Log '════ تنصيب النظام ════'
    Ensure-Prerequisites
    Ensure-EnvFile
    Ensure-Database
    Install-Dependencies $false
    Invoke-Build
    Write-Log '✔ اكتمل التنصيب.'
    if ((Get-AppHost) -eq '0.0.0.0') { Set-FirewallRule $true (Get-AppPort) }
    if (Confirm-Action "اكتمل التنصيب.`n`nهل تريد تفعيل التشغيل الدائم؟ (النظام يبدأ تلقائياً مع تشغيل الحاسبة)") {
        Enable-AutoStart
    } else {
        Start-App
    }
    Test-DefaultAdmin $true
    Start-Process (Get-AppUrl)
}

# عدد الملفات المعدّلة محلياً وغير المرفوعة إلى GitHub (الملفات المتتبَّعة فقط)
function Get-LocalChanges([string]$git) {
    $ErrorActionPreference = 'Continue'
    $lines = @(& $git -C $script:AppDir status --porcelain --untracked-files=no 2>$null | Where-Object { $_ })
    return $lines
}

function Invoke-UpdateFromGitHub {
    $ErrorActionPreference = 'Continue'
    $git = Get-GitExe
    if (-not $git) {
        if ((Test-WingetAvailable) -and (Confirm-Action "برنامج Git غير منصّب، وهو مطلوب للتحديث من GitHub.`n`nهل تريد تنصيبه الآن؟")) {
            $null = Invoke-Logged 'winget' 'install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements' 'تنصيب Git...'
            $git = Get-GitExe
        }
        if (-not $git) {
            Start-Process 'https://git-scm.com/download/win'
            throw 'نصّب Git من الصفحة التي فُتحت ثم أعد المحاولة.'
        }
    }
    Write-Log '════ التحديث من GitHub ════'
    Write-Log "المستودع: $($script:RepoUrl)"
    $before = Get-AppVersion
    $wasRunning = Test-AppResponds

    if (-not (Test-Path (Join-Path $script:AppDir '.git'))) {
        Assert-Step (Invoke-Logged $git ('init -b ' + $script:Branch) 'ربط المجلد بـ GitHub...') 'فشل git init.'
    }
    $null = Invoke-Logged $git 'remote remove origin' ''
    Assert-Step (Invoke-Logged $git ('remote add origin ' + $script:RepoUrl) '') 'فشل ضبط رابط المستودع.'
    $code = Invoke-Logged $git ('fetch origin ' + $script:Branch) 'تحميل آخر إصدار (قد يطلب منك تسجيل الدخول إلى GitHub أول مرة)...'
    Assert-Step $code 'فشل التحميل من GitHub. تأكد من الإنترنت ومن تسجيل الدخول بحسابك.'

    $local  = (& $git -C $script:AppDir rev-parse HEAD 2>$null)
    $remote = (& $git -C $script:AppDir rev-parse ('origin/' + $script:Branch) 2>$null)
    $changes = @(Get-LocalChanges $git)
    if ($local -and $local -eq $remote -and $changes.Count -eq 0 -and (Test-Built)) {
        Write-Log "✔ النظام محدّث مسبقاً (الإصدار $before)."
        return
    }

    # حماية التعديلات المحلية: لا تُمسح، بل تُحفظ في git stash ويمكن إرجاعها
    if ($changes.Count -gt 0) {
        $msg = "يوجد $($changes.Count) ملف معدّل على هذه الحاسبة ولم يُرفع إلى GitHub.`n`n" +
               "التحديث سيستبدلها بنسخة GitHub. التعديلات الحالية ستُحفظ في (git stash) ويمكن إرجاعها بالأمر:`n   git stash pop`n`n" +
               "إذا كانت هذه الحاسبة هي حاسبة التطوير، الأفضل أن ترفع تعديلاتك إلى GitHub أولاً.`n`nهل تريد المتابعة؟"
        if (-not (Confirm-Action $msg 'تعديلات محلية غير مرفوعة')) { Write-Log 'تم إلغاء التحديث. لم يتغير شيء.'; return }
        $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm')
        Assert-Step (Invoke-Logged $git ('stash push -m "control-panel before update ' + $stamp + '"') 'حفظ التعديلات المحلية في git stash...') 'تعذّر حفظ التعديلات المحلية. لم يتغير شيء.'
    }

    if ($wasRunning) { Stop-App }
    Assert-Step (Invoke-Logged $git ('reset --hard origin/' + $script:Branch) 'تطبيق التحديث...') 'فشل تطبيق التحديث.'
    $null = Invoke-Logged $git ('branch --set-upstream-to=origin/' + $script:Branch + ' ' + $script:Branch) ''
    Ensure-EnvFile
    Install-Dependencies $false
    Invoke-Build
    Write-Log "✔ تم التحديث: $before ← $(Get-AppVersion)"
    Write-Log '⚠ أغلق لوحة التحكم وافتحها من جديد حتى تعمل بنسختها المحدّثة.'
    Restart-AppIfWasRunning $wasRunning
}

# يفك الحزمة داخل $dest\x ويعيد مسار مجلد الاستخراج
function Expand-ZipTo([string]$zip, [string]$dest) {
    $extractDir = Join-Path $dest 'x'
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path $tar) {
        Copy-Item -LiteralPath $zip -Destination (Join-Path $dest 'package.zip')
        $code = Invoke-Logged $tar '-xf ..\package.zip' 'فك ضغط الحزمة...' $extractDir
        Assert-Step $code 'فشل فك ضغط الملف.'
    } else {
        Write-Log 'فك ضغط الحزمة...'
        Expand-Archive -LiteralPath $zip -DestinationPath $extractDir -Force
    }
    return $extractDir
}

function Invoke-UpdateFromZip {
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Filter = 'حزمة النظام (*.zip)|*.zip'
    $dlg.Title = 'اختر حزمة التحديث'
    if ($dlg.ShowDialog() -ne 'OK') { return }
    $zip = $dlg.FileName

    Write-Log '════ التحديث من ملف ZIP ════'
    $before = Get-AppVersion
    $wasRunning = Test-AppResponds
    $tmp = Join-Path $env:TEMP ('hr-update-' + [Guid]::NewGuid().ToString('N'))
    try {
        $root = Expand-ZipTo $zip $tmp
        if (-not (Test-Path (Join-Path $root 'server.ts'))) {
            $sub = Get-ChildItem $root -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'server.ts') } | Select-Object -First 1
            if (-not $sub) { throw 'الملف لا يحتوي على نظام الموارد البشرية (لا يوجد server.ts).' }
            $root = $sub.FullName
        }
        $hasModules = Test-Path (Join-Path $root 'node_modules')
        $hasDist    = Test-Path (Join-Path $root $script:ServerFile)

        if ($wasRunning) { Stop-App }
        foreach ($d in @('dist', 'src', 'public', 'tools')) {
            $p = Join-Path $script:AppDir $d
            if (Test-Path (Join-Path $root $d)) { if (Test-Path $p) { Remove-Item $p -Recurse -Force } }
        }
        if ($hasModules) {
            $p = Join-Path $script:AppDir 'node_modules'
            if (Test-Path $p) { Write-Log 'حذف المكتبات القديمة...'; Remove-Item $p -Recurse -Force }
        }
        $code = Invoke-Logged 'robocopy' ('"' + $root + '" "' + $script:AppDir + '" /E /NFL /NDL /NJH /NJS /NP /XD .git data logs backups temp /XF .env') 'نسخ الملفات...'
        if ($code -ge 8) { throw 'فشل نسخ الملفات.' }
    } finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    Ensure-EnvFile
    if ($hasModules) {
        $hash = Get-LockHash
        if ($hash) { [IO.File]::WriteAllText((Join-Path $script:AppDir 'node_modules\.hr-lock-hash'), $hash, $script:Utf8NoBom) }
    } else {
        Install-Dependencies $true
    }
    if (-not $hasDist) { Invoke-Build }
    Write-Log "✔ تم التحديث: $before ← $(Get-AppVersion)"
    Write-Log '⚠ أغلق لوحة التحكم وافتحها من جديد حتى تعمل بنسختها المحدّثة.'
    Restart-AppIfWasRunning $wasRunning
}

function New-OfflinePackage {
    Write-Log '════ تجهيز حزمة للسيرفر غير المتصل بالإنترنت ════'
    Install-Dependencies $false
    Invoke-Build
    $name = 'hr-system-' + (Get-Date).ToString('yyyyMMdd-HHmm') + '.zip'
    $out = Join-Path (Split-Path $script:AppDir) $name
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (-not (Test-Path $tar)) { throw 'أداة tar غير موجودة (تحتاج Windows 10 إصدار 1803 أو أحدث).' }
    # لا تدخل الحزمة: الإعدادات والبيانات والنسخ والسجلات وملفات البيانات الأصلية
    $excludes = '--exclude=./.env --exclude=./.git --exclude=./data --exclude=./logs --exclude=./backups --exclude=./temp --exclude=*.accdb --exclude=*.map'
    $code = Invoke-Logged $tar ('-a -c -f "..\' + $name + '" ' + $excludes + ' .') 'ضغط الحزمة (قد يستغرق دقائق)...' $script:AppDir
    Assert-Step $code 'فشل إنشاء الحزمة.'
    Write-Log "✔ الحزمة جاهزة: $out"
    Show-Info "الحزمة جاهزة:`n$out`n`nانقلها إلى السيرفر بـ USB، ثم من لوحة التحكم هناك اختر ""تحديث من ملف ZIP""."
    Start-Process 'explorer.exe' ('/select,"' + $out + '"')
}

# ---------------------------------------------------------------------
# النسخ الاحتياطي والاستعادة
#  كل نسخة = مجلد فيه: database.dump (قاعدة البيانات) + data\ (التخزين المحلي المشفّر)
#  + env.txt (الإعدادات، وفيها مفتاح التشفير) + backup-info.json
# ---------------------------------------------------------------------
function Save-DataSnapshot([string]$folder) {
    if (-not (Test-Path $script:DataDir)) { return }
    $code = Invoke-Logged 'robocopy' ('"' + $script:DataDir + '" "' + (Join-Path $folder 'data') + '" /E /NFL /NDL /NJH /NJS /NP') 'نسخ مجلد البيانات المحلي (data)...'
    if ($code -ge 8) { throw 'فشل نسخ مجلد البيانات.' }
}

function New-Backup([string]$Type = 'manual') {
    $bin = Get-PgBin
    if (-not $bin) { throw 'PostgreSQL غير موجود.' }
    $db = Get-DbSettings
    $name = (Get-Date).ToString('yyyy-MM-dd_HHmm')
    if ($Type -eq 'pre-restore') { $name = (Get-Date).ToString('yyyy-MM-dd_HHmmss') + '_before-restore' }
    $folder = Join-Path $script:BackupDir $name
    if (Test-Path $folder) { $folder = $folder + '_' + (Get-Date).ToString('ss') }
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    Write-Log '════ نسخة احتياطية ════'
    $env:PGPASSWORD = $db.Password
    try {
        $code = Invoke-Logged (Join-Path $bin 'pg_dump.exe') ('-h ' + $db.Host + ' -p ' + $db.Port + ' -U ' + $db.User + ' -w -Fc -f database.dump ' + $db.Name) 'نسخ قاعدة البيانات...' $folder
    } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    Assert-Step $code 'فشل نسخ قاعدة البيانات.'

    Save-DataSnapshot $folder
    Copy-Item $script:EnvFile (Join-Path $folder 'env.txt') -ErrorAction SilentlyContinue
    $info = '{"at":"' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz') + '","type":"' + $Type + '","machine":"' + $env:COMPUTERNAME + '"}'
    [IO.File]::WriteAllText((Join-Path $folder 'backup-info.json'), $info, $script:Utf8NoBom)
    $sizeMb = [math]::Round(((Get-ChildItem $folder -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
    Write-Log "✔ النسخة الاحتياطية جاهزة ($sizeMb MB): $folder"
    if ($Type -eq 'manual') { Start-Process 'explorer.exe' ('"' + $folder + '"') }
    return $folder
}

function Select-BackupFolder([string]$description) {
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = $description
    if (Test-Path $script:BackupDir) { $dlg.SelectedPath = $script:BackupDir }
    if ($dlg.ShowDialog() -ne 'OK') { return $null }
    $folder = $dlg.SelectedPath
    if (-not (Test-Path (Join-Path $folder 'database.dump'))) { throw 'المجلد المختار لا يحتوي على الملف database.dump.' }
    return $folder
}

# نسخة احتياطية لنقلها إلى قرص خارجي أو حاسبة أخرى
function Export-BackupCopy {
    $folder = Select-BackupFolder 'اختر مجلد النسخة الاحتياطية المراد تصديرها (يحتوي على database.dump)'
    if (-not $folder) { return }
    $dlg2 = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg2.Description = 'اختر مكان حفظ النسخة (مثلاً قرص خارجي)'
    if ($dlg2.ShowDialog() -ne 'OK') { return }
    $dest = Join-Path $dlg2.SelectedPath ('hr-backup-' + (Split-Path $folder -Leaf))
    Write-Log ('════ تصدير نسخة إلى ' + $dest + ' ════')
    $code = Invoke-Logged 'robocopy' ('"' + $folder + '" "' + $dest + '" /E /NFL /NDL /NJH /NJS /NP') 'نسخ النسخة...'
    if ($code -ge 8) { throw 'فشل التصدير.' }
    Write-Log ('✔ النسخة جاهزة: ' + $dest + ' (تُستعاد من زر "استعادة نسخة" على أي حاسبة)')
    Write-Log '⚠ الملف env.txt داخل النسخة فيه كلمات المرور ومفتاح التشفير: احفظ القرص في مكان آمن.'
    Start-Process 'explorer.exe' ('"' + $dest + '"')
}

# فحص أن كل نسخة سليمة وقابلة للاستعادة (pg_restore --list)
function Test-BackupFiles {
    $ErrorActionPreference = 'Continue'
    Write-Log '════ فحص النسخ الاحتياطية ════'
    $bin = Get-PgBin
    if (-not $bin) { throw 'PostgreSQL غير موجود.' }
    $folders = @(Get-ChildItem $script:BackupDir -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'database.dump') } | Sort-Object Name -Descending)
    if ($folders.Count -eq 0) { Write-Log 'لا توجد نسخ احتياطية بعد.'; return }
    $bad = 0
    foreach ($f in $folders) {
        $dump = Join-Path $f.FullName 'database.dump'
        $size = [math]::Round((Get-Item $dump).Length / 1MB, 1)
        Push-Location $f.FullName
        try { $null = & (Join-Path $bin 'pg_restore.exe') --list database.dump 2>&1; $ok = ($LASTEXITCODE -eq 0) } finally { Pop-Location }
        if ($ok -and (Get-Item $dump).Length -gt 0) { Write-Log "✔ $($f.Name)  ($size MB)" }
        else { Write-Log "✘ $($f.Name) — ملف قاعدة البيانات تالف"; $bad++ }
    }
    if ($bad -gt 0) { Write-Log '✘ وُجدت نسخ تالفة (أعلاه). خذ نسخة احتياطية جديدة الآن.' } else { Write-Log "✔ كل النسخ سليمة ($($folders.Count) نسخة)." }
}

# ---------------------------------------------------------------------
# النسخ الاحتياطي المجدول (مهمة Windows يومية باسم HRSystemBackup تعمل بحساب SYSTEM)
# ---------------------------------------------------------------------
function Get-BackupSchedule {
    $s = @{ Enabled = $false; Time = '23:00'; Keep = 14 }
    if (Test-Path $script:BackupSchedule) {
        try {
            $j = [IO.File]::ReadAllText($script:BackupSchedule, $script:Utf8NoBom) | ConvertFrom-Json
            $s.Enabled = [bool]$j.enabled
            if ($j.time) { $s.Time = [string]$j.time }
            if ($j.keep) { $s.Keep = [int]$j.keep }
        } catch { }
    }
    return $s
}

function Save-BackupSchedule([bool]$enabled, [string]$time, [int]$keep) {
    New-Item -ItemType Directory -Force -Path $script:BackupDir | Out-Null
    $en = 'false'
    if ($enabled) { $en = 'true' }
    $json = '{"enabled":' + $en + ',"time":"' + $time + '","keep":' + $keep + ',"since":"' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz') + '"}'
    [IO.File]::WriteAllText($script:BackupSchedule, $json, $script:Utf8NoBom)
}

function ConvertTo-JsonText([string]$v) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $v.ToCharArray()) {
        $c = [int]$ch
        if ($ch -eq '"') { [void]$sb.Append('\"') }
        elseif ($ch -eq '\') { [void]$sb.Append('\\') }
        elseif ($c -lt 32) { [void]$sb.Append('\u' + $c.ToString('x4')) }
        else { [void]$sb.Append($ch) }
    }
    return '"' + $sb.ToString() + '"'
}

function Write-BackupRunResult([bool]$ok, [string]$message) {
    try {
        New-Item -ItemType Directory -Force -Path $script:BackupDir | Out-Null
        $okText = 'false'
        if ($ok) { $okText = 'true' }
        $json = '{"at":"' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz') + '","type":"scheduled","ok":' + $okText + ',"error":' + (ConvertTo-JsonText $message) + ',"machine":' + (ConvertTo-JsonText $env:COMPUTERNAME) + '}'
        [IO.File]::WriteAllText((Join-Path $script:BackupDir 'last-run.json'), $json, $script:Utf8NoBom)
    } catch { }
}

function Get-LastBackupText {
    $last = Get-ChildItem $script:BackupDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'database.dump') } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $text = 'آخر نسخة: لا توجد'
    if ($last) { $text = 'آخر نسخة: ' + $last.LastWriteTime.ToString('yyyy-MM-dd HH:mm') }
    $lr = Join-Path $script:BackupDir 'last-run.json'
    if (Test-Path $lr) {
        try { if (-not ([IO.File]::ReadAllText($lr, $script:Utf8NoBom) | ConvertFrom-Json).ok) { $text += ' (فشل آخر نسخ مجدول!)' } } catch { }
    }
    return $text
}

function Invoke-ScheduledBackup {
    $ErrorActionPreference = 'Continue'
    Save-PanelLog ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + " ════ نسخة احتياطية مجدولة ════`r`n")
    $folder = New-Backup 'scheduled'
    # الإبقاء على آخر (Keep) نسخ مجدولة فقط؛ النسخ اليدوية لا تُحذف
    $keep = (Get-BackupSchedule).Keep
    $scheduled = @(Get-ChildItem -Path $script:BackupDir -Directory -ErrorAction SilentlyContinue | Where-Object {
        $f = Join-Path $_.FullName 'backup-info.json'
        (Test-Path $f) -and ((Get-Content $f -Raw -Encoding UTF8) -match '"type":"scheduled"')
    } | Sort-Object Name -Descending)
    if ($scheduled.Count -gt $keep) {
        foreach ($old in ($scheduled | Select-Object -Skip $keep)) {
            Remove-Item -Recurse -Force $old.FullName -ErrorAction SilentlyContinue
            Save-PanelLog ("   حُذفت نسخة مجدولة قديمة: " + $old.FullName + "`r`n")
        }
    }
    return $folder
}

function Invoke-BackupScheduleDialog {
    $cur = Get-BackupSchedule
    $f = New-DialogForm 'النسخ الاحتياطي المجدول' 420 230
    $chk = New-Object System.Windows.Forms.CheckBox
    $chk.Text = 'أخذ نسخة احتياطية تلقائياً كل يوم'
    $chk.Checked = $cur.Enabled
    $chk.Location = New-Object System.Drawing.Point(20, 16)
    $chk.Size = New-Object System.Drawing.Size(380, 26)
    $f.Controls.Add($chk)
    $l1 = New-Object System.Windows.Forms.Label
    $l1.Text = 'الوقت (ساعة:دقيقة، 24 ساعة)'
    $l1.Location = New-Object System.Drawing.Point(20, 58)
    $l1.Size = New-Object System.Drawing.Size(220, 24)
    $t1 = New-Object System.Windows.Forms.TextBox
    $t1.Text = $cur.Time
    $t1.Location = New-Object System.Drawing.Point(250, 55)
    $t1.Size = New-Object System.Drawing.Size(140, 26)
    $l2 = New-Object System.Windows.Forms.Label
    $l2.Text = 'عدد النسخ المجدولة المحفوظة'
    $l2.Location = New-Object System.Drawing.Point(20, 98)
    $l2.Size = New-Object System.Drawing.Size(220, 24)
    $t2 = New-Object System.Windows.Forms.TextBox
    $t2.Text = [string]$cur.Keep
    $t2.Location = New-Object System.Drawing.Point(250, 95)
    $t2.Size = New-Object System.Drawing.Size(140, 26)
    $f.Controls.Add($l1); $f.Controls.Add($t1); $f.Controls.Add($l2); $f.Controls.Add($t2)
    Add-DialogButtons $f 170
    if ($f.ShowDialog($script:MainForm) -ne 'OK') { return }

    $time = $t1.Text.Trim()
    if ($time -notmatch '^([01]?\d|2[0-3]):[0-5]\d$') { throw 'اكتب الوقت بالشكل 23:00' }
    $keep = 0
    if (-not [int]::TryParse($t2.Text.Trim(), [ref]$keep) -or $keep -lt 1) { throw 'عدد النسخ يجب أن يكون رقماً أكبر من صفر' }

    Unregister-ScheduledTask -TaskName $script:BackupTask -Confirm:$false -ErrorAction SilentlyContinue
    if ($chk.Checked) {
        $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $action    = New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '" -ScheduledBackup') -WorkingDirectory $script:AppDir
        $trigger   = New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($time.PadLeft(5, '0'), 'HH:mm', $null))
        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4)
        Register-ScheduledTask -TaskName $script:BackupTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
            -Description 'نسخة احتياطية يومية لنظام إدارة الموارد البشرية' | Out-Null
        Save-BackupSchedule $true $time $keep
        Write-Log "✔ فُعّل النسخ الاحتياطي اليومي الساعة $time مع الإبقاء على آخر $keep نسخة مجدولة."
    } else {
        Save-BackupSchedule $false $time $keep
        Write-Log '✔ أُلغي النسخ الاحتياطي المجدول. النسخ اليدوي متاح من زر "نسخة احتياطية".'
    }
}

# أخطاء pg_restore الحقيقية من آخر أمر (يُتجاهل خطأ ملكية الإضافات فهو لا يؤثر على البيانات)
function Get-RestoreErrors {
    $errs = @()
    if ($script:LastOutput) {
        foreach ($l in $script:LastOutput) {
            if ($l -match 'pg_restore: error:' -and $l -notmatch '(?i)extension') { $errs += $l }
        }
    }
    return $errs
}

# العمليات الحساسة (الاستعادة) لا تعمل من لوحة فُتحت قبل تحديث النظام
function Assert-PanelCurrent {
    $now = $null
    try { $now = (Get-Item -LiteralPath $script:PanelFile).LastWriteTimeUtc } catch { return }
    if ($now -ne $script:PanelStamp) {
        throw 'تم تحديث النظام بعد فتح لوحة التحكم، وهي ما زالت تعمل بنسختها القديمة. أغلق لوحة التحكم وافتحها من جديد، ثم أعد المحاولة.'
    }
}

# تفريغ قاعدة البيانات قبل الاستعادة حتى لا تختلط بيانات النسخة بالبيانات الحالية
function Clear-Database([string]$database) {
    $db = Get-DbSettings
    $sql = 'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC;'
    Write-Log '── تفريغ قاعدة البيانات قبل الاستعادة...'
    $r = Invoke-Psql $db $database $sql
    if ($r.Code -ne 0) { throw ('تعذّر تفريغ قاعدة البيانات قبل الاستعادة (لم يتغير شيء): ' + $r.Output) }
}

function Restore-Backup {
    Assert-PanelCurrent
    $folder = Select-BackupFolder 'اختر مجلد النسخة الاحتياطية (يحتوي على database.dump)'
    if (-not $folder) { return }
    if (-not (Confirm-Action "سيرجع النظام إلى حالته في النسخة:`n$folder`n`nكل ما أُدخل بعد تاريخ هذه النسخة سيختفي من النظام.`nقبل الاستعادة تُحفظ تلقائياً نسخة أمان من البيانات الحالية، فيمكن الرجوع إليها من الزر نفسه.`n`nهل أنت متأكد؟" 'استعادة نسخة احتياطية')) { return }

    Write-Log '════ استعادة نسخة احتياطية ════'
    $wasRunning = Test-AppResponds
    if ($wasRunning) { Stop-App }
    Write-Log '── نسخة أمان من البيانات الحالية قبل الاستعادة...'
    $safety = New-Backup 'pre-restore'
    $db = Get-DbSettings
    $bin = Get-PgBin
    Clear-Database $db.Name
    $env:PGPASSWORD = $db.Password
    try {
        $rc = Invoke-Logged (Join-Path $bin 'pg_restore.exe') ('-h ' + $db.Host + ' -p ' + $db.Port + ' -U ' + $db.User + ' -w --no-owner --single-transaction --exit-on-error -d ' + $db.Name + ' database.dump') 'استعادة قاعدة البيانات...' $folder
    } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    $errs = @(Get-RestoreErrors)
    if ($errs.Count -gt 0) {
        throw ('فشلت استعادة قاعدة البيانات (' + $errs.Count + ' خطأ، أولها: ' + $errs[0] + ').' + "`n" + 'النظام متوقف. البيانات كما كانت قبل الاستعادة محفوظة في:' + "`n" + $safety + "`n" + 'استعدها من زر "استعادة نسخة" لإرجاع النظام كما كان.')
    }
    if ($rc -ne 0) { Write-Log '⚠ ظهرت تنبيهات أثناء الاستعادة، راجع السجلّ أعلاه.' }

    # مجلد البيانات المحلي (data) ومفتاح تشفيره يجب أن يتطابقا
    $srcData = Join-Path $folder 'data'
    if (Test-Path $srcData) {
        $code = Invoke-Logged 'robocopy' ('"' + $srcData + '" "' + $script:DataDir + '" /E /NFL /NDL /NJH /NJS /NP') 'استعادة مجلد البيانات المحلي...'
        if ($code -ge 8) { throw 'فشل استعادة مجلد البيانات.' }
        $envTxt = Join-Path $folder 'env.txt'
        if (Test-Path $envTxt) {
            $oldKey = $null
            foreach ($line in [IO.File]::ReadAllLines($envTxt, $script:Utf8NoBom)) {
                if ($line -match '^\s*LOCAL_DB_ENCRYPTION_KEY\s*=\s*(.+)$') { $oldKey = $matches[1].Trim() }
            }
            $curKey = (Read-EnvFile)['LOCAL_DB_ENCRYPTION_KEY']
            if ((Test-HexKey $oldKey) -and $oldKey -ne $curKey) {
                Set-EnvValues @{ LOCAL_DB_ENCRYPTION_KEY = $oldKey }
                Write-Log '✔ ضُبط مفتاح التشفير من النسخة حتى يُقرأ ملف البيانات المحلي المستعاد.'
            }
        }
    }
    Write-Log ('✔ تمت الاستعادة. البيانات كما كانت قبلها محفوظة في: ' + $safety)
    Restart-AppIfWasRunning $wasRunning
}

# ---------------------------------------------------------------------
# حساب مدير النظام (tools\admin-tool.cjs)
# ---------------------------------------------------------------------
function Invoke-AdminTool([string]$arguments) {
    $ErrorActionPreference = 'Continue'
    $node = Get-NodeExe
    if (-not $node) { return @() }
    Push-Location $script:AppDir
    try { $out = & $node 'tools\admin-tool.cjs' $arguments.Split(' ') 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
    return $out
}

# USERS=عدد الحسابات، DEFAULT_ADMIN=1 إذا كان admin ما زال بكلمة المرور الافتراضية admin123
function Get-AdminStatus {
    $r = @{ Users = -1; DefaultAdmin = $false }
    if (-not (Test-Path (Join-Path $script:AppDir 'node_modules'))) { return $r }
    $out = Invoke-AdminTool 'status'
    foreach ($l in $out) {
        if ($l -match '^USERS=(\d+)') { $r.Users = [int]$matches[1] }
        if ($l -match '^DEFAULT_ADMIN=1') { $r.DefaultAdmin = $true }
    }
    return $r
}

function Test-DefaultAdmin([bool]$offerChange) {
    $s = Get-AdminStatus
    if ($s.DefaultAdmin) {
        Write-Log '⚠ تنبيه أمني: حساب admin ما زال بكلمة المرور الافتراضية admin123.'
        if ($offerChange) { [void](Invoke-CreateAdmin 'حساب admin ما زال بكلمة المرور الافتراضية (admin123). غيّرها الآن.') }
    }
}

function Show-AdminDialog([string]$hint) {
    $f = New-DialogForm 'حساب مدير النظام' 460 300
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $hint
    $lbl.Location = New-Object System.Drawing.Point(20, 12)
    $lbl.Size = New-Object System.Drawing.Size(420, 44)
    $f.Controls.Add($lbl)
    $fields = @(
        @{ Key = 'Username'; Label = 'اسم المستخدم'; Secret = $false },
        @{ Key = 'FullName'; Label = 'الاسم الكامل'; Secret = $false },
        @{ Key = 'Password'; Label = 'كلمة المرور'; Secret = $true },
        @{ Key = 'Confirm';  Label = 'تأكيد كلمة المرور'; Secret = $true }
    )
    $boxes = @{}
    $y = 64
    foreach ($fd in $fields) {
        $l = New-Object System.Windows.Forms.Label
        $l.Text = $fd.Label
        $l.Location = New-Object System.Drawing.Point(20, ($y + 4))
        $l.Size = New-Object System.Drawing.Size(130, 24)
        $t = New-Object System.Windows.Forms.TextBox
        $t.Location = New-Object System.Drawing.Point(160, $y)
        $t.Size = New-Object System.Drawing.Size(270, 26)
        if ($fd.Key -ne 'FullName') { $t.RightToLeft = 'No' }
        if ($fd.Secret) { $t.UseSystemPasswordChar = $true }
        $f.Controls.Add($l); $f.Controls.Add($t)
        $boxes[$fd.Key] = $t
        $y += 40
    }
    $boxes['Username'].Text = 'admin'
    $boxes['FullName'].Text = 'مدير النظام'
    Add-DialogButtons $f ($y + 8)
    while ($true) {
        if ($f.ShowDialog($script:MainForm) -ne 'OK') { return $null }
        $user = $boxes['Username'].Text.Trim()
        $pass = $boxes['Password'].Text
        if ($user -notmatch '^[A-Za-z0-9._-]{3,50}$') { Show-Error 'اسم المستخدم 3 أحرف على الأقل بالحروف الإنجليزية والأرقام فقط.'; continue }
        if ($pass -ne $boxes['Confirm'].Text) { Show-Error 'كلمتا المرور غير متطابقتين.'; continue }
        if ($pass.Length -lt 8 -or $pass -notmatch '[0-9]' -or $pass -notmatch '[^0-9]') { Show-Error 'كلمة المرور 8 أحرف على الأقل وتحتوي على أرقام وحروف.'; continue }
        if ($pass -eq 'admin123') { Show-Error 'لا يمكن استخدام كلمة المرور الافتراضية.'; continue }
        return @{ Username = $user; FullName = $boxes['FullName'].Text.Trim(); Password = $pass }
    }
}

function Invoke-CreateAdmin([string]$hint) {
    $node = Get-NodeExe
    if (-not $node) { throw 'Node.js غير منصّب.' }
    if (-not (Test-Path (Join-Path $script:AppDir 'node_modules'))) { throw 'النظام غير منصّب بعد. استخدم "تنصيب أول مرة".' }
    if (-not (Test-AppDb)) { throw 'قاعدة البيانات غير متصلة. شغّل النظام مرة واحدة (حتى تُنشأ الجداول) وتأكد من إعدادات قاعدة البيانات.' }
    $a = Show-AdminDialog $hint
    if (-not $a) { return $false }
    $env:HR_ADMIN_USERNAME = $a.Username
    $env:HR_ADMIN_FULLNAME = $a.FullName
    $env:HR_ADMIN_PASSWORD = $a.Password
    try {
        $code = Invoke-Logged $node 'tools\admin-tool.cjs set' 'حفظ حساب مدير النظام...'
    } finally {
        Remove-Item Env:HR_ADMIN_USERNAME, Env:HR_ADMIN_FULLNAME, Env:HR_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    }
    Assert-Step $code 'فشل حفظ حساب مدير النظام.'
    Write-Log "✔ يمكنك الآن الدخول إلى النظام باسم المستخدم: $($a.Username)"
    return $true
}

# ---------------------------------------------------------------------
# حماية مجلدات النظام بصلاحيات Windows
#  - مجلد النظام: القراءة والتشغيل فقط للمستخدمين، والتحكم الكامل لـ SYSTEM والمدراء
#  - data والنسخ الاحتياطية والسجلات و .env: لا يفتحها إلا SYSTEM والمدراء
#  تُستخدم معرّفات SID حتى تعمل على Windows بأي لغة.
# ---------------------------------------------------------------------
$script:SidSystem = '*S-1-5-18'
$script:SidAdmins = '*S-1-5-32-544'
$script:SidAuthUsers = '*S-1-5-11'

function Get-PrivateFolders {
    $list = @()
    foreach ($p in @($script:DataDir, $script:BackupDir, $script:LogDir, (Join-Path $script:AppDir 'temp'))) {
        if ($p -and (Test-Path $p)) { $list += (Resolve-Path $p).Path }
    }
    return $list
}

function Get-FolderProtection {
    if (-not (Test-Path $script:DataDir)) { return $false }
    try { return [bool](Get-Acl -Path $script:DataDir).AreAccessRulesProtected } catch { return $false }
}

function Invoke-ProtectFolders {
    $ErrorActionPreference = 'Continue'
    New-Item -ItemType Directory -Force -Path $script:DataDir, $script:BackupDir | Out-Null
    $msg = "سيتم قفل مجلدات النظام بصلاحيات Windows:`n`n" +
        "• مجلد النظام: يفتحه المستخدمون للقراءة والتشغيل فقط (بدون تعديل أو حذف).`n" +
        "• البيانات والنسخ الاحتياطية والسجلات وملف الإعدادات: لا يفتحها أحد إلا النظام نفسه، ومدراء الحاسبة بعد موافقة Windows.`n`n" +
        "النظام والنسخ المجدول ولوحة التحكم تبقى تعمل كالمعتاد. هل توافق؟"
    if (-not (Confirm-Action $msg 'حماية المجلدات')) { return }
    Write-Log '════ حماية مجلدات النظام ════'
    $grantAll = '"' + $script:SidSystem + ':(OI)(CI)F" "' + $script:SidAdmins + ':(OI)(CI)F"'
    $code = Invoke-Logged 'icacls' ('"' + $script:AppDir + '" /inheritance:r /grant:r ' + $grantAll + ' "' + $script:SidAuthUsers + ':(OI)(CI)RX"') 'قفل مجلد النظام...'
    if ($code -ne 0) { throw 'تعذّر تغيير صلاحيات مجلد النظام.' }
    $code = Invoke-Logged 'icacls' ('"' + $script:AppDir + '\*" /reset /T /C /Q') 'تطبيق الصلاحيات على كل الملفات (قد يستغرق دقائق بسبب node_modules)...'
    if ($code -ne 0) { Write-Log '⚠ بعض الملفات لم تُحدَّث صلاحياتها (قد تكون مفتوحة في برنامج آخر).' }
    foreach ($p in (Get-PrivateFolders)) {
        $code = Invoke-Logged 'icacls' ('"' + $p + '" /inheritance:r /grant:r ' + $grantAll) ('قفل ' + $p + '...')
        if ($code -ne 0) { throw ('تعذّر قفل ' + $p) }
        [void](Invoke-Logged 'icacls' ('"' + $p + '" /setowner "' + $script:SidAdmins + '" /T /C /Q') '')
    }
    if (Test-Path $script:EnvFile) {
        $null = Invoke-Logged 'icacls' ('"' + $script:EnvFile + '" /inheritance:r /grant:r "' + $script:SidSystem + ':F" "' + $script:SidAdmins + ':F"') 'قفل ملف الإعدادات .env...'
    }
    Write-Log '✔ مجلدات النظام محمية. لإلغاء الحماية (مثلاً للتطوير على هذه الحاسبة): زر "إلغاء الحماية".'
}

function Invoke-UnprotectFolders {
    $ErrorActionPreference = 'Continue'
    if (-not (Confirm-Action "ستعود صلاحيات مجلدات النظام كما يرثها من القرص. هل توافق؟" 'إلغاء حماية المجلدات')) { return }
    Write-Log '════ إلغاء حماية مجلدات النظام ════'
    $code = Invoke-Logged 'icacls' ('"' + $script:AppDir + '" /reset /T /C /Q') 'إرجاع صلاحيات مجلد النظام...'
    if ($code -ne 0) { Write-Log '⚠ بعض الملفات لم تُحدَّث صلاحياتها.' } else { Write-Log '✔ أُلغيت حماية المجلدات.' }
}

# ---------------------------------------------------------------------
# فحص النظام
# ---------------------------------------------------------------------
function Invoke-SystemCheck {
    $ErrorActionPreference = 'Continue'
    Write-Log '════ فحص النظام ════'
    $ok = '✔'; $bad = '✘'; $warn = '⚠'
    Write-Log "مجلد النظام: $($script:AppDir)"
    Write-Log "إصدار النظام: $(Get-AppVersion)"

    $nv = Get-NodeVersion
    if ($nv -and (Test-NodeVersionOk $nv)) { Write-Log "$ok Node.js $nv" }
    elseif ($nv) { Write-Log "$bad Node.js $nv قديم — المطلوب 20 أو أحدث" }
    else { Write-Log "$bad Node.js غير منصّب" }

    $bin = Get-PgBin
    if ($bin) { Write-Log "$ok أدوات PostgreSQL: $bin" } else { Write-Log "$bad PostgreSQL غير منصّب" }

    $svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($svc) {
        if ($svc.Status -eq 'Running') { Write-Log "$ok خدمة PostgreSQL ($($svc.Name)) تعمل" }
        else { Write-Log "$bad خدمة PostgreSQL ($($svc.Name)) متوقفة — شغّلها من services.msc" }
    }

    if (Test-Path $script:EnvFile) {
        Write-Log "$ok ملف الإعدادات .env موجود"
        $cfg = Read-EnvFile
        if (-not $cfg['JWT_SECRET'] -or $cfg['JWT_SECRET'] -like 'your_*') { Write-Log "$bad JWT_SECRET غير مضبوط" }
        if (-not (Test-HexKey $cfg['LOCAL_DB_ENCRYPTION_KEY'])) { Write-Log "$bad LOCAL_DB_ENCRYPTION_KEY غير صالح (يجب 64 حرفاً hex)" }
    } else { Write-Log "$bad ملف الإعدادات .env غير موجود — استخدم ""تنصيب أول مرة""" }

    if ($bin -and (Test-Path $script:EnvFile)) {
        $db = Get-DbSettings
        $r = Test-DbServer $db
        if ($r.Code -eq 0) {
            Write-Log "$ok الاتصال بـ PostgreSQL ($($db.Host):$($db.Port)) ناجح"
            if (Test-DbExists $db) {
                Write-Log "$ok قاعدة البيانات $($db.Name) موجودة"
                $cnt = Invoke-Psql $db $db.Name 'select count(*) from employees'
                if ($cnt.Code -eq 0) { Write-Log "   عدد الموظفين: $($cnt.Output)" }
            } else { Write-Log "$bad قاعدة البيانات $($db.Name) غير موجودة" }
        } else {
            Write-Log "$bad تعذّر الاتصال بـ PostgreSQL: $($r.Output)"
        }
    }

    $localFile = Join-Path $script:DataDir 'local_storage.json'
    if (Test-Path $localFile) { Write-Log ("   التخزين المحلي الاحتياطي: " + [math]::Round((Get-Item $localFile).Length / 1MB, 1) + ' MB') }

    if (Test-Path (Join-Path $script:AppDir 'node_modules')) { Write-Log "$ok المكتبات منصّبة" } else { Write-Log "$bad المكتبات غير منصّبة" }
    if (Test-Built) { Write-Log "$ok النظام مبني (آخر بناء: $((Get-Item (Join-Path $script:AppDir $script:ServerFile)).LastWriteTime.ToString('yyyy-MM-dd HH:mm')))" } else { Write-Log "$bad النظام غير مبني" }
    if (Get-FolderProtection) { Write-Log "$ok مجلدات النظام محمية بصلاحيات Windows" } else { Write-Log "$warn مجلدات النظام غير محمية (زر ""حماية المجلدات"")" }
    $as = Get-AdminStatus
    if ($as.Users -gt 0) { Write-Log "$ok عدد الحسابات في النظام: $($as.Users)" }
    elseif ($as.Users -eq 0) { Write-Log "$warn لا يوجد أي حساب بعد (يُنشأ admin تلقائياً عند أول تشغيل)" }
    if ($as.DefaultAdmin) { Write-Log "$bad حساب admin بكلمة المرور الافتراضية admin123 — غيّرها من زر (مدير النظام)" }

    $port = Get-AppPort
    $h = Get-Health
    if ($h.Running) {
        Write-Log "$ok النظام يعمل على المنفذ $port"
        if ($h.Db) { Write-Log "$ok النظام متصل بقاعدة البيانات" } else { Write-Log "$bad قاعدة البيانات غير متصلة" }
    } else {
        $owner = Get-ListeningPid $port
        if ($owner) {
            $p = Get-Process -Id $owner -ErrorAction SilentlyContinue
            Write-Log "$bad المنفذ $port مشغول ببرنامج آخر: $($p.ProcessName)"
        } else {
            Write-Log "$warn النظام متوقف"
        }
    }

    $task = Get-AutoStartTask
    if ($task) { Write-Log "$ok التشغيل الدائم مفعّل (الحالة: $($task.State))" } else { Write-Log "$warn التشغيل الدائم غير مفعّل" }
    $bs = Get-BackupSchedule
    if ($bs.Enabled) { Write-Log "$ok النسخ الاحتياطي اليومي مفعّل الساعة $($bs.Time)" } else { Write-Log "$warn النسخ الاحتياطي المجدول غير مفعّل" }
    Write-Log ('   ' + (Get-LastBackupText))

    if ((Get-AppHost) -eq '0.0.0.0') {
        if (Test-FirewallRule) { Write-Log "$ok وضع الشبكة، والمنفذ مفتوح في جدار الحماية" } else { Write-Log "$bad وضع الشبكة، لكن المنفذ غير مفتوح في جدار الحماية" }
        foreach ($ip in (Get-LanAddresses)) { Write-Log "   رابط الحاسبات الأخرى: http://${ip}:$port" }
    } else {
        Write-Log "$ok وضع الحاسبة الواحدة (الدخول من هذه الحاسبة فقط)"
    }

    $drive = Get-PSDrive -Name ($script:AppDir.Substring(0, 1)) -ErrorAction SilentlyContinue
    if ($drive) {
        $freeGb = [math]::Round($drive.Free / 1GB, 1)
        if ($freeGb -lt 5) { Write-Log "$warn المساحة الفارغة على القرص $($drive.Name): $freeGb GB" } else { Write-Log "$ok المساحة الفارغة على القرص $($drive.Name): $freeGb GB" }
    }
    Write-Log '════ انتهى الفحص ════'
}

# ---------------------------------------------------------------------
# نوافذ الإدخال
# ---------------------------------------------------------------------
function New-DialogForm([string]$title, [int]$width, [int]$height) {
    $f = New-Object System.Windows.Forms.Form
    $f.Text = $title
    $f.RightToLeft = 'Yes'
    $f.RightToLeftLayout = $true
    $f.StartPosition = 'CenterParent'
    $f.FormBorderStyle = 'FixedDialog'
    $f.MaximizeBox = $false
    $f.MinimizeBox = $false
    $f.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $f.ClientSize = New-Object System.Drawing.Size($width, $height)
    return $f
}

function Add-DialogButtons($form, [int]$y) {
    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = 'حفظ'
    $ok.DialogResult = 'OK'
    $ok.Size = New-Object System.Drawing.Size(100, 32)
    $ok.Location = New-Object System.Drawing.Point(20, $y)
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'إلغاء'
    $cancel.DialogResult = 'Cancel'
    $cancel.Size = New-Object System.Drawing.Size(100, 32)
    $cancel.Location = New-Object System.Drawing.Point(130, $y)
    $form.Controls.Add($ok); $form.Controls.Add($cancel)
    $form.AcceptButton = $ok; $form.CancelButton = $cancel
}

function Show-DbDialog([hashtable]$db, [string]$hint) {
    $f = New-DialogForm 'إعدادات قاعدة البيانات' 460 330
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $hint
    $lbl.Location = New-Object System.Drawing.Point(20, 12)
    $lbl.Size = New-Object System.Drawing.Size(420, 44)
    $f.Controls.Add($lbl)
    $fields = @(
        @{ Key = 'Host'; Label = 'العنوان' },
        @{ Key = 'Port'; Label = 'المنفذ' },
        @{ Key = 'User'; Label = 'المستخدم' },
        @{ Key = 'Password'; Label = 'كلمة المرور' },
        @{ Key = 'Name'; Label = 'اسم القاعدة' }
    )
    $boxes = @{}
    $y = 64
    foreach ($fd in $fields) {
        $l = New-Object System.Windows.Forms.Label
        $l.Text = $fd.Label
        $l.Location = New-Object System.Drawing.Point(20, ($y + 4))
        $l.Size = New-Object System.Drawing.Size(110, 24)
        $t = New-Object System.Windows.Forms.TextBox
        $t.Text = [string]$db[$fd.Key]
        $t.Location = New-Object System.Drawing.Point(140, $y)
        $t.Size = New-Object System.Drawing.Size(290, 26)
        $t.RightToLeft = 'No'
        if ($fd.Key -eq 'Password') { $t.UseSystemPasswordChar = $true }
        $f.Controls.Add($l); $f.Controls.Add($t)
        $boxes[$fd.Key] = $t
        $y += 40
    }
    Add-DialogButtons $f ($y + 8)
    if ($f.ShowDialog($script:MainForm) -ne 'OK') { return $null }
    $result = @{}
    foreach ($k in $boxes.Keys) { $result[$k] = $boxes[$k].Text.Trim() }
    if (-not $result.Port) { $result.Port = '5432' }
    return $result
}

function Show-PortDialog([int]$current) {
    $f = New-DialogForm 'تغيير المنفذ' 380 150
    $l = New-Object System.Windows.Forms.Label
    $l.Text = 'رقم المنفذ (من 1024 إلى 65535):'
    $l.Location = New-Object System.Drawing.Point(20, 20)
    $l.Size = New-Object System.Drawing.Size(220, 24)
    $n = New-Object System.Windows.Forms.NumericUpDown
    $n.Minimum = 1024; $n.Maximum = 65535; $n.Value = $current
    $n.Location = New-Object System.Drawing.Point(250, 18)
    $n.Size = New-Object System.Drawing.Size(110, 26)
    $f.Controls.Add($l); $f.Controls.Add($n)
    Add-DialogButtons $f 80
    if ($f.ShowDialog($script:MainForm) -ne 'OK') { return $null }
    return [int]$n.Value
}

function Show-ModeDialog([string]$currentHost) {
    $f = New-DialogForm 'طريقة الاستخدام' 460 200
    $r1 = New-Object System.Windows.Forms.RadioButton
    $r1.Text = 'حاسبة واحدة — النظام يُفتح من هذه الحاسبة فقط'
    $r1.Location = New-Object System.Drawing.Point(20, 20)
    $r1.Size = New-Object System.Drawing.Size(420, 28)
    $r2 = New-Object System.Windows.Forms.RadioButton
    $r2.Text = 'سيرفر للشبكة — الحاسبات الأخرى تدخل من المتصفح'
    $r2.Location = New-Object System.Drawing.Point(20, 60)
    $r2.Size = New-Object System.Drawing.Size(420, 28)
    if ($currentHost -eq '0.0.0.0') { $r2.Checked = $true } else { $r1.Checked = $true }
    $f.Controls.Add($r1); $f.Controls.Add($r2)
    Add-DialogButtons $f 130
    if ($f.ShowDialog($script:MainForm) -ne 'OK') { return $null }
    if ($r2.Checked) { return '0.0.0.0' } else { return '127.0.0.1' }
}

# ---------------------------------------------------------------------
# إجراءات الأزرار
# ---------------------------------------------------------------------
function Invoke-ChangePort {
    $old = Get-AppPort
    $new = Show-PortDialog $old
    if (-not $new -or $new -eq $old) { return }
    $owner = Get-ListeningPid $new
    if ($owner) { throw "المنفذ $new مشغول ببرنامج آخر. اختر رقماً آخر." }
    $wasRunning = Test-AppActive
    if ($wasRunning) { Stop-App }
    Set-EnvValues @{ PORT = "$new" }
    Write-Log "✔ تم تغيير المنفذ من $old إلى $new"
    if ((Get-AppHost) -eq '0.0.0.0') { Set-FirewallRule $true $new }
    Restart-AppIfWasRunning $wasRunning
}

function Invoke-ChangeMode {
    $old = Get-AppHost
    $new = Show-ModeDialog $old
    if (-not $new -or $new -eq $old) { return }
    $wasRunning = Test-AppActive
    if ($wasRunning) { Stop-App }
    Set-EnvValues @{ HOST = $new }
    if ($new -eq '0.0.0.0') {
        Set-FirewallRule $true (Get-AppPort)
        Write-Log '✔ وضع الشبكة مفعّل. روابط الدخول من الحاسبات الأخرى:'
        foreach ($ip in (Get-LanAddresses)) { Write-Log "   http://${ip}:$(Get-AppPort)" }
    } else {
        Set-FirewallRule $false 0
        Write-Log '✔ وضع الحاسبة الواحدة مفعّل.'
    }
    Restart-AppIfWasRunning $wasRunning
}

function Invoke-ChangeDb {
    $db = Show-DbDialog (Get-DbSettings) 'بيانات الاتصال بقاعدة بيانات PostgreSQL'
    if (-not $db) { return }
    $r = Test-DbServer $db
    if ($r.Code -ne 0) { throw "تعذّر الاتصال بهذه البيانات:`n$($r.Output)" }
    Save-DbSettings $db
    Write-Log '✔ تم حفظ إعدادات قاعدة البيانات والاتصال ناجح.'
    if (-not (Test-DbExists $db)) {
        if (Confirm-Action "قاعدة البيانات $($db.Name) غير موجودة. هل تريد إنشاءها؟") { New-Database $db; Write-Log "✔ تم إنشاء $($db.Name)" }
    }
    if ((Test-AppActive) -and (Confirm-Action 'يجب إعادة تشغيل النظام لتطبيق الإعدادات. إعادة التشغيل الآن؟')) { Stop-App; Start-App }
}

function Invoke-Rebuild {
    $wasRunning = Test-AppActive
    if ($wasRunning) { Stop-App }
    Ensure-EnvFile
    Install-Dependencies $false
    Invoke-Build
    Restart-AppIfWasRunning $wasRunning
}

# وضع التطوير: npm run dev (tsx server.ts + Vite) في نافذة منفصلة، على نفس المنفذ
function Invoke-DevMode {
    $npm = Get-NpmCmd
    if (-not $npm) { throw 'Node.js غير منصّب.' }
    if (Test-AppResponds) {
        if (-not (Confirm-Action 'وضع التطوير يحتاج إيقاف النظام العادي أولاً. إيقافه الآن؟')) { return }
        if (Get-AutoStartTask) { Write-Log '⚠ التشغيل الدائم مفعّل: سيعود النظام العادي بعد دقيقة إذا لم تلغِ التفعيل.' }
        Stop-App
    }
    Start-Process 'cmd.exe' -ArgumentList ('/k "title HR SYSTEM - Dev Mode && cd /d "' + $script:AppDir + '" && set NODE_ENV=development && "' + $npm + '" run dev"') -WorkingDirectory $script:AppDir
    Write-Log "تم فتح وضع التطوير في نافذة منفصلة على $(Get-AppUrl) (أغلق النافذة لإيقافه)."
}

function Invoke-RunTests {
    $npm = Get-NpmCmd
    if (-not $npm) { throw 'Node.js غير منصّب.' }
    $code = Invoke-Logged $npm 'test' 'تشغيل الاختبارات الآلية...'
    if ($code -eq 0) { Write-Log '✔ نجحت كل الاختبارات.' } else { Write-Log '✘ فشلت بعض الاختبارات (التفاصيل أعلاه).' }
}

# فحص المنفذ: متاح، أو يستخدمه النظام، أو يشغله برنامج آخر، وهل هو مفتوح في جدار الحماية
function Invoke-PortCheck {
    $ErrorActionPreference = 'Continue'
    $port = Get-AppPort
    Write-Log "════ فحص المنفذ $port ════"
    $owner = Get-ListeningPid $port
    if (Test-AppResponds) {
        Write-Log "✔ المنفذ $port يستخدمه النظام نفسه وهو يعمل"
    } elseif ($owner) {
        $p = Get-Process -Id $owner -ErrorAction SilentlyContinue
        Write-Log "✘ المنفذ $port مشغول ببرنامج آخر: $($p.ProcessName) (رقم العملية $owner). أوقف ذلك البرنامج أو غيّر المنفذ من زر (تغيير المنفذ)."
        if ($p -and $p.ProcessName -eq 'node' -and (Confirm-Action "المنفذ $port مشغول بعملية node (رقم $owner) لا تستجيب كالنظام — غالباً نسخة عالقة من النظام.`n`nهل تريد إيقافها؟")) {
            Stop-Process -Id $owner -Force
            Write-Log "✔ أُوقفت العملية $owner والمنفذ متاح الآن."
        }
    } else {
        Write-Log "✔ المنفذ $port متاح والنظام متوقف"
    }
    foreach ($dp in @(5173, 24678)) {
        $o = Get-ListeningPid $dp
        if ($o) { $pp = Get-Process -Id $o -ErrorAction SilentlyContinue; Write-Log "   منفذ التطوير $dp مستخدم من: $($pp.ProcessName) ($o)" }
    }
    if ((Get-AppHost) -eq '0.0.0.0') {
        if (Test-FirewallRule) { Write-Log "✔ المنفذ مفتوح في جدار الحماية للشبكة" } else { Write-Log "✘ وضع الشبكة مفعّل لكن المنفذ غير مفتوح في جدار الحماية (زر ""حاسبة واحدة / شبكة"" لفتحه)" }
        foreach ($ip in (Get-LanAddresses)) { Write-Log "   رابط الحاسبات الأخرى: http://${ip}:$port" }
    } else {
        Write-Log '   وضع الحاسبة الواحدة: المنفذ لا يُفتح للشبكة'
    }
    $free = @()
    foreach ($c in @(5000, 5001, 5050, 8080, 8090)) { if ($c -ne $port -and -not (Get-ListeningPid $c)) { $free += $c } }
    if ($free.Count -gt 0) { Write-Log ('   منافذ بديلة متاحة: ' + ($free -join '، ')) }
}

function Show-ServerLog {
    $files = @($script:ServerLog, (Join-Path $script:LogDir 'server-error.log')) | Where-Object { Test-Path $_ }
    if ($files.Count -eq 0) { Show-Info 'لا يوجد سجلّ بعد. شغّل النظام أولاً.'; return }
    foreach ($file in $files) { Start-Process 'notepad.exe' ('"' + $file + '"') }
}

# تشغيل بدون واجهة من المهمة المجدولة
if ($ScheduledBackup) {
    try {
        [void](Invoke-ScheduledBackup)
        Write-BackupRunResult $true ''
        exit 0
    } catch {
        $msg = $_.Exception.Message
        Save-PanelLog ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ✖ فشل النسخ المجدول: ' + $msg + "`r`n")
        Write-BackupRunResult $false $msg
        exit 1
    }
}

if ($RestartNow) {
    try {
        Save-PanelLog ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + " ⟳ إعادة تشغيل النظام عبر -RestartNow`r`n")
        Stop-App
        Start-App
        exit 0
    } catch {
        $msg = $_.Exception.Message
        Save-PanelLog ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ✖ فشل إعادة التشغيل: ' + $msg + "`r`n")
        exit 1
    }
}

# ---------------------------------------------------------------------
# الواجهة الرئيسية
# ---------------------------------------------------------------------
$script:Navy  = [System.Drawing.Color]::FromArgb(27, 58, 107)    # #1B3A6B اللون الأساسي للنظام
$script:Gold  = [System.Drawing.Color]::FromArgb(200, 150, 12)   # #C8960C اللون الثانوي
$script:Green = [System.Drawing.Color]::FromArgb(4, 120, 87)
$script:Red   = [System.Drawing.Color]::FromArgb(190, 18, 60)
$script:Amber = [System.Drawing.Color]::FromArgb(180, 83, 9)

$script:MainForm = New-Object System.Windows.Forms.Form
$MainForm.Text = 'لوحة تحكم ' + $script:AppName
$MainForm.RightToLeft = 'Yes'
$MainForm.RightToLeftLayout = $true
$MainForm.StartPosition = 'CenterScreen'
$MainForm.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$MainForm.ClientSize = New-Object System.Drawing.Size(1180, 740)
$MainForm.MinimumSize = New-Object System.Drawing.Size(1000, 640)
$MainForm.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)

$layout = New-Object System.Windows.Forms.TableLayoutPanel
$layout.Dock = 'Fill'
$layout.ColumnCount = 1
$layout.RowCount = 4
$layout.Padding = New-Object System.Windows.Forms.Padding(12)
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Absolute', 60)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Absolute', 118)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Absolute', 250)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 100)))
$MainForm.Controls.Add($layout)

# العنوان
$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Fill'
$header.BackColor = $script:Navy
$stripe = New-Object System.Windows.Forms.Panel
$stripe.Dock = 'Bottom'
$stripe.Height = 4
$stripe.BackColor = $script:Gold
$title = New-Object System.Windows.Forms.Label
$title.Text = $script:AppName + ' HR — لوحة التحكم'
$title.ForeColor = [System.Drawing.Color]::White
$title.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$title.Dock = 'Fill'
$title.TextAlign = 'MiddleRight'
$title.Padding = New-Object System.Windows.Forms.Padding(12, 0, 12, 0)
$header.Controls.Add($title)
$header.Controls.Add($stripe)
$layout.Controls.Add($header, 0, 0)

# لوحة الحالة
$statusBox = New-Object System.Windows.Forms.GroupBox
$statusBox.Text = 'الحالة'
$statusBox.Dock = 'Fill'
$statusGrid = New-Object System.Windows.Forms.TableLayoutPanel
$statusGrid.Dock = 'Fill'
$statusGrid.ColumnCount = 4
$statusGrid.RowCount = 3
for ($i = 0; $i -lt 4; $i++) { [void]$statusGrid.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 25))) }
$statusBox.Controls.Add($statusGrid)
$layout.Controls.Add($statusBox, 0, 1)

function New-StatusLabel {
    $l = New-Object System.Windows.Forms.Label
    $l.Dock = 'Fill'
    $l.TextAlign = 'MiddleRight'
    $l.AutoEllipsis = $true
    $statusGrid.Controls.Add($l)
    return $l
}
$script:LblServer  = New-StatusLabel
$script:LblDb      = New-StatusLabel
$script:LblAuto    = New-StatusLabel
$script:LblVersion = New-StatusLabel
$script:LblPort    = New-StatusLabel
$script:LblMode    = New-StatusLabel
$script:LblNode    = New-StatusLabel
$script:LblUrl     = New-Object System.Windows.Forms.LinkLabel
$LblUrl.Dock = 'Fill'
$LblUrl.TextAlign = 'MiddleRight'
$statusGrid.Controls.Add($LblUrl)
$script:LblProtect = New-StatusLabel
$script:LblBackup  = New-StatusLabel
$LblUrl.Add_LinkClicked({ Start-Process (Get-AppUrl) })

# الأزرار
$buttonsPanel = New-Object System.Windows.Forms.FlowLayoutPanel
$buttonsPanel.Dock = 'Fill'
$buttonsPanel.FlowDirection = 'LeftToRight'
$buttonsPanel.WrapContents = $false
$buttonsPanel.AutoScroll = $true
$layout.Controls.Add($buttonsPanel, 0, 2)

$script:AllButtons = New-Object System.Collections.Generic.List[System.Windows.Forms.Button]

function Invoke-UiAction([scriptblock]$action) {
    if ($script:Busy) { return }
    $script:Busy = $true
    foreach ($b in $script:AllButtons) { $b.Enabled = $false }
    $MainForm.Cursor = 'WaitCursor'
    try {
        & $action
    } catch {
        $msg = $_.Exception.Message
        Write-Log "✘ $msg"
        Show-Error $msg
    } finally {
        $MainForm.Cursor = 'Default'
        foreach ($b in $script:AllButtons) { $b.Enabled = $true }
        $script:Busy = $false
        Update-Status
    }
}

function Add-Group([string]$caption, [array]$items) {
    $g = New-Object System.Windows.Forms.GroupBox
    $g.Text = $caption
    $g.Size = New-Object System.Drawing.Size(166, (36 + 40 * $items.Count))
    $g.Margin = New-Object System.Windows.Forms.Padding(4)
    $y = 24
    foreach ($it in $items) {
        $b = New-Object System.Windows.Forms.Button
        $b.Text = $it[0]
        $b.Size = New-Object System.Drawing.Size(150, 34)
        $b.Location = New-Object System.Drawing.Point(8, $y)
        $b.FlatStyle = 'System'
        $b.Tag = $it[1]
        $b.Add_Click({ Invoke-UiAction $this.Tag })
        $g.Controls.Add($b)
        $script:AllButtons.Add($b)
        $y += 40
    }
    $buttonsPanel.Controls.Add($g)
}

Add-Group 'التنصيب والتحديث' @(
    @('تنصيب أول مرة',       { Invoke-FirstInstall }),
    @('تحديث من GitHub',     { Invoke-UpdateFromGitHub }),
    @('تحديث من ملف ZIP',    { Invoke-UpdateFromZip }),
    @('تجهيز حزمة للسيرفر', { New-OfflinePackage }),
    @('إعادة البناء',        { Invoke-Rebuild })
)
Add-Group 'التشغيل' @(
    @('تشغيل',               { Start-App }),
    @('إيقاف',               { Stop-App }),
    @('إعادة تشغيل',         { Stop-App; Start-App }),
    @('فتح النظام',          { Start-Process (Get-AppUrl) })
)
Add-Group 'التشغيل الدائم' @(
    @('تفعيل مع Windows',    { Enable-AutoStart }),
    @('إلغاء التفعيل',       { Disable-AutoStart })
)
Add-Group 'الإعدادات' @(
    @('تغيير المنفذ',        { Invoke-ChangePort }),
    @('حاسبة واحدة / شبكة',  { Invoke-ChangeMode }),
    @('قاعدة البيانات',      { Invoke-ChangeDb }),
    @('مدير النظام',         { [void](Invoke-CreateAdmin 'إنشاء حساب مدير نظام، أو تغيير كلمة مرور حساب موجود (مثل admin).') })
)
Add-Group 'الصيانة' @(
    @('فحص النظام',          { Invoke-SystemCheck }),
    @('فحص المنفذ',          { Invoke-PortCheck }),
    @('عرض سجلّ الخادم',     { Show-ServerLog })
)
Add-Group 'النسخ الاحتياطي' @(
    @('نسخة احتياطية',       { [void](New-Backup 'manual') }),
    @('النسخ المجدول',        { Invoke-BackupScheduleDialog }),
    @('استعادة نسخة',        { Restore-Backup }),
    @('تصدير نسخة',          { Export-BackupCopy }),
    @('فحص النسخ',           { Test-BackupFiles })
)
Add-Group 'الحماية' @(
    @('حماية المجلدات',       { Invoke-ProtectFolders }),
    @('إلغاء الحماية',        { Invoke-UnprotectFolders })
)
Add-Group 'أدوات المطوّر' @(
    @('فتح مجلد النظام',     { Start-Process 'explorer.exe' ('"' + $script:AppDir + '"') }),
    @('وضع التطوير',         { Invoke-DevMode }),
    @('تشغيل الاختبارات',    { Invoke-RunTests }),
    @('مسح السجلّ',          { $script:LogBox.Clear() })
)

# مربع السجلّ
$logGroup = New-Object System.Windows.Forms.GroupBox
$logGroup.Text = 'السجلّ'
$logGroup.Dock = 'Fill'
$script:LogBox = New-Object System.Windows.Forms.TextBox
$LogBox.Multiline = $true
$LogBox.ReadOnly = $true
$LogBox.ScrollBars = 'Vertical'
$LogBox.Dock = 'Fill'
$LogBox.BackColor = [System.Drawing.Color]::White
$LogBox.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$logGroup.Controls.Add($LogBox)
$layout.Controls.Add($logGroup, 0, 3)

function Update-Status {
    $h = Get-Health
    $port = Get-AppPort
    if ($h.Running) {
        $LblServer.Text = 'النظام: يعمل'
        $LblServer.ForeColor = $script:Green
        if ($h.Db) { $LblDb.Text = 'قاعدة البيانات: متصلة'; $LblDb.ForeColor = $script:Green }
        else { $LblDb.Text = 'قاعدة البيانات: غير متصلة'; $LblDb.ForeColor = $script:Red }
    } else {
        $LblServer.Text = 'النظام: متوقف'
        $LblServer.ForeColor = $script:Red
        $LblDb.Text = 'قاعدة البيانات: —'
        $LblDb.ForeColor = [System.Drawing.Color]::DimGray
    }
    $task = Get-AutoStartTask
    if ($task) { $LblAuto.Text = 'التشغيل الدائم: مفعّل' } else { $LblAuto.Text = 'التشغيل الدائم: غير مفعّل' }
    $LblVersion.Text = 'الإصدار: ' + (Get-AppVersion)
    $LblPort.Text = "المنفذ: $port"
    if ((Get-AppHost) -eq '0.0.0.0') { $LblMode.Text = 'الوضع: سيرفر للشبكة' } else { $LblMode.Text = 'الوضع: حاسبة واحدة' }
    $nv = Get-NodeVersion
    if ($nv) { $LblNode.Text = "Node.js: $nv" } else { $LblNode.Text = 'Node.js: غير منصّب' }
    $LblUrl.Text = Get-AppUrl
    if (Get-FolderProtection) {
        $LblProtect.Text = 'حماية المجلدات: مفعّلة'
        $LblProtect.ForeColor = $script:Green
    } else {
        $LblProtect.Text = 'حماية المجلدات: غير مفعّلة'
        $LblProtect.ForeColor = $script:Amber
    }
    $LblBackup.Text = Get-LastBackupText
    if ($LblBackup.Text -match 'فشل|لا توجد') { $LblBackup.ForeColor = $script:Amber } else { $LblBackup.ForeColor = [System.Drawing.Color]::Black }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10000
$timer.Add_Tick({ if (-not $script:Busy) { Update-Status } })

$MainForm.Add_Shown({
    Save-PanelLog "`r`n===== فتح لوحة التحكم — الإصدار $(Get-AppVersion) =====`r`n"
    Write-Log "مجلد النظام: $($script:AppDir)"
    if (-not (Test-Path $script:EnvFile) -or -not (Test-Path (Join-Path $script:AppDir 'node_modules'))) {
        Write-Log 'النظام غير منصّب بعد على هذه الحاسبة. اضغط "تنصيب أول مرة".'
    } elseif (-not (Test-Built)) {
        Write-Log 'النظام غير مبني بعد. اضغط "إعادة البناء" ثم "تشغيل".'
    } else {
        try {
            $port = Get-AppPort
            $pidOnPort = Get-ListeningPid $port
            $procOnPort = if ($pidOnPort) { Get-Process -Id $pidOnPort -ErrorAction SilentlyContinue } else { $null }
            $serverFileItem = Get-Item -LiteralPath (Join-Path $script:AppDir $script:ServerFile) -ErrorAction SilentlyContinue
            if (-not (Test-AppResponds) -and (Test-AppActive)) {
                Write-Log '⟳ تم اكتشاف جلسة سابقة عالقة للنظام — جاري إعادة التشغيل تلقائياً...'
                Stop-App
                Start-App
            } elseif ($procOnPort -and $procOnPort.ProcessName -eq 'node' -and $serverFileItem -and $procOnPort.StartTime -and ($serverFileItem.LastWriteTimeUtc -gt $procOnPort.StartTime.ToUniversalTime())) {
                Write-Log '⟳ تم اكتشاف بناء أحدث للنظام — جاري إعادة التشغيل تلقائياً لتطبيق التحديثات...'
                Stop-App
                Start-App
            }
        } catch {
            Write-Log "⚠ تعذّرت إعادة التشغيل التلقائي عند الفتح: $($_.Exception.Message)"
        }
    }
    Update-Status
    $timer.Start()
})

[void]$MainForm.ShowDialog()
$timer.Stop()
