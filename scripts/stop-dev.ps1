$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$processFile = Join-Path $root 'storage\dev-processes.json'
$devPorts = @(4173, 4310)

function Stop-ProcessTreeById
{
	param(
		[int]$ProcessId
	)

	$process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue

	if ($process)
	{
		Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
		Write-Host "Stopped PID: $ProcessId"
	}
}

if (-not (Test-Path $processFile))
{
	Write-Host 'No background dev processes metadata found. Checking dev ports.'
}

$trackedProcessIds = @()

if (Test-Path $processFile)
{
	$processInfo = Get-Content $processFile | ConvertFrom-Json
	$trackedProcessIds = @($processInfo.apiPid, $processInfo.webPid) | Where-Object { $_ }
}

foreach ($processId in $trackedProcessIds)
{
	Stop-ProcessTreeById -ProcessId ([int]$processId)
}

foreach ($port in $devPorts)
{
	$listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue

	foreach ($listener in $listeners)
	{
		if ($listener.OwningProcess -and $trackedProcessIds -notcontains $listener.OwningProcess)
		{
			Stop-ProcessTreeById -ProcessId ([int]$listener.OwningProcess)
		}
	}
}

Remove-Item $processFile -Force -ErrorAction SilentlyContinue
Write-Host 'Background dev processes stopped.'
