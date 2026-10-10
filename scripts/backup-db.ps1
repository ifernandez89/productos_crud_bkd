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

# 1. Validar que la unidad G:\ esté accesible
if (-not (Test-Path "G:\")) {
    Write-Error "CRÍTICO: La unidad G:\ no está accesible o no está montada."
    exit 1
}

# 2. Crear directorio de destino si no existe
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Write-Log "Directorio de backups creado en: $TargetDir"
}

# 3. Validar presencia de pg_dump
if (-not (Test-Path $PgDumpPath)) {
    Write-Error "CRÍTICO: No se encontró pg_dump en: $PgDumpPath"
    exit 1
}

# 4. Configurar variables de conexión
$env:PGPASSWORD = "7523"
$DbHost = "localhost"
$DbPort = "5432"
$DbUser = "postgres"
$DbName = "jarbees_data"

Write-Log "Iniciando respaldo mensual de '$DbName' hacia '$BackupFile'..."
$StartTime = Get-Date

try {
    & $PgDumpPath -h $DbHost -p $DbPort -U $DbUser -d $DbName -F c -b -f $BackupFile
    
    if (-not (Test-Path $BackupFile)) {
        throw "El archivo de respaldo no fue generado."
    }

    $FileSize = (Get-Item $BackupFile).Length
    $FileSizeMB = [math]::Round($FileSize / 1MB, 2)
    $Duration = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 2)

    Write-Log "✅ Respaldo exitoso! Tamaño: $FileSizeMB MB. Duración: $Duration seg."
}
catch {
    Write-Log "❌ ERROR generando respaldo: $_"
    exit 1
}

# 5. Rotación de respaldos antiguos (Conservar los últimos N)
try {
    $AllDumps = Get-ChildItem -Path $TargetDir -Filter "jarbees_data_*.dump" | Sort-Object LastWriteTime -Descending
    if ($AllDumps.Count -gt $MaxBackupsToKeep) {
        $DumpsToDelete = $AllDumps | Select-Object -Skip $MaxBackupsToKeep
        foreach ($OldDump in $DumpsToDelete) {
            Write-Log "♻️ Rotación: Eliminando respaldo antiguo '$($OldDump.Name)'"
            Remove-Item -Path $OldDump.FullName -Force
        }
    }
    Write-Log "Estado: $($AllDumps.Count) respaldos conservados en $TargetDir."
}
catch {
    Write-Log "Advertencia durante rotación: $_"
}

Write-Log "Fin del proceso de respaldo."
