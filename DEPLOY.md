# Deploying

The site is self-hosted on a Jetson Orin Nano and reached through a Cloudflare Tunnel.

- `portfolio.service` (systemd user unit) runs `next start` on `127.0.0.1:3000`.
- `cloudflared.service` (systemd user unit) runs the `portfolio` tunnel, which routes
  `chennunagavenkatasai.com` and `www.` to that port. Config: `~/.cloudflared/config.yml`.
- Secrets live in `.env.local` (see `.env.example`); it is gitignored.

To ship a change after pushing it to GitHub:

```sh
~/portfolio/deploy.sh
```

It pulls, installs, runs the tests, builds, and restarts the site.
Logs: `journalctl --user -u portfolio -f` and `journalctl --user -u cloudflared -f`.
