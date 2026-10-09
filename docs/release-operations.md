# Release operations

How releases work in this repository, what the release job checks, and what to do when one fails.
The workflow is [`.github/workflows/release.yml`](../.github/workflows/release.yml); most of its logic lives in
[`.github/scripts/release-refs.sh`](../.github/scripts/release-refs.sh). Baseline alignment is checked by
[`.github/scripts/verify-versions.sh`](../.github/scripts/verify-versions.sh).

## How a release works

Every push to `main` starts the `Release` workflow. After CI passes, the `release` job runs these steps, always in this order:

1. **Catch up.** Fast-forward to the current `origin/main` (a run may have waited in the queue). Fail if that is not possible.
2. **Verify the baseline** (`verify-versions.sh`, strict mode). For every public package, the manifest version, the latest `<project>@<version>` tag and the npm `latest` dist-tag must agree.
3. **Prepare the release** with `nx release --skip-publish`. Nx builds, bumps versions from conventional commits, updates changelogs and the lockfile, creates **one** signed commit `chore(versions): package.json version sync + changelog [skip ci]` and one signed annotated tag per released project.
4. **Decide.** If no new tags exist, nothing was releasable. The run ends green with the notice `No releasable changes. Nothing pushed, nothing published.`
5. **Validate** the new commit and tags: signatures, tag names, tags point at the release commit, source and `dist` versions equal the tag version, the commit is the only one on top of the baseline.
6. **Push atomically.** `git push --atomic` sends `main` and only the new tags in one operation. Either everything lands or nothing does.
7. **Publish** to npm from `dist` with `nx release publish`, using OIDC trusted publishing and provenance.

npm is touched only after GitHub has accepted the release commit and tags. A failure before step 7 leaves npm untouched.

Releases are serialized: one concurrency group, `cancel-in-progress: false`, `queue: max`. Runs wait in order, up to 100, and none is replaced or cancelled.

### What triggers a version bump

Commit type decides the bump (versions are `0.x`, so `feat` is minor and `fix` is patch):

| Commit | Bump |
| --- | --- |
| `feat(<project>): ...` | minor |
| `fix(<project>): ...` | patch |
| `feat(<project>)!: ...` or a `BREAKING CHANGE:` footer | major |
| `chore`, `ci`, `docs`, `test`, ... | none |

`feat` and breaking commits must be scoped to exact Nx project names, comma-separated for several
(for example `feat(aai-client,mas-client): ...`). Other types may use area scopes such as `release` or `ci`. Glob and tag-like
scopes are rejected on every type. Project names are `aai-client`, `ai-client-common`, `ai-client-state`, `ai-react-state`,
`ansible-lightspeed`, `arh-client`, `lightspeed-client`, `mas-client` and `rhel-lightspeed-client`.

PRs are squash-merged, so the **PR title** becomes the commit on `main`. The title is linted for that reason; fix a rejected title by editing it, which re-runs the check.

## What the run looks like

