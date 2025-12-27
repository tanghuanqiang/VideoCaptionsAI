$ErrorActionPreference = "Stop"

Write-Host "Checking Conda environment..."
try {
    conda activate langgraph
} catch {
    Write-Host "Warning: 'conda activate langgraph' failed. Trying to activate via hook..."
    # Try to initialize conda for this shell if not already
    & conda shell.powershell hook | Out-String | Invoke-Expression
    conda activate langgraph
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to activate 'langgraph' environment. Please ensure it exists."
    exit 1
}

Write-Host "Environment 'langgraph' activated."
Write-Host "Starting VideoSubs backend..."

# Ensure we are in the script's directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Run the application
uvicorn src.app:app --reload --host 127.0.0.1 --port 8000
