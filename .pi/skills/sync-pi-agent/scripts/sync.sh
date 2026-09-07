#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [--apply]\n' "${0##*/}"
}

apply=false
case "${1:-}" in
  '') ;;
  --apply) apply=true ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  usage >&2
  exit 2
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/../../../.." && pwd)
source_root=${PI_AGENT_HOME:-"$HOME/.pi/agent"}

if [[ ! -d $source_root ]]; then
  printf 'Source directory does not exist: %s\n' "$source_root" >&2
  exit 1
fi
if [[ ! -d $repo_root/.git ]]; then
  printf 'Repository root was not found: %s\n' "$repo_root" >&2
  exit 1
fi

added=0
updated=0
unchanged=0
blocked=0

is_sensitive_path() {
  local path=${1,,}
  [[ $path =~ (^|/)(auth|credentials?|mcp-oauth|sessions?|missions?|cache|npm|git|fff)(/|\.|$) ]] ||
    [[ $path =~ (^|[._/-])(secret|token|password|private[-_]?key|id_rsa|id_ed25519)([._/-]|$) ]] ||
    [[ $path == *.pem || $path == *.key || $path == *.p12 || $path == *.pfx || $path == *.env || $path == */.env.* ]]
}

has_suspected_secret() {
  local file=$1
  LC_ALL=C grep -Eiq -- '-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----|"?[[:alnum:]_-]*(api[_-]?key|token|secret|password|private[_-]?key)[[:alnum:]_-]*"?[[:space:]]*[:=][[:space:]]*"[^"[:space:]]{8,}|(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})' "$file"
}

sync_file() {
  local source=$1 destination_relative=$2 destination

  if is_sensitive_path "$source" || is_sensitive_path "$destination_relative"; then
    printf 'BLOCKED path: %s\n' "$destination_relative" >&2
    ((blocked += 1))
    return
  fi
  if has_suspected_secret "$source"; then
    printf 'BLOCKED suspected secret: %s\n' "$destination_relative" >&2
    ((blocked += 1))
    return
  fi

  destination=$repo_root/$destination_relative
  if [[ ! -e $destination ]]; then
    printf 'ADD     %s\n' "$destination_relative"
    ((added += 1))
  elif ! cmp -s -- "$source" "$destination"; then
    printf 'UPDATE  %s\n' "$destination_relative"
    ((updated += 1))
  else
    ((unchanged += 1))
    return
  fi

  if [[ $apply == true ]]; then
    mkdir -p -- "$(dirname -- "$destination")"
    cp -- "$source" "$destination"
  fi
}

sync_if_present() {
  local source_relative=$1 destination_relative=$2
  if [[ -f $source_root/$source_relative && ! -L $source_root/$source_relative ]]; then
    sync_file "$source_root/$source_relative" "$destination_relative"
  fi
}

sync_if_present AGENTS.md agent/AGENTS.md
sync_if_present settings.json agent/settings.json
sync_if_present keybindings.json agent/keybindings.json

for section in agents rules; do
  while IFS= read -r -d '' source; do
    name=${source##*/}
    if [[ $section == rules ]]; then
      sync_file "$source" "agent/rules/$name"
    else
      sync_file "$source" "agents/$name"
    fi
  done < <(find "$source_root/$section" -maxdepth 1 -type f -name '*.md' -print0 2>/dev/null || true)
done

if [[ -d $source_root/skills ]]; then
  while IFS= read -r -d '' skill_file; do
    skill_dir=${skill_file%/SKILL.md}
    while IFS= read -r -d '' source; do
      relative=${source#"$source_root/skills/"}
      case "$relative" in
        *.md|*.txt|*.json|*.yaml|*.yml|*.sh|*.bash|*.js|*.mjs|*.cjs|*.ts|*.tsx|*.py)
          sync_file "$source" "skills/$relative"
          ;;
      esac
    done < <(find "$skill_dir" -type f -print0)
  done < <(find "$source_root/skills" -mindepth 2 -maxdepth 2 -type f -name SKILL.md -print0)
fi

printf '\n%s: %d added, %d updated, %d unchanged, %d blocked.\n' \
  "$([[ $apply == true ]] && printf Applied || printf Preview)" \
  "$added" "$updated" "$unchanged" "$blocked"

if (( blocked > 0 )); then
  exit 3
fi
