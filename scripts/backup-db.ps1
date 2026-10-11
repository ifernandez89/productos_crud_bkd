# ==============================================================================
# JARBEES - SCRIPT AUTOMATIZADO DE BACKUP DE POSTGRESQL HACIA G:\
# ==============================================================================
param (
    [string]$TargetDir = "G:\Backups\jarbees_data",
    [int]$MaxBackupsToKeep = 12
)

$ErrorActionPreference = "Stop"

$Timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$LogFile = Join-Path $TargetDir "backup_history.log"
$BackupFile = Join-Path $TargetDir "jarbees_data_$Timestamp.dump"
$PgDumpPath = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

function Write-Log {
    param([string]$Message)
    $Entry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $Entry
    if (Test-Path $TargetDir) {
        Add-Content -Path $LogFile -Value $Entry -Encoding UTF8
    }
}

# 1. Validar que la unidad G:\ este accesible
if (-not (Test-Path "G:\")) {
    Write-Error "CRITICO: La unidad G:\ no esta accesible o no esta montada."
    exit 1
}

# 2. Crear directorio de destino si no existe
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Write-Log "Directorio de backups creado en: $TargetDir"
}

# 3. Validar presencia de pg_dump
if (-not (Test-Path $PgDumpPath)) {
    Write-Error "CRITICO: No se encontro pg_dump en: $PgDumpPath"
    exit 1
}

# 4. Configurar variables de conexion
$env:PGPASSWORD = "7523"
$DbHost = "localhost"
$DbPort = "5432"
$DbUser = "postgres"
$DbName = "jarbees_data"

Write-Log "Iniciando respaldo de '$DbName' hacia '$BackupFile'..."
$StartTime = Get-Date

try {
    & $PgDumpPath -h $DbHost -p $DbPort -U $DbUser -d $DbName -F c -b -f $BackupFile
    
    if (-not (Test-Path $BackupFile)) {
        throw "El archivo de respaldo no fue generado."
    }

    $FileSize = (Get-Item $BackupFile).Length
    $FileSizeMB = [math]::Round($FileSize / 1MB, 2)
    $Duration = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 2)

    Write-Log "OK: Respaldo pg_dump exitoso! Tamano: $FileSizeMB MB. Duracion: $Duration seg."

    # 4b. Compresion con 7-Zip si D:\HBCD\Programs\7z.exe esta disponible
    $SevenZipPath = "D:\HBCD\Programs\7z.exe"
    if (Test-Path $SevenZipPath) {
        $ArchiveFile = "$BackupFile.7z"
        Write-Log "Comprimiendo respaldo con 7-Zip ($SevenZipPath)..."
        $ZipStart = Get-Date
        & $SevenZipPath a -t7z -mx=5 -sdel $ArchiveFile $BackupFile | Out-Null
        if (Test-Path $ArchiveFile) {
            $ArchiveSize = (Get-Item $ArchiveFile).Length
            $ArchiveSizeMB = [math]::Round($ArchiveSize / 1MB, 2)
            $ZipDuration = [math]::Round(((Get-Date) - $ZipStart).TotalSeconds, 2)
            Write-Log "OK: Respaldo 7z generado: $ArchiveSizeMB MB. Duracion compresion: $ZipDuration seg."
        }
    }
}
catch {
    Write-Log "ERROR generando respaldo: $_"
    exit 1
}

# 5. Rotacion de respaldos antiguos (Conservar los ultimos N)
try {
    $AllDumps = Get-ChildItem -Path $TargetDir | Where-Object { $_.Name -match '^jarbees_data_.*\.(dump|7z)$' } | Sort-Object LastWriteTime -Descending
    if ($AllDumps.Count -gt $MaxBackupsToKeep) {
        $DumpsToDelete = $AllDumps | Select-Object -Skip $MaxBackupsToKeep
        foreach ($OldDump in $DumpsToDelete) {
            Write-Log "Rotacion: Eliminando respaldo antiguo '$($OldDump.Name)'"
            Remove-Item -Path $OldDump.FullName -Force
        }
    }
    Write-Log "Estado: $($AllDumps.Count) respaldos conservados en $TargetDir."
}
catch {
    Write-Log "Advertencia durante rotacion: $_"
}

Write-Log "Fin del proceso de respaldo."