| Outcome | What you see | What it means |
| --- | --- | --- |
| Green, notice `No releasable changes...` | Nothing pushed, nothing published | Normal for `chore`/`ci`/`docs` merges, and for queued runs whose commits an earlier run already released |
| Green, step summary `Release prepared` | New commit and tags on `main`, new versions on npm | A release |
| Red at `Verify versions are aligned...` | Nothing changed | The baseline is inconsistent. See [Baseline check fails](#baseline-check-fails) |
| Red at `Push release commit and tags atomically` | Nothing changed anywhere | See [The push was rejected](#the-push-was-rejected) |
| Red at `Publish to npm` | Release commit and tags are on `main`, npm may be partly updated | See [Push succeeded but npm failed](#push-succeeded-but-npm-failed) |

## Failure handling

### The push was rejected

Typical cause: a PR (for example a MintMaker dependency update) merged while the release was running, so `main` moved and
the push is not a fast-forward. The same applies to a ruleset rejection (`GH013`).

- The run goes red. **Nothing was pushed and nothing was published.** The release commit and tags existed only on the runner.
- Do not retry the failed run. It would start from the same stale commit.
- The merge that moved `main` started its own run, which is queued behind this one. It fast-forwards to the new tip,
  recalculates versions from every commit since the last tags, and performs the release.
- If no newer run exists (for example the cause was a ruleset change), fix the cause and start a fresh run from the current `main`: push a
  commit, or re-run the latest `Release` run on `main`. Never re-run an older run of a commit that is no longer the tip.
- Never rebase, amend, retag or force-push the release commit to work around the rejection.

For a ruleset rejection, check that the bot can push to `main` and create tags (see [Required GitHub settings](#required-github-settings)).

### Baseline check fails

`verify-versions.sh` prints one line per package with a status. Common ones:

| Status | Meaning |
| --- | --- |
| `NPM_BEHIND` | Git has a version npm does not. A previous release pushed but did not publish. See below |
| `NPM_AHEAD` | npm has a version Git does not. Someone published outside the workflow. Stop and investigate. Do not tag by guesswork |
| `NO_TAG`, `TAG_MISMATCH`, `LATEST_TAG_BEHIND`, `TAG_MANIFEST_MISMATCH` | Tags and manifests disagree. Compare `git tag --list '<project>@*'` with the manifest and npm |
| `NEW_PACKAGE`, `NOT_ON_NPM` | A package with no tag or no npm record. See [Adding a package or a prerelease](#adding-a-package-or-a-prerelease) |
| `PRERELEASE`, `MALFORMED_VERSION` | Only stable `x.y.z` versions are released automatically |
| `REGISTRY_ERROR` | npm failed for a reason other than "not found". Retry; check npm status |

Run it locally with `.github/scripts/verify-versions.sh` (needs network for npm). Use the Node version from `.nvmrc`.

Until the baseline is consistent again, every release run stops at this step. That is deliberate: no new release is built on a broken baseline.

### Push succeeded but npm failed

The release commit and tags are on `main`, but one or more packages are not on npm. This is an incident for a maintainer, not a reason to bump again.

**Do not:** re-run the failed job (the strict check will fail with `NPM_BEHIND`), rebase, retag, bump versions, or force-push.

1. **Identify the release.** On GitHub find the commit `chore(versions): package.json version sync + changelog [skip ci]` on `main`
   and the tags that point at it (`git tag --points-at <sha>`). Both should show **Verified** (commit) and exist on the remote.
2. **Find what is missing on npm.** For each tag `<project>@<version>`, compare with the registry:
   `npm view <package-name> versions dist-tags --json`. Package names are in `packages/<dir>/package.json`.
   The recovery-mode verifier lists them: `.github/scripts/verify-versions.sh --mode recovery`
   (it accepts only "Git ahead of npm" and still fails on npm ahead of Git, missing tags and tag/manifest mismatches).
3. **Publish exactly the committed versions.** Check out the release commit, then install, build and publish. Never run `nx release version` here.

   ```sh
   git fetch origin --tags
   git checkout --detach <release-commit-sha>
   nvm use && npm ci
   npx nx run-many -t build
   # each dist manifest must equal its tag version before publishing
   node -p "require('./dist/packages/<project>/package.json').version"
   npx nx release publish --projects=<project>[,<project>...]
   ```

   `nx release publish` skips a version that is already on npm with the right dist-tag, so listing a package that did publish is harmless.
4. **Confirm.** Re-run `.github/scripts/verify-versions.sh` (strict mode, no flags) and expect all packages `OK`. The next run on `main` can then release normally.

**Trade-off:** the normal path publishes with OIDC trusted publishing from the workflow. A manual publish uses a maintainer's npm
credentials and 2FA and produces **no provenance attestation** for those versions. There is intentionally no publish-only
workflow (decision 2026-10-09). If incidents turn out to be common, a guarded `workflow_dispatch` that takes an exact release SHA is the next step.

### Merges while a release is running

Serialization stops two releases from pushing at once; it does not stop PRs from merging. Possible outcomes:

- The merge lands before the run's catch-up step: it is included in this release.
- The merge lands during the run: the push is rejected (see above), the run is red, and the queued run releases it.
- The merge lands after the push: it starts its own queued run and is released next if it is a `feat`/`fix`.

A queued run whose commits were already released finds no new tags and ends green.

### Adding a package or a prerelease

The workflow has no automatic path for these; the strict check will stop with `NEW_PACKAGE` or `PRERELEASE`. Do it deliberately:

1. Publish the first version manually (npm trusted publishing can only be configured for a package that exists).
2. Create the signed annotated tag `<project>@<version>` on the commit that holds that version, push it as the bot (tag creation is restricted to the bot) and
   configure the npm trusted publisher for `release.yml` and the `npm-publish` environment.
3. Confirm `.github/scripts/verify-versions.sh` passes. Never use `nx release --first-release` to bypass the registry checks.

Prerelease versions are not supported by the automatic release.

## Required GitHub settings

The workflow assumes these. Verify them when a push or tag is rejected.

| Setting | Expected |
| --- | --- |
| Environment `npm-publish` | Exists; holds or inherits the secrets below; protection rules match who may release |
| Secrets | `GH_BOT_TOKEN` (bot PAT with contents write), `GH_NAME`, `GH_EMAIL`, `GPG_PRIVATE_KEY` (base64 ASCII-armored private key) |
| Bot account `nacho-bot` | Its public GPG key is on the account so commits show **Verified**; it has Write access |
| Branch rulesets on `main` | The bot may bypass the pull-request rule; signed commits are required; force pushes and deletions are blocked |
| Tag ruleset | Creation of release tags restricted to the bot. GitHub cannot require signed *tags*, so this ruleset is what protects tag integrity |
| Required status check | `ci / ci` required on `main` |
| npm trusted publisher | Each package trusts `RedHatInsights/ai-web-clients`, workflow `release.yml`, environment `npm-publish` |

The release job does not audit historical tags for signatures; it checks only the tags it creates itself.

## Good to know

- **Atomic push and rulesets.** `git push --atomic` with a branch and tags depends on GitHub accepting a multi-ref push under the bot's bypass. The first real release is the first proof. If it is rejected, stop and review the authorization setup. Never fall back to publishing first or pushing in pieces.
- **`last-release` tag.** The old workflow moved this tag with a force push. The tag is still in the repository as history. Nothing moves it any more and nothing reads it.
- **`[skip ci]`.** The release commit contains it, so no follow-up workflow normally runs. If one does, it finds no new tags and ends green. A follow-up run triggered by the bot's PAT is expected to be a clean no-op.
- **After merging the release workflow change.** The first run on `main` is expected to be a no-op, because every commit since the last tags is `ci` or `chore`. Use it as a live check of the secrets, GPG import and verifier. The first real push and publish happens on the first `feat` or `fix` merge, and should be watched.
- **Provenance.** Published versions carry an npm provenance attestation. That it exists has been confirmed; its content (source commit and workflow) has not been inspected for the current versions.
- **Linters.** `queue: max` under `concurrency` is a recent GitHub Actions feature. Older workflow linters may flag it.
- **Local runs.** Do not run `npm run release` locally. `npm run release:dry-run` is safe and makes no changes.
