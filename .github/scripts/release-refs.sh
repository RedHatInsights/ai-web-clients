#!/usr/bin/env bash
# release-refs.sh
#
# Git-side safeguards around `nx release --skip-publish` in the release workflow.
# Every command works on the repository in the current directory and never touches npm.
#
# Usage: release-refs.sh <command> [args]
#
#   check-origin <owner/repo>            fail unless `origin` points at that GitHub repository
#   fast-forward <remote> <branch>       fetch the branch and fast-forward HEAD to its tip
#                                        (HEAD may be behind after waiting in the release queue);
#                                        fails if HEAD is not an ancestor of the tip
#   configure-signing                    import the bot GPG key and configure Git to sign
#                                        env: GPG_PRIVATE_KEY (base64), GIT_USER_NAME, GIT_USER_EMAIL
#   snapshot-tags <file>                 record "<ref> <object>" for every tag
#   release-state <base-sha> <file>      compare HEAD and tags with the baseline; print
#                                          none     nothing was released (nothing to push)
#                                          release  one release commit and new tags exist
#                                        inconsistent states (tags without a commit, moved or
#                                        deleted tags) fail
#   validate-release <base-sha> <file>   check the signed release commit, signed annotated tags,
#                                        tag/HEAD identity and source/dist manifest versions
#   push-release <remote> <file>         atomically push HEAD and only the new tags, then
#                                        confirm the remote refs
#
# Environment:
#   RELEASE_BRANCH   branch that receives the release commit (default: main)
#
# Exit 0: success, 1: check failed, 2: usage error

set -euo pipefail

RELEASE_BRANCH="${RELEASE_BRANCH:-main}"
# refs/tags/<nx project name>@<stable semver>
TAG_REF_PATTERN='^refs/tags/([A-Za-z0-9][A-Za-z0-9._-]*)@((0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))$'

die() {
  echo "release-refs: $*" >&2
  exit 1
}

note() {
  echo "release-refs: $*" >&2
}

usage_error() {
  echo "release-refs: $*" >&2
  echo "usage: release-refs.sh <check-origin|fast-forward|configure-signing|snapshot-tags|release-state|validate-release|push-release> [args]" >&2
  exit 2
}

# ---------- repository identity ----------

origin_slug() {
  local url="$1"
  url="$(sed -E 's#^(https://)[^/@]*@#\1#' <<<"$url")"
  url="${url%/}"
  url="${url%.git}"
  case "$url" in
    https://github.com/*) echo "${url#https://github.com/}" ;;
    git@github.com:*) echo "${url#git@github.com:}" ;;
    ssh://git@github.com/*) echo "${url#ssh://git@github.com/}" ;;
    *) return 1 ;;
  esac
}

check_origin() {
  local expected="$1" url slug
  url="$(git remote get-url origin)" || die "no origin remote"
  slug="$(origin_slug "$url")" || die "origin is not a GitHub URL: $url"
  [[ "${slug,,}" == "${expected,,}" ]] || die "origin is $slug, expected $expected"
  note "origin is $slug"
}

# ---------- branch tip ----------

fast_forward() {
  local remote="$1" branch="$2" tip
  git fetch --no-tags "$remote" "+refs/heads/$branch:refs/remotes/$remote/$branch" >&2
  tip="$(git rev-parse --verify "refs/remotes/$remote/$branch^{commit}")"
  if [[ "$(git rev-parse HEAD)" == "$tip" ]]; then
    note "already at $remote/$branch ($tip)"
    return
  fi
  git merge-base --is-ancestor HEAD "$tip" || die "HEAD is not an ancestor of $remote/$branch ($tip); cannot fast-forward"
  git merge --ff-only "$tip" >&2
  note "fast-forwarded to $remote/$branch ($tip)"
}

# ---------- signing ----------

signing_fingerprint() {
  gpg --list-secret-keys --with-colons | awk -F: '$1 == "sec" { primary = 1; next } primary && $1 == "fpr" { print $10; exit }'
}

configure_signing() {
  : "${GPG_PRIVATE_KEY:?GPG_PRIVATE_KEY is required}"
  : "${GIT_USER_NAME:?GIT_USER_NAME is required}"
  : "${GIT_USER_EMAIL:?GIT_USER_EMAIL is required}"
  printf '%s' "$GPG_PRIVATE_KEY" | base64 -d | gpg --batch --import >&2 || die "could not import the GPG key"
  local fingerprint
  fingerprint="$(signing_fingerprint)"
  [[ -n "$fingerprint" ]] || die "no secret key available after import"
  git config user.name "$GIT_USER_NAME"
  git config user.email "$GIT_USER_EMAIL"
  git config user.signingkey "$fingerprint"
  git config commit.gpgsign true
  git config tag.gpgsign true
  note "signing as $GIT_USER_NAME <$GIT_USER_EMAIL> with key $fingerprint"
}

# ---------- tag snapshots ----------

snapshot_tags() {
  git for-each-ref --format='%(refname) %(objectname)' refs/tags | LC_ALL=C sort
}

write_snapshot() {
  snapshot_tags >"$1"
}

# Refs that exist now but not in the baseline file.
new_tag_refs() {
  LC_ALL=C comm -13 <(cut -d' ' -f1 "$1") <(snapshot_tags | cut -d' ' -f1)
}

