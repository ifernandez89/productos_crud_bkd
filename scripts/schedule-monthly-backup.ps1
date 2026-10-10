# Script para registrar o actualizar la tarea programada de Windows para el backup mensual de JarBees
$TaskName = "JarBees_Database_Monthly_Backup"
$ScriptPath = "C:\Projects\productos_crud_bkd\scripts\backup-db.ps1"

Write-Host "Registrando tarea programada: $TaskName"
schtasks /Create /SC MONTHLY /D 1 /TN $TaskName /TR "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$ScriptPath\`"" /ST 03:00 /F

Write-Host "Verificando tarea:"
schtasks /Query /TN $TaskName /FO LIST
