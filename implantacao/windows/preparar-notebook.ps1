# Prepara um notebook (ou PC) com Windows 10/11 para servir os sistemas Nexor 24 horas.
# Rode como ADMINISTRADOR, no PowerShell:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\preparar-notebook.ps1
#
# O que faz:
#   1. Energia: nunca suspender nem hibernar na tomada; fechar a tampa não faz nada; tela pode apagar
#   2. Rede e USB sem economia de energia (o Wi-Fi/cabo não "dorme")
#   3. Windows Update sem reiniciar sozinho com alguém logado, e horário ativo das 6h às 23h
#   4. WSL 2 com Ubuntu 24.04 e systemd (onde o Docker e os sistemas Nexor rodam)
#   5. WSL sem desligar por inatividade
#   6. Tarefa agendada que liga o Docker do WSL sempre que o Windows inicia, mesmo sem ninguém logado
#
# Depois de reiniciar, abra o "Ubuntu" no menu Iniciar e siga o GUIA-INSTALACAO.md (Cenário E).

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$Distro = "Ubuntu-24.04"

function Passo($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }

# 1. Energia ------------------------------------------------------------------
Passo "Configurando energia (tomada: nunca suspender nem hibernar)"
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
powercfg /change monitor-timeout-ac 10          # só a tela apaga depois de 10 min
powercfg /hibernate off                          # desliga a hibernação e o "início rápido"
# Fechar a tampa na tomada: não fazer nada (0). Na bateria continua suspendendo, para proteger a bateria.
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
# Suspensão seletiva de USB desligada na tomada (adaptadores de rede USB não "dormem")
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
# Suspensão híbrida e temporizadores de despertar ficam irrelevantes sem suspensão; reativa o plano
powercfg /setactive SCHEME_CURRENT

# 2. Rede ---------------------------------------------------------------------
Passo "Tirando a economia de energia das placas de rede"
Get-NetAdapter -Physical | ForEach-Object {
  try { Disable-NetAdapterPowerManagement -Name $_.Name -NoRestart -ErrorAction Stop; Write-Host "  $($_.Name): ok" }
  catch { Write-Host "  $($_.Name): não suportado (tudo bem)" }
}

# 3. Windows Update -----------------------------------------------------------
Passo "Windows Update: sem reinício automático com usuário logado; horário ativo 6h às 23h"
$au = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU"
New-Item -Path $au -Force | Out-Null
New-ItemProperty -Path $au -Name NoAutoRebootWithLoggedOnUsers -Value 1 -PropertyType DWord -Force | Out-Null
$ux = "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings"
New-Item -Path $ux -Force | Out-Null
New-ItemProperty -Path $ux -Name ActiveHoursStart -Value 6 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $ux -Name ActiveHoursEnd -Value 23 -PropertyType DWord -Force | Out-Null

# 4. WSL + Ubuntu -------------------------------------------------------------
Passo "Instalando o WSL 2 e o $Distro (pode pedir para reiniciar)"
wsl --update 2>$null
$instaladas = (wsl -l -q 2>$null) -replace "`0", ""
if ($instaladas -notcontains $Distro) {
  wsl --install -d $Distro --no-launch
  Write-Host "  $Distro instalado. Depois de reiniciar, abra 'Ubuntu' uma vez para criar o usuário." -ForegroundColor Yellow
}

# 5. WSL sem desligar por inatividade ----------------------------------------
Passo "WSL sempre ligado (sem desligamento por inatividade)"
$wslconfig = Join-Path $env:USERPROFILE ".wslconfig"
@"
[wsl2]
# Mantém a máquina do Linux ligada mesmo sem janela aberta
vmIdleTimeout=-1
# Memória para os sistemas Nexor (ajuste se o notebook tiver pouca RAM)
memory=4GB
"@ | Set-Content -Path $wslconfig -Encoding UTF8
Write-Host "  $wslconfig gravado"

# 6. Tarefa de inicialização --------------------------------------------------
Passo "Tarefa agendada: ligar o Docker do WSL quando o Windows iniciar"
$acao = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d $Distro -u root -- sh -c 'systemctl start docker; sleep infinity'"
$gatilho = New-ScheduledTaskTrigger -AtStartup
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$usuario = "$env:USERDOMAIN\$env:USERNAME"
$senha = Read-Host "Senha do Windows do usuário $usuario (para a tarefa rodar sem ninguém logado)" -AsSecureString
$cred = New-Object System.Management.Automation.PSCredential($usuario, $senha)
Register-ScheduledTask -TaskName "Nexor - manter sistemas ligados" -Action $acao -Trigger $gatilho -Settings $config `
  -User $usuario -Password $cred.GetNetworkCredential().Password -RunLevel Highest -Force | Out-Null
Write-Host "  Tarefa 'Nexor - manter sistemas ligados' criada"

Passo "Pronto"
Write-Host @"
Faltam 3 coisas manuais:
  1. BIOS/UEFI: ative 'AC Power Recovery' / 'Restore on AC Power Loss' = Power On (liga sozinho quando a energia volta).
  2. Deixe o notebook SEMPRE na tomada, de preferência num nobreak, com cabo de rede.
  3. Reinicie o Windows, abra 'Ubuntu' no menu Iniciar e siga o GUIA-INSTALACAO.md, Cenário E, passo 3.
"@ -ForegroundColor Green
