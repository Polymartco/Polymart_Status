#!/usr/bin/env bash
# ── Polymart Status — one-click deploy for Google Cloud (Ubuntu/Debian VM) ───
# Usage: bash deploy.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Prompt ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}Polymart Status Page — Deploy${NC}"
echo "──────────────────────────────"
read -rp "  Domain (e.g. status.polymart.co): " DOMAIN
read -rp "  Email for SSL certificate:        " EMAIL
echo ""

[[ -z "$DOMAIN" ]] && die "Domain is required."
[[ -z "$EMAIL"  ]] && die "Email is required."

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. System packages ────────────────────────────────────────────────────────
step "System packages"
sudo apt-get update -qq
sudo apt-get install -y -qq curl nginx certbot python3-certbot-nginx

# ── 2. Docker ─────────────────────────────────────────────────────────────────
step "Docker"
if command -v docker &>/dev/null; then
  info "Docker already installed ($(docker --version))"
else
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
fi

# Ensure Docker starts on boot
sudo systemctl enable --now docker

# ── 3. Build and start the container ─────────────────────────────────────────
step "Build & start"
info "Building image and starting container..."
cd "$REPO_DIR"
sudo docker compose up --build -d
info "Container running on port 3000"

# ── 4. nginx reverse proxy ────────────────────────────────────────────────────
step "nginx"
sudo tee /etc/nginx/sites-available/polymart-status > /dev/null <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    # Forward to Docker container
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/polymart-status \
            /etc/nginx/sites-enabled/polymart-status

# Remove default site if it exists
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
info "nginx configured for ${DOMAIN}"

# ── 5. SSL certificate ────────────────────────────────────────────────────────
step "SSL (Let's Encrypt)"
warn "Make sure ${DOMAIN} DNS is already pointed to this server's IP."
warn "Certbot will fail if DNS hasn't propagated yet."
echo ""
read -rp "  Proceed with SSL certificate? [Y/n] " CONFIRM
CONFIRM="${CONFIRM:-Y}"

if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  sudo certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --redirect
  info "SSL certificate issued. Auto-renewal is active."
else
  warn "Skipped SSL. Run later with:"
  warn "  sudo certbot --nginx -d ${DOMAIN} --email ${EMAIL}"
fi

# ── 6. GCP firewall reminder ──────────────────────────────────────────────────
step "Done"
echo ""
echo -e "${GREEN}✓ Status page deployed!${NC}"
echo ""
echo "  URL: https://${DOMAIN}"
echo ""
echo -e "${YELLOW}If the site isn't reachable, open ports 80 and 443 in GCP:${NC}"
echo "  gcloud compute firewall-rules create allow-http-https \\"
echo "    --allow tcp:80,tcp:443 \\"
echo "    --target-tags http-server,https-server \\"
echo "    --description 'Allow web traffic'"
echo ""
echo "  Or: GCP Console → VPC Network → Firewall → Create Rule"
echo "      Ports: tcp:80, tcp:443"
echo ""
echo -e "${CYAN}Useful commands:${NC}"
echo "  sudo docker compose ps          — check container status"
echo "  sudo docker compose logs -f     — live logs"
echo "  sudo docker compose restart     — restart"
echo "  sudo systemctl status nginx     — nginx status"
echo ""
