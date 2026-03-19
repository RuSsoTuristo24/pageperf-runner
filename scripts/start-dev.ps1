param(
	[switch]$SeparateWindows
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$storageRoot = Join-Path $root 'storage'
$logRoot = Join-Path $storageRoot 'logs'
$processFile = Join-Path $storageRoot 'dev-processes.json'

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

& (Join-Path $PSScriptRoot 'stop-dev.ps1') | Out-Null

if ($SeparateWindows)
{
	$apiProcess = Start-Process powershell -ArgumentList @(
		'-NoExit',
		'-Command',
		"Set-Location '$root'; corepack pnpm --filter @webperf/api dev"
	) -PassThru

	$webProcess = Start-Process powershell -ArgumentList @(
		'-NoExit',
		'-Command',
		"Set-Location '$root'; corepack pnpm --filter @webperf/web dev"
	) -PassThru

	Write-Host "API PID: $($apiProcess.Id)"
	Write-Host "Web PID: $($webProcess.Id)"
	Write-Host 'Open http://127.0.0.1:4173 after both windows finish booting.'

	return
}

$apiLog = Join-Path $logRoot 'api-dev.log'
$apiErrorLog = Join-Path $logRoot 'api-dev.err.log'
$webLog = Join-Path $logRoot 'web-dev.log'
$webErrorLog = Join-Path $logRoot 'web-dev.err.log'

$apiProcess = Start-Process powershell -WindowStyle Hidden -ArgumentList @(
	'-NoProfile',
	'-Command',
	"Set-Location '$root'; corepack pnpm --filter @webperf/api dev"
) -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog -PassThru

$webProcess = Start-Process powershell -WindowStyle Hidden -ArgumentList @(
	'-NoProfile',
	'-Command',
	"Set-Location '$root'; corepack pnpm --filter @webperf/web dev"
) -RedirectStandardOutput $webLog -RedirectStandardError $webErrorLog -PassThru

@{
	apiPid = $apiProcess.Id
	webPid = $webProcess.Id
	apiLog = $apiLog
	apiErrorLog = $apiErrorLog
	webLog = $webLog
	webErrorLog = $webErrorLog
	startedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -Path $processFile

Write-Host "API PID: $($apiProcess.Id)"
Write-Host "Web PID: $($webProcess.Id)"
Write-Host "API log: $apiLog"
Write-Host "API err log: $apiErrorLog"
Write-Host "Web log: $webLog"
Write-Host "Web err log: $webErrorLog"
Write-Host 'Open http://127.0.0.1:4173 after both services finish booting.'
Write-Host 'Use scripts\stop-dev.ps1 to stop both background processes.'
