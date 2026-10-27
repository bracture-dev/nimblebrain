#!/usr/bin/env bash
# Save your Anthropic API key for NimbleBrain's own chat. Run it yourself, in your own terminal; your
# coding agent never runs it and never sees the key. Do not paste the key into an agent chat.
#
# macOS: the key goes into your login keychain as service "nimblebrain", account ANTHROPIC_API_KEY.
#        start.sh reads it from there into NimbleBrain's environment only.
# Linux: the key goes into <checkout>/.env (gitignored), and the file is set to mode 600.
#
# Usage: set-key.sh [<checkout>]             open the Console keys page, then save or replace the key
#        set-key.sh --have-key [<checkout>]  skip the Console; just ask for the key you already have
#        set-key.sh --check [<checkout>]     print "key saved: yes" or "key saved: no"; never reads it
# NB_KEYCHAIN_SERVICE overrides the service name, NB_KEYCHAIN a keychain file (both for tests).

set -euo pipefail

check=0 guide=1
case "${1:-}" in --check) check=1; shift ;; --have-key) guide=0; shift ;; esac
dir=${1:-${NB_DIR:-$HOME/nimblebrain}}
service=${NB_KEYCHAIN_SERVICE:-nimblebrain}
account=ANTHROPIC_API_KEY
keychain=${NB_KEYCHAIN:-}

if [ "$(uname)" = Darwin ]; then
  if [ "$check" = 1 ]; then
    # Without -w, security prints only the item's attributes; the key itself is not read.
    if security find-generic-password -s "$service" -a "$account" ${keychain:+"$keychain"} >/dev/null 2>&1; then
      echo "key saved: yes (keychain service $service)"
    else
      echo "key saved: no"
    fi
    exit 0
  fi
fi
if [ "$guide" = 1 ] && [ "$(uname)" = Darwin ]; then
  open https://console.anthropic.com/settings/keys 2>/dev/null || true
  echo "Get a key at https://console.anthropic.com/settings/keys (opened in your browser):"
  echo "  1. Sign in to the Anthropic Console."
  echo "  2. Press Create Key and give it a name, such as nimblebrain."
  echo "  3. Copy the key. It starts with sk-ant-."
  echo "Each chat turn uses the key and costs money: https://www.anthropic.com/pricing"
fi
if [ "$(uname)" != Darwin ]; then
  if [ "$check" = 1 ]; then
    if [ -f "$dir/.env" ] && grep -Eq '^ANTHROPIC_API_KEY=.+' "$dir/.env"; then
      echo "key saved: yes ($dir/.env)"
    else
      echo "key saved: no"
    fi
    exit 0
  fi
  if [ "$guide" = 1 ]; then
    echo "Get a key at https://console.anthropic.com/settings/keys: sign in, press Create Key, copy it."
    echo "Each chat turn uses the key and costs money: https://www.anthropic.com/pricing"
  fi
fi

# A key already saved is replaced only after a yes. Without a terminal to ask on, NB_REPLACE=1 says yes.
saved=0
if [ "$(uname)" = Darwin ]; then
  security find-generic-password -s "$service" -a "$account" ${keychain:+"$keychain"} >/dev/null 2>&1 && saved=1
else
  [ -f "$dir/.env" ] && grep -Eq '^ANTHROPIC_API_KEY=.+' "$dir/.env" && saved=1
fi
if [ "$saved" = 1 ]; then
  if [ -t 0 ]; then
    printf 'A key is already saved. Replace it? [y/N] '
    read -r yes
  else
    yes=${NB_REPLACE:-n}
  fi
  case "$yes" in [yY1]*) ;; *) echo "Kept the saved key; nothing changed."; exit 0 ;; esac
fi

printf 'Paste the key (nothing shows as you paste), then press Return: '
if [ -t 0 ]; then IFS= read -rs key; else IFS= read -r key; fi
echo
case "$key" in
  sk-ant-*) ;;
  "") echo "No key entered; nothing saved." >&2; exit 1 ;;
  *) echo "That does not look like an Anthropic key (they start with sk-ant-); nothing saved." >&2; exit 1 ;;
esac
case "$key" in *[!A-Za-z0-9_-]*) echo "The key has unexpected characters; nothing saved." >&2; exit 1 ;; esac

if [ "$(uname)" = Darwin ]; then
  # security -i reads the command from stdin, so the key never appears in any process's arguments.
  # printf is a shell builtin, so it starts no process either. -U replaces only this one item.
  printf 'add-generic-password -U -s "%s" -a "%s" -w "%s" %s\n' "$service" "$account" "$key" "${keychain:+\"$keychain\"}" |
    security -i >/dev/null
  unset key
  echo "saved in your keychain (service $service, account $account)"
  echo "Restart NimbleBrain to use it: stop.sh, then start.sh."
else
  env_file="$dir/.env"
  [ -d "$dir" ] || { echo "No checkout at $dir; pass its folder." >&2; exit 1; }
  [ -L "$env_file" ] && { echo "$env_file is a link; edit the file it points to yourself. Nothing saved." >&2; exit 1; }
  . "$(dirname "$0")/lib.sh"
  backup_once "$dir" "$env_file"
  (umask 077 && touch "$env_file")
  chmod 600 "$env_file"
  tmp=$(umask 077 && mktemp "$dir/.env.XXXXXX")
  grep -v '^ANTHROPIC_API_KEY=' "$env_file" >"$tmp" || true
  printf 'ANTHROPIC_API_KEY=%s\n' "$key" >>"$tmp"
  unset key
  chmod 600 "$tmp"
  mv "$tmp" "$env_file"
  echo "saved in $env_file (mode 600)"
  echo "Restart NimbleBrain to use it: stop.sh, then start.sh."
fi
