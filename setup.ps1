# Polymart Status - setup script (PowerShell)
param(
    [ValidateSet('dev','build','preview','docker')]
    [string]$Mode = 'dev'
)

$ErrorActionPreference = 'Stop'

function Info  { param($msg) Write-Host "[setup] $msg" -ForegroundColor Green }
function Warn  { param($msg) Write-Host "[warn]  $msg" -ForegroundColor Yellow }
function Fatal { param($msg) Write-Host "[error] $msg" -ForegroundColor Red; exit 1 }

# Check Node >= 18
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fatal "Node.js is not installed. Install from https://nodejs.org (v18+)."
}
$nodeMajor = [int](node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($nodeMajor -lt 18) {
    Fatal "Node.js v18+ required (found $(node --version))."
}
Info "Node $(node --version) detected"

# Install deps
Info "Installing dependencies..."
npm ci --ignore-scripts

switch ($Mode) {
    'dev' {
        Info "Starting development server..."
        npm run dev
    }
    'build' {
        Info "Building for production..."
        npm run build
        Info "Build complete → dist/"
    }
    'preview' {
        Info "Building and previewing production build..."
        npm run build
        npm run preview
    }
    'docker' {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            Fatal "Docker is not installed."
        }
        Info "Building and starting Docker container..."
        docker compose up --build
    }
}
