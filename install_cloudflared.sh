#!/usr/bin/env bash
set -Eeuo pipefail

echo "=== Installiere cloudflared ==="

echo "1/4 Lade GPG-Key herunter..."
curl -fsSL -o /tmp/cloudflare-main.gpg https://pkg.cloudflare.com/cloudflare-main.gpg
echo "   OK"

echo "2/4 Installiere GPG-Key..."
sudo cp /tmp/cloudflare-main.gpg /usr/share/keyrings/cloudflare-main.gpg
echo "   OK"

echo "3/4 Fuege Repository hinzu..."
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared noble main" | sudo tee /etc/apt/sources.list.d/cloudflared.list > /dev/null
echo "   OK"

echo "4/4 Installiere cloudflared..."
sudo apt-get update -qq
sudo apt-get install -y cloudflared
echo "   OK"

echo ""
echo "=== Fertig! ==="
echo "Naechster Schritt: cloudflared tunnel login"
