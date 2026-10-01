#!/usr/bin/env bash
# Pull the latest code, rebuild, and restart the site. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
npm ci --no-audit --no-fund
npm test
npm run build
systemctl --user restart portfolio
echo "Deployed $(git rev-parse --short HEAD)"
