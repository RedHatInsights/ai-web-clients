#!/usr/bin/env bash
# verify-versions.sh
#
# Compares three sources of truth for every public Nx release project in packages/*:
#   1. the source manifest version (packages/<dir>/package.json)
#   2. the latest stable, reachable git tag "<nxProjectName>@<version>"
#   3. the npm "latest" dist-tag of the published package
# Also checks that the tagged commit holds the manifest version named by its tag.
# Run before `nx release`; only complete alignment is accepted.
#
# Usage: verify-versions.sh (no arguments)
# Environment: VERIFY_REPO_ROOT overrides the repository root for fixture tests.
# Exit 0: aligned, 1: verification/operational failure, 2: usage error

set -euo pipefail

REPO_ROOT="${VERIFY_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
STABLE_SEMVER='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
PRERELEASE_SEMVER='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-[0-9A-Za-z.-]+(\+[0-9A-Za-z.-]+)?$'
PROJECT_NAME_PATTERN='^[A-Za-z0-9][A-Za-z0-9._-]*$'
NPM_NAME_PATTERN='^(@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$'

usage_error() {
  echo "verify-versions.sh accepts no arguments" >&2
  echo "Usage: verify-versions.sh" >&2
  exit 2
}

die() {
  echo "verify-versions: $*. See docs/release-operations.md." >&2
  exit 1
}

# ---------- small helpers ----------

is_stable_semver() { [[ "$1" =~ $STABLE_SEMVER ]]; }
is_prerelease_semver() { [[ "$1" =~ $PRERELEASE_SEMVER ]]; }

# Read a typed top-level field from a JSON object. Absent fields print nothing;
# callers decide whether absence is allowed. Malformed input never produces a value.
json_field() {
  node -e '
    const metadata = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("expected JSON object");
    }
    const value = metadata[process.argv[2]];
    if (value !== undefined && typeof value !== process.argv[3]) {
      throw new Error("unexpected field type");
    }
    process.stdout.write(value === undefined ? "" : String(value));
  ' "$1" "$2" "$3"
}

list_package_dirs() {
  [[ -d "$REPO_ROOT/packages" && -r "$REPO_ROOT/packages" && -x "$REPO_ROOT/packages" ]] || return 1
  find "$REPO_ROOT/packages" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort
}

# ---------- git side ----------

