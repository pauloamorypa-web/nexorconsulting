#!/usr/bin/env bash
# Endurece o servidor Linux da Nexor (Ubuntu 22.04/24.04 ou Debian 12). Rode UMA vez, antes do instalar.sh.
#   - firewall (ufw): só SSH entra; o HTTPS chega pelo túnel da Cloudflare, sem portas abertas
#   - fail2ban: bloqueia quem erra a senha do SSH várias vezes
#   - atualizações de segurança automáticas
#   - SSH só com chave (desliga senha e login direto do root) — SÓ se já houver chave autorizada
#   - fuso de Brasília e sincronização do relógio (o 2FA e as licenças dependem da hora certa)
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Rode com sudo."; exit 1; }
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

say "Atualizando o sistema e instalando ufw, fail2ban e atualizações automáticas"
apt-get update && apt-get -y upgrade
apt-get install -y ufw fail2ban unattended-upgrades git openssl rsync curl
dpkg-reconfigure -f noninteractive unattended-upgrades

say "Firewall: só SSH"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

say "fail2ban no SSH"
cat > /etc/fail2ban/jail.d/nexor.local <<'J'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
findtime = 10m
J
systemctl enable --now fail2ban

say "Relógio: fuso de Brasília e sincronização"
timedatectl set-timezone America/Sao_Paulo
timedatectl set-ntp true

USUARIO="${SUDO_USER:-}"
if [ -n "$USUARIO" ] && [ -s "/home/$USUARIO/.ssh/authorized_keys" ]; then
  say "SSH só com chave (há chave autorizada para $USUARIO)"
  cat > /etc/ssh/sshd_config.d/99-nexor.conf <<'S'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
S
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
else
  printf '\n\033[1;33m⚠ Sem chave SSH autorizada para o usuário: a senha continua ligada.\n  Do seu computador: ssh-copy-id USUARIO@IP  →  e rode este script de novo.\033[0m\n'
fi
say "Pronto. Confira: sudo ufw status · sudo fail2ban-client status sshd"
