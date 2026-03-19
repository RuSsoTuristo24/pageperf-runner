$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Running workspace tests...'
corepack pnpm -r test

Write-Host 'Running workspace build...'
corepack pnpm -r build

Write-Host 'Running workspace lint...'
corepack pnpm -r lint

Write-Host 'Smoke run completed.'
