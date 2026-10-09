#!/usr/bin/env bash
# verify-versions.sh
#
# Compares three sources of truth for every public Nx release project in packages/*:
#   1. the source manifest version (packages/<dir>/package.json)
#   2. the latest stable, reachable git tag "<nxProjectName>@<version>"
#   3. the npm "latest" dist-tag of the published package
#
# Run it before `nx release` so a release never starts from an inconsistent baseline.
#
# Usage: verify-versions.sh [--mode strict|recovery] [--require-signed-tags]
#
#   --mode strict            (default) every project must be fully aligned.
#   --mode recovery          additionally allows "git is ahead of npm" (a previous release
#                            pushed to git but failed to publish). Every other mismatch,
#                            including npm being ahead of git, still fails.
#   --require-signed-tags    the latest tag of each project must pass `git verify-tag`,
#                            unless it is listed verbatim in the grandfather file
#                            (GRANDFATHERED_TAGS_FILE, default .github/grandfathered-tags.txt).
#
# Environment:
#   VERIFY_REPO_ROOT         override the repository root (used by the fixture tests)
#   GRANDFATHERED_TAGS_FILE  override the grandfathered-tags file
#
# Exit 0: aligned (or, in recovery mode, only recoverable drift)
# Exit 1: at least one project failed verification
# Exit 2: usage error

set -euo pipefail

REPO_ROOT="${VERIFY_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GRANDFATHERED_TAGS_FILE="${GRANDFATHERED_TAGS_FILE:-$REPO_ROOT/.github/grandfathered-tags.txt}"
MODE="strict"
REQUIRE_SIGNED_TAGS="false"

STABLE_SEMVER='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
PRERELEASE_SEMVER='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-[0-9A-Za-z.-]+(\+[0-9A-Za-z.-]+)?$'
PROJECT_NAME_PATTERN='^[A-Za-z0-9][A-Za-z0-9._-]*$'

NPM_STDERR_FILE="$(mktemp)"
trap 'rm -f "$NPM_STDERR_FILE"' EXIT

# ---------- argument handling ----------

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        [[ $# -ge 2 ]] || usage_error "--mode needs a value"
        MODE="$2"
        shift 2
        ;;
      --require-signed-tags)
        REQUIRE_SIGNED_TAGS="true"
        shift
        ;;
      *)
        usage_error "Unknown argument: $1"
        ;;
    esac
  done
  case "$MODE" in
    strict | recovery) ;;
    *) usage_error "Unknown mode: $MODE (expected strict or recovery)" ;;
  esac
}

usage_error() {
  echo "$1" >&2
  echo "Usage: verify-versions.sh [--mode strict|recovery] [--require-signed-tags]" >&2
  exit 2
}

# ---------- small helpers ----------

is_stable_semver() { [[ "$1" =~ $STABLE_SEMVER ]]; }
is_prerelease_semver() { [[ "$1" =~ $PRERELEASE_SEMVER ]]; }

# True when $1 is strictly greater than $2. Only valid for stable semver inputs.
version_greater() {
  [[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" == "$1" ]]
}

# Read a top-level field from a JSON file. Prints an empty string when absent.
json_field() {
  node -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]];
    process.stdout.write(value === undefined ? "" : String(value));
  ' "$1" "$2"
}

list_package_dirs() {
  find "$REPO_ROOT/packages" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort
}

# ---------- git side ----------

# Latest stable semver among tags "<project>@<version>" reachable from HEAD, or NONE.
# The "@" separator keeps "ai-client" from matching "ai-client-common@..." tags, and
# project names are validated beforehand so they can't act as glob patterns.
latest_reachable_tag_version() {
  local project="$1" tag version latest=""
  while IFS= read -r tag; do
    version="${tag#"${project}@"}"
    is_stable_semver "$version" || continue
    if [[ -z "$latest" ]] || version_greater "$version" "$latest"; then
      latest="$version"
    fi
  done < <(git -C "$REPO_ROOT" tag --merged HEAD --list "${project}@*")
  echo "${latest:-NONE}"
}

# Manifest version stored in the commit the tag points to, or empty if unreadable.
manifest_version_at_tag() {
  local tag="$1" manifest_path="$2"
  git -C "$REPO_ROOT" show "refs/tags/${tag}^{commit}:${manifest_path}" 2>/dev/null \
    | node -e '
        let input = "";
        process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
          try { process.stdout.write(String(JSON.parse(input).version)); } catch (e) {}
        });
      '
}

is_grandfathered_tag() {
  [[ -f "$GRANDFATHERED_TAGS_FILE" ]] && grep -Fxq -- "$1" "$GRANDFATHERED_TAGS_FILE"
}

tag_signature_acceptable() {
  is_grandfathered_tag "$1" && return 0
  git -C "$REPO_ROOT" verify-tag "refs/tags/$1" > /dev/null 2>&1
}