# Baseline refs that were deleted or now point elsewhere.
changed_tag_refs() {
  LC_ALL=C comm -23 "$1" <(snapshot_tags) | cut -d' ' -f1
}

# ---------- release state ----------

release_state() {
  local base="$1" snapshot="$2" moved new head
  moved="$(changed_tag_refs "$snapshot")"
  [[ -z "$moved" ]] || die "existing tags were moved or deleted: $(tr '\n' ' ' <<<"$moved")"
  new="$(new_tag_refs "$snapshot")"
  head="$(git rev-parse HEAD)"
  if [[ -z "$new" ]]; then
    [[ "$head" == "$base" ]] || note "WARNING: HEAD moved ($base -> $head) without new tags; discarding it, nothing will be pushed"
    echo none
    return
  fi
  [[ "$head" != "$base" ]] || die "tags were created but there is no release commit"
  echo release
}

# ---------- release validation ----------

manifest_version() {
  node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version))' "$1"
}

assert_manifest_version() {
  local file="$1" expected="$2" actual
  [[ -f "$file" ]] || die "$file is missing"
  actual="$(manifest_version "$file")"
  [[ "$actual" == "$expected" ]] || die "$file is at $actual, tag says $expected"
}

validate_tag() {
  local ref="$1" project version
  [[ "$ref" =~ $TAG_REF_PATTERN ]] || die "unexpected tag created: $ref"
  project="${BASH_REMATCH[1]}"
  version="${BASH_REMATCH[2]}"
  [[ "$(git cat-file -t "$ref")" == "tag" ]] || die "$ref is not an annotated tag"
  git verify-tag "$ref" >&2 || die "$ref has no valid signature"
  [[ "$(git rev-list -n 1 "$ref")" == "$(git rev-parse HEAD)" ]] || die "$ref does not point at the release commit"
  assert_manifest_version "packages/$project/package.json" "$version"
  assert_manifest_version "dist/packages/$project/package.json" "$version"
  [[ -f "dist/packages/$project/src/index.js" ]] || die "dist/packages/$project/src/index.js is missing"
}

validate_release_commit() {
  local base="$1"
  git verify-commit HEAD >&2 || die "HEAD has no valid signature"
  [[ "$(git rev-list --count "$base..HEAD")" == "1" ]] || die "expected exactly one release commit on top of $base"
  [[ "$(git rev-parse 'HEAD^')" == "$base" ]] || die "release commit is not a direct child of $base"
  [[ -z "$(git status --porcelain)" ]] || die "working tree is not clean after the release"
}

validate_release() {
  local base="$1" snapshot="$2" refs ref
  validate_release_commit "$base"
  refs="$(new_tag_refs "$snapshot")"
  [[ -n "$refs" ]] || die "no new tags to validate"
  while IFS= read -r ref; do
    validate_tag "$ref"
    note "validated $ref"
  done <<<"$refs"
}

# ---------- push ----------

remote_ref_object() {
  git ls-remote "$1" "$2" | awk 'NR == 1 { print $1 }'
}

confirm_remote_refs() {
  local remote="$1"
  shift
  [[ "$(remote_ref_object "$remote" "refs/heads/$RELEASE_BRANCH")" == "$(git rev-parse HEAD)" ]] ||
    die "$remote/$RELEASE_BRANCH does not match the local release commit"
  local ref
  for ref in "$@"; do
    [[ "$(remote_ref_object "$remote" "$ref")" == "$(git rev-parse "$ref")" ]] || die "$remote did not record $ref"
  done
}

push_release() {
  local remote="$1" snapshot="$2" refs ref
  local -a refspecs=() tag_refs=()
  refs="$(new_tag_refs "$snapshot")"
  [[ -n "$refs" ]] || die "no new tags to push"
  while IFS= read -r ref; do
    [[ "$ref" =~ $TAG_REF_PATTERN ]] || die "refusing to push unexpected tag: $ref"
    refspecs+=("$ref:$ref")
    tag_refs+=("$ref")
  done <<<"$refs"
  HUSKY=0 git push --atomic "$remote" "HEAD:refs/heads/$RELEASE_BRANCH" "${refspecs[@]}" >&2 || die "atomic push was rejected; nothing was published"
  confirm_remote_refs "$remote" "${tag_refs[@]}"
  note "pushed ${#tag_refs[@]} tag(s) and $RELEASE_BRANCH"
}

# ---------- dispatch ----------

require_args() {
  local count="$1" name="$2"
  shift 2
  [[ $# -ge "$count" ]] || usage_error "$name needs $count argument(s)"
}

main() {
  [[ $# -ge 1 ]] || usage_error "missing command"
  local command="$1"
  shift
  case "$command" in
    check-origin) require_args 1 "$command" "$@" && check_origin "$1" ;;
    fast-forward) require_args 2 "$command" "$@" && fast_forward "$1" "$2" ;;
    configure-signing) configure_signing ;;
    snapshot-tags) require_args 1 "$command" "$@" && write_snapshot "$1" ;;
    release-state) require_args 2 "$command" "$@" && release_state "$1" "$2" ;;
    validate-release) require_args 2 "$command" "$@" && validate_release "$1" "$2" ;;
    push-release) require_args 2 "$command" "$@" && push_release "$1" "$2" ;;
    *) usage_error "unknown command: $command" ;;
  esac
}

main "$@"