# Latest stable semver among tags "<project>@<version>" reachable from HEAD, or NONE.
# The "@" separator isolates shared prefixes; validated names cannot be glob patterns.
latest_reachable_tag_version() {
  local project="$1" tags tag version latest
  local -a versions=()
  tags="$(git -C "$REPO_ROOT" tag --merged HEAD --list "${project}@*")" || return 1
  if [[ -n "$tags" ]]; then
    while IFS= read -r tag; do
      [[ "$tag" == "${project}@"* ]] || continue
      version="${tag#"${project}@"}"
      is_stable_semver "$version" || continue
      versions+=("$version")
    done <<<"$tags"
  fi
  if [[ ${#versions[@]} -eq 0 ]]; then
    echo "NONE"
    return 0
  fi
  latest="$(printf '%s\n' "${versions[@]}" | LC_ALL=C sort -V | tail -1)" || return 1
  echo "$latest"
}

# Fail on either a Git read or JSON parse failure, even with plausible stdout.
manifest_version_at_tag() {
  local tag="$1" manifest_path="$2" manifest version
  manifest="$(git -C "$REPO_ROOT" show "refs/tags/${tag}^{commit}:${manifest_path}" 2>/dev/null)" || return 1
  version="$(node -e '
    const manifest = JSON.parse(process.argv[1]);
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest) ||
        typeof manifest.version !== "string" || !manifest.version) {
      throw new Error("expected manifest version string");
    }
    process.stdout.write(manifest.version);
  ' "$manifest" 2>/dev/null)" || return 1
  printf '%s' "$version"
}

# ---------- npm side ----------

# Sets NPM_STATE (OK | NOT_ON_NPM | REGISTRY_ERROR) and NPM_LATEST.
lookup_npm() {
  local pkg="$1" output rc=0
  NPM_STATE="OK"
  NPM_LATEST=""

  output="$(npm view "$pkg" dist-tags --json --fetch-timeout=10000 2>"$NPM_STDERR_FILE")" || rc=$?
  if [[ $rc -ne 0 ]]; then
    if grep -q 'E404' "$NPM_STDERR_FILE" || grep -q 'E404' <<<"$output"; then
      NPM_STATE="NOT_ON_NPM"
    else
      NPM_STATE="REGISTRY_ERROR"
    fi
    return 0
  fi

  # An absent latest parses successfully to empty; it is a classification failure,
  # not an aligned version. A parser failure is always a registry error.
  if ! NPM_LATEST="$(parse_npm_metadata "$output" 2>/dev/null)"; then
    NPM_STATE="REGISTRY_ERROR"
    NPM_LATEST=""
  fi
}

parse_npm_metadata() {
  node -e '
    const tags = JSON.parse(process.argv[1]);
    if (tags === null || typeof tags !== "object" || Array.isArray(tags)) {
      throw new Error("expected npm dist-tag object");
    }
    if (tags.latest !== undefined && typeof tags.latest !== "string") {
      throw new Error("expected latest dist-tag string");
    }
    process.stdout.write(tags.latest ?? "");
  ' "$1"
}

# ---------- classification ----------

# Pure decision table. Args: disk tag npm_state npm_latest. Only OK is accepted.
classify_versions() {
  local disk="$1" tag="$2" npm_state="$3" npm_latest="$4"

  if is_prerelease_semver "$disk"; then echo "PRERELEASE"; return; fi
  if ! is_stable_semver "$disk"; then echo "MALFORMED_VERSION"; return; fi
  if [[ "$npm_state" == "REGISTRY_ERROR" ]]; then echo "REGISTRY_ERROR"; return; fi
  if [[ "$tag" == "NONE" && "$npm_state" == "NOT_ON_NPM" ]]; then echo "NEW_PACKAGE"; return; fi
  if [[ "$tag" == "NONE" ]]; then echo "NO_TAG"; return; fi
  if [[ "$npm_state" == "NOT_ON_NPM" ]]; then echo "NOT_ON_NPM"; return; fi
  if ! is_stable_semver "$npm_latest"; then echo "NPM_UNEXPECTED_LATEST"; return; fi

  if [[ "$disk" == "$tag" && "$disk" == "$npm_latest" ]]; then echo "OK"; return; fi
  if [[ "$disk" == "$tag" ]]; then echo "NPM_LATEST_MISMATCH"; return; fi
  if [[ "$disk" == "$npm_latest" ]]; then echo "TAG_MISMATCH"; return; fi
  echo "MISMATCH"
}

status_explanation() {
  case "$1" in
    MANIFEST_ERROR) echo "package manifest is missing, unreadable or invalid; public packages require an npm name and version" ;;
    INVALID_PROJECT_NAME) echo "public package requires readable, valid project.json with a plain project name" ;;
    PRERELEASE) echo "manifest version is a prerelease; prereleases need a deliberate, approved procedure" ;;
    MALFORMED_VERSION) echo "manifest version is not valid semver" ;;
    REGISTRY_ERROR) echo "npm registry lookup failed (timeout, auth, outage or invalid dist-tag response)" ;;
    NEW_PACKAGE) echo "new/unpublished package: no tag and not on npm; needs a deliberate first-release procedure" ;;
    NO_TAG) echo "published on npm but no reachable stable tag exists; do not guess a tag target, reconcile it" ;;
    NOT_ON_NPM) echo "tag exists but the package is not on npm" ;;
    NPM_UNEXPECTED_LATEST) echo "npm latest dist-tag is missing or not a stable version" ;;
    TAG_MISMATCH) echo "manifest and npm agree but the latest reachable tag differs" ;;
    NPM_LATEST_MISMATCH) echo "manifest and tag agree but npm latest differs; inspect registry history to determine the cause" ;;
    TAG_MANIFEST_MISMATCH) echo "tagged manifest is unreadable, invalid or differs from the tag version" ;;
    MISMATCH) echo "manifest, tag and npm disagree" ;;
    *) echo "unexpected status" ;;
  esac
}

# ---------- per-project verification ----------