# Extra git checks for a project that is already aligned on disk and tag.
# Prints a failing status name, or nothing when everything is fine.
git_side_failure() {
  local tag="$1" version="$2" manifest_path="$3"
  if [[ "$(manifest_version_at_tag "$tag" "$manifest_path")" != "$version" ]]; then
    echo "TAG_MANIFEST_MISMATCH"
  elif [[ "$REQUIRE_SIGNED_TAGS" == "true" ]] && ! tag_signature_acceptable "$tag"; then
    echo "TAG_UNSIGNED"
  fi
}

# ---------- npm side ----------

# Sets NPM_STATE (OK | NOT_ON_NPM | REGISTRY_ERROR), NPM_LATEST and NPM_DISK_PUBLISHED.
lookup_npm() {
  local pkg="$1" disk_version="$2" output rc=0 parsed
  NPM_STATE="OK"
  NPM_LATEST=""
  NPM_DISK_PUBLISHED="no"

  output="$(npm view "$pkg" versions dist-tags --json --fetch-timeout=10000 2> "$NPM_STDERR_FILE")" || rc=$?
  if [[ $rc -ne 0 ]]; then
    if grep -q 'E404' "$NPM_STDERR_FILE" || grep -q 'E404' <<< "$output"; then
      NPM_STATE="NOT_ON_NPM"
    else
      NPM_STATE="REGISTRY_ERROR"
    fi
    return 0
  fi

  parsed="$(parse_npm_metadata "$output" "$disk_version")" || parsed=""
  if [[ -z "$parsed" ]]; then
    NPM_STATE="REGISTRY_ERROR"
    return 0
  fi
  NPM_LATEST="${parsed%%|*}"
  NPM_DISK_PUBLISHED="${parsed##*|}"
}

# Prints "<latest dist-tag or empty>|<yes|no: is the disk version published>".
parse_npm_metadata() {
  node -e '
    const metadata = JSON.parse(process.argv[1]);
    const versions = [].concat(metadata.versions || []);
    const latest = (metadata["dist-tags"] || {}).latest || "";
    process.stdout.write(latest + "|" + (versions.includes(process.argv[2]) ? "yes" : "no"));
  ' "$1" "$2"
}

# ---------- classification ----------

# Pure decision table. Args: disk tag npm_state npm_latest disk_published
# Prints one status name; OK means fully aligned.
classify_versions() {
  local disk="$1" tag="$2" npm_state="$3" npm_latest="$4" disk_published="$5"

  if is_prerelease_semver "$disk"; then echo "PRERELEASE"; return; fi
  if ! is_stable_semver "$disk"; then echo "MALFORMED_VERSION"; return; fi
  if [[ "$npm_state" == "REGISTRY_ERROR" ]]; then echo "REGISTRY_ERROR"; return; fi
  if [[ "$tag" == "NONE" && "$npm_state" == "NOT_ON_NPM" ]]; then echo "NEW_PACKAGE"; return; fi
  if [[ "$tag" == "NONE" ]]; then echo "NO_TAG"; return; fi
  if [[ "$npm_state" == "NOT_ON_NPM" ]]; then echo "NOT_ON_NPM"; return; fi
  if ! is_stable_semver "$npm_latest"; then echo "NPM_UNEXPECTED_LATEST"; return; fi

  if [[ "$disk" == "$tag" && "$disk" == "$npm_latest" ]]; then echo "OK"; return; fi
  if [[ "$disk" == "$tag" ]]; then
    classify_git_aligned_drift "$disk" "$npm_latest" "$disk_published"
    return
  fi
  if [[ "$disk" == "$npm_latest" ]]; then echo "TAG_MISMATCH"; return; fi
  echo "MISMATCH"
}

# Disk and tag agree, npm latest differs.
classify_git_aligned_drift() {
  local disk="$1" npm_latest="$2" disk_published="$3"
  if version_greater "$npm_latest" "$disk"; then
    echo "NPM_AHEAD"
  elif [[ "$disk_published" == "yes" ]]; then
    echo "LATEST_TAG_BEHIND"
  else
    echo "NPM_BEHIND"
  fi
}

status_is_acceptable() {
  case "$1" in
    OK) return 0 ;;
    NPM_BEHIND) [[ "$MODE" == "recovery" ]] ;;
    *) return 1 ;;
  esac
}

status_explanation() {
  case "$1" in
    PRERELEASE) echo "manifest version is a prerelease; prereleases need a deliberate, approved procedure" ;;
    MALFORMED_VERSION) echo "manifest version is not valid semver" ;;
    REGISTRY_ERROR) echo "npm registry lookup failed (timeout, auth, outage or unparseable response)" ;;
    NEW_PACKAGE) echo "new/unpublished package: no tag and not on npm; needs a deliberate first-release procedure" ;;
    NO_TAG) echo "published on npm but no reachable stable tag exists; do not guess a tag target, reconcile it" ;;
    NOT_ON_NPM) echo "tag exists but the package is not on npm" ;;
    NPM_UNEXPECTED_LATEST) echo "npm latest dist-tag is missing or not a stable version" ;;
    TAG_MISMATCH) echo "manifest and npm agree but the latest reachable tag differs" ;;
    NPM_AHEAD) echo "npm latest is ahead of git; npm was published without a matching commit/tag" ;;
    LATEST_TAG_BEHIND) echo "the version is on npm but the latest dist-tag points at a different version" ;;
    NPM_BEHIND) echo "git is ahead of npm; a previous publish likely failed (see recovery mode)" ;;
    TAG_MANIFEST_MISMATCH) echo "the tagged commit holds a different manifest version than the tag name" ;;
    TAG_UNSIGNED) echo "latest tag is not signed and not listed in the grandfather file" ;;
    MISMATCH) echo "manifest, tag and npm disagree" ;;
    *) echo "unexpected status" ;;
  esac
}

