#!/usr/bin/env bash
set -euo pipefail

# ── Polymart Status — setup script ────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()    { echo -e "${GREEN}[setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()     { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# Check Node >= 18
command -v node &>/dev/null || die "Node.js is not installed. Install from https://nodejs.org (v18+)."
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
[[ $NODE_MAJOR -ge 18 ]] || die "Node.js v18+ required (found v$(node -v | tr -d v))."

info "Node $(node -v) detected"

# Install deps
info "Installing dependencies..."
npm ci --ignore-scripts

case "${1:-dev}" in
  dev)
    info "Starting development server..."
    npm run dev
    ;;
  build)
    info "Building for production..."
    npm run build
    info "Build complete → dist/"
    ;;
  preview)
    info "Building and previewing production build..."
    npm run build
    npm run preview
    ;;
  docker)
    command -v docker &>/dev/null || die "Docker is not installed."
    info "Building and starting Docker container..."
    docker compose up --build
    ;;
  *)
    echo "Usage: ./setup.sh [dev|build|preview|docker]"
    echo "  dev     — start Vite dev server (default)"
    echo "  build   — production build to dist/"
    echo "  preview — build then serve locally"
    echo "  docker  — build and run via Docker Compose"
    ;;
esac