# Classified input failures set VERIFIED_STATUS and return normally for reporting.
# Unexpected operational failures abort; callers must not suppress errors and skip.
verify_package_dir() {
  local dir="$1" name_dir manifest private project_name npm_name disk tag_version tagged_version
  name_dir="${dir##*/}"
  [[ -d "$dir" && -r "$dir" && -x "$dir" ]] || die "could not read discovered package directory"
  manifest="$dir/package.json"
  VERIFIED_SKIP="no"
  VERIFIED_NPM_NAME="packages/$name_dir"
  VERIFIED_DISK="-"
  VERIFIED_TAG="-"
  VERIFIED_NPM="-"
  VERIFIED_STATUS="MANIFEST_ERROR"

  if [[ ! -e "$manifest" && ! -L "$manifest" && ! -e "$dir/project.json" && ! -L "$dir/project.json" ]]; then
    VERIFIED_SKIP="yes"
    return 0
  fi
  [[ -f "$manifest" && -r "$manifest" ]] || return 0
  private="$(json_field "$manifest" private boolean 2>/dev/null)" || return 0
  if [[ "$private" == "true" ]]; then
    VERIFIED_SKIP="yes"
    return 0
  fi

  npm_name="$(json_field "$manifest" name string 2>/dev/null)" || return 0
  [[ "$npm_name" =~ $NPM_NAME_PATTERN ]] || return 0
  VERIFIED_NPM_NAME="$npm_name"
  disk="$(json_field "$manifest" version string 2>/dev/null)" || return 0
  [[ -n "$disk" ]] || return 0
  VERIFIED_DISK="$disk"

  VERIFIED_STATUS="INVALID_PROJECT_NAME"
  [[ -f "$dir/project.json" && -r "$dir/project.json" ]] || return 0
  project_name="$(json_field "$dir/project.json" name string 2>/dev/null)" || return 0
  if [[ ! "$project_name" =~ $PROJECT_NAME_PATTERN ]]; then
    echo "::error::packages/${name_dir}: invalid project name in project.json" >&2
    return 0
  fi

  tag_version="$(latest_reachable_tag_version "$project_name")" || die "could not enumerate reachable tags for $project_name"
  lookup_npm "$npm_name"
  VERIFIED_TAG="$tag_version"
  VERIFIED_NPM="${NPM_LATEST:-NO_LATEST}"
  [[ "$NPM_STATE" == "OK" ]] || VERIFIED_NPM="$NPM_STATE"
  VERIFIED_STATUS="$(classify_versions "$disk" "$tag_version" "$NPM_STATE" "$NPM_LATEST")" || die "could not classify $npm_name"
  if [[ "$VERIFIED_STATUS" == "OK" ]]; then
    if ! tagged_version="$(manifest_version_at_tag "${project_name}@${tag_version}" "packages/${name_dir}/package.json")"; then
      VERIFIED_STATUS="TAG_MANIFEST_MISMATCH"
    elif [[ "$tagged_version" != "$tag_version" ]]; then
      VERIFIED_STATUS="TAG_MANIFEST_MISMATCH"
    fi
  fi
}

# ---------- reporting ----------

print_header() {
  printf "%-55s %-12s %-12s %-15s %s\n" "PACKAGE" "DISK" "GIT TAG" "NPM" "STATUS"
  printf '%.0s-' {1..110}
  printf '\n'
}

print_row() {
  local marker="✗"
  [[ "$VERIFIED_STATUS" == "OK" ]] && marker="✓"
  printf "%-55s %-12s %-12s %-15s %s %s\n" \
    "$VERIFIED_NPM_NAME" "$VERIFIED_DISK" "$VERIFIED_TAG" "$VERIFIED_NPM" "$marker" "$VERIFIED_STATUS"
}

report_failure() {
  echo "::error::${VERIFIED_NPM_NAME}: ${VERIFIED_STATUS}: $(status_explanation "$VERIFIED_STATUS") (disk=${VERIFIED_DISK}, tag=${VERIFIED_TAG}, npm=${VERIFIED_NPM})"
}

print_summary() {
  echo ""
  if [[ "$1" -ne 0 ]]; then
    echo "Version verification FAILED ($1 project(s)). Fix mismatches before releasing."
    echo "See docs/release-operations.md for operator guidance."
  else
    echo "All package versions are aligned across disk, git tags, and npm registry."
  fi
}

# ---------- main ----------

main() {
  [[ $# -eq 0 ]] || usage_error
  local failures=0 public_projects=0 dirs dir
  NPM_STDERR_FILE="$(mktemp)" || die "could not create npm diagnostic file"
  trap 'rm -f "$NPM_STDERR_FILE"' EXIT

  dirs="$(list_package_dirs)" || die "could not discover package directories"
  [[ -n "$dirs" ]] || die "no package directories found"
  print_header
  while IFS= read -r dir; do
    verify_package_dir "$dir"
    [[ "$VERIFIED_SKIP" == "yes" ]] && continue
    public_projects=$((public_projects + 1))
    print_row
    if [[ "$VERIFIED_STATUS" != "OK" ]]; then
      failures=$((failures + 1))
      report_failure
    fi
  done <<<"$dirs"

  [[ "$public_projects" -gt 0 ]] || die "no public projects found"
  print_summary "$failures"
  [[ "$failures" -eq 0 ]]
}

main "$@"