# ---------- per-project verification ----------

# Prints the final status for one package directory. Sets VERIFIED_* globals for reporting.
verify_package_dir() {
  local dir="$1"
  local name_dir manifest project_name npm_name tag_version git_failure status

  name_dir="$(basename "$dir")"
  manifest="$dir/package.json"
  [[ -f "$manifest" ]] || return 1

  VERIFIED_SKIP="no"
  if [[ "$(json_field "$manifest" private)" == "true" ]]; then
    VERIFIED_SKIP="yes"
    return 0
  fi

  project_name="$(json_field "$dir/project.json" name 2> /dev/null || true)"
  npm_name="$(json_field "$manifest" name)"
  VERIFIED_NPM_NAME="$npm_name"
  VERIFIED_DISK="$(json_field "$manifest" version)"

  if [[ ! "$project_name" =~ $PROJECT_NAME_PATTERN ]]; then
    echo "::error::packages/${name_dir}: invalid project name '${project_name}' in project.json" >&2
    VERIFIED_TAG="-"
    VERIFIED_NPM="-"
    VERIFIED_STATUS="INVALID_PROJECT_NAME"
    return 0
  fi

  tag_version="$(latest_reachable_tag_version "$project_name")"
  lookup_npm "$npm_name" "$VERIFIED_DISK"
  VERIFIED_TAG="$tag_version"
  VERIFIED_NPM="$(npm_display_value)"

  status="$(classify_versions "$VERIFIED_DISK" "$tag_version" "$NPM_STATE" "$NPM_LATEST" "$NPM_DISK_PUBLISHED")"
  if status_is_acceptable "$status" && [[ "$tag_version" != "NONE" ]]; then
    git_failure="$(git_side_failure "${project_name}@${tag_version}" "$tag_version" "packages/${name_dir}/package.json")"
    [[ -z "$git_failure" ]] || status="$git_failure"
  fi
  VERIFIED_STATUS="$status"
}

npm_display_value() {
  case "$NPM_STATE" in
    OK) echo "${NPM_LATEST:-NO_LATEST}" ;;
    *) echo "$NPM_STATE" ;;
  esac
}

# ---------- reporting ----------

print_header() {
  printf "%-55s %-12s %-12s %-15s %s\n" "PACKAGE" "DISK" "GIT TAG" "NPM" "STATUS"
  printf '%.0s-' {1..110}
  printf '\n'
}

print_row() {
  local marker="✗"
  status_is_acceptable "$VERIFIED_STATUS" && marker="✓"
  printf "%-55s %-12s %-12s %-15s %s %s\n" \
    "$VERIFIED_NPM_NAME" "$VERIFIED_DISK" "$VERIFIED_TAG" "$VERIFIED_NPM" "$marker" "$VERIFIED_STATUS"
}

report_failure() {
  echo "::error::${VERIFIED_NPM_NAME}: ${VERIFIED_STATUS}: $(status_explanation "$VERIFIED_STATUS") (disk=${VERIFIED_DISK}, tag=${VERIFIED_TAG}, npm=${VERIFIED_NPM})"
}

print_summary() {
  local failures="$1" behind="$2"
  echo ""
  if [[ "$failures" -ne 0 ]]; then
    echo "Version verification FAILED (${MODE} mode). Fix mismatches before releasing."
    if [[ "$MODE" == "strict" ]]; then
      echo "If git is ahead of npm after a failed publish, use --mode recovery to confirm that is the only drift."
    fi
    return
  fi
  if [[ -n "$behind" ]]; then
    echo "Packages behind on npm:${behind}"
    echo "Publish these already-committed versions; do not bump versions or retag."
  else
    echo "All package versions are aligned across disk, git tags, and npm registry."
  fi
}

# ---------- main ----------

main() {
  parse_args "$@"
  local failures=0 behind="" dir

  print_header
  while IFS= read -r dir; do
    verify_package_dir "$dir" || continue
    [[ "$VERIFIED_SKIP" == "yes" ]] && continue
    print_row
    if ! status_is_acceptable "$VERIFIED_STATUS"; then
      failures=$((failures + 1))
      report_failure
    elif [[ "$VERIFIED_STATUS" == "NPM_BEHIND" ]]; then
      behind="${behind} ${VERIFIED_NPM_NAME}@${VERIFIED_DISK}"
    fi
  done < <(list_package_dirs)

  print_summary "$failures" "$behind"
  [[ "$failures" -eq 0 ]]
}

main "$@"
