#!/usr/bin/env bash
# Gate for nx release: manifest, latest reachable tag and npm latest must agree.
set -euo pipefail
cd "${VERIFY_REPO_ROOT:-$(dirname "$0")/../..}"

fail=0
printf '%-45s %-10s %-10s %s\n' PACKAGE DISK TAG NPM
for dir in packages/*/; do
  [[ $(jq -r '.private // false' "$dir/package.json") == true ]] && continue
  name=$(jq -r .name "$dir/package.json")
  disk=$(jq -r .version "$dir/package.json")
  project=$(jq -r .name "$dir/project.json")
  tag=$(git tag --merged HEAD --list "${project}@*" | sed "s/^${project}@//" \
        | { grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' || true; } | sort -V | tail -1)
  npm=$(npm view "$name" dist-tags.latest 2>/dev/null || echo ERROR)
  printf '%-45s %-10s %-10s %s\n' "$name" "$disk" "${tag:-NONE}" "$npm"
  [[ $disk == "$tag" && $disk == "$npm" ]] || { echo "::error::$name versions disagree"; fail=1; }
done
exit $fail
