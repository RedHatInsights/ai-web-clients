'use strict';

// Commit scope policy that matches how `nx release` selects projects.
//
//  - `feat` and any breaking commit must name one or more releasable Nx project
//    names (the `name` in packages/<dir>/project.json, NOT the npm package name).
//  - Everything else may use free-form area scopes (`release`, `deps`, ...), but
//    never glob or tag patterns: Nx treats a scope as a project matcher and aborts
//    the whole release when a scope is ambiguous.
//  - The release job's `chore(versions): package.json version sync + changelog`
//    commit is exempt as a safeguard in case a body ever mentions "BREAKING CHANGE:".
//
// A valid scope does not guarantee a bump: Nx still only bumps projects whose
// files the commit touched.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const HEADER_PATTERN = /^(\w+)(?:\((.*?)\))?(!)?: /;
const BREAKING_FOOTER_PATTERN = /BREAKING[ -]CHANGE:/;
const RELEASE_COMMIT_PATTERN = /^chore\(versions\): package\.json version sync \+ changelog( \[skip ci\])?$/;
const AREA_SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// ---------- parsing ----------

/** Returns { type, scope, bang } or null when the header is not conventional. */
function parseHeader(header) {
  const match = HEADER_PATTERN.exec(header || '');
  if (!match) return null;
  const [, type, scope, bang] = match;
  return { type: type.toLowerCase(), scope: scope === undefined ? null : scope, bang: Boolean(bang) };
}

function isBreakingCommit({ header, body, footer }) {
  const parsed = parseHeader(header);
  if (parsed && parsed.bang) return true;
  return BREAKING_FOOTER_PATTERN.test(`${body || ''}\n${footer || ''}`);
}

function requiresProjectScope(commit, parsedHeader) {
  return parsedHeader.type === 'feat' || isBreakingCommit(commit);
}

function splitScope(scope) {
  return scope.split(',').map((item) => item.trim());
}

// ---------- validation ----------

function describeValidProjects(projectNames) {
  return `Use an Nx project name (not the npm package name). Valid names: ${projectNames.join(', ')}.`;
}

function findDuplicates(items) {
  return items.filter((item, index) => items.indexOf(item) !== index);
}

/** Returns a list of problems with a scope used on a versioning commit. */
function projectScopeProblems(scope, projectNames) {
  if (scope === null || scope.trim() === '') return ['a project scope is required'];
  const items = splitScope(scope);
  if (items.some((item) => item === '')) return ['scope contains an empty entry'];
  const unknown = items.filter((item) => !projectNames.includes(item));
  const duplicates = findDuplicates(items);
  return [
    ...unknown.map((item) => `"${item}" is not a releasable project`),
    ...duplicates.map((item) => `duplicate scope "${item}"`),
  ];
}

/** Returns a list of problems with a scope used on a non versioning commit. */
function areaScopeProblems(scope) {
  if (scope === null) return [];
  const items = splitScope(scope);
  if (items.some((item) => item === '')) return ['scope contains an empty entry'];
  return items
    .filter((item) => !AREA_SCOPE_PATTERN.test(item))
    .map((item) => `"${item}" looks like a pattern; Nx would treat it as a project matcher`);
}

function failure(header, problems, hint) {
  return {
    valid: false,
    message: `Invalid scope in "${header}": ${problems.join('; ')}. ${hint}`.trim(),
  };
}

function validateVersioningCommit(commit, parsedHeader, loadProjectNames) {
  let projectNames;
  try {
    projectNames = loadProjectNames();
  } catch (error) {
    return failure(
      commit.header,
      [`could not load releasable projects (${error.message})`],
      'Versioning commits cannot be validated without them.'
    );
  }
  const problems = projectScopeProblems(parsedHeader.scope, projectNames);
  return problems.length === 0
    ? { valid: true }
    : failure(commit.header, problems, describeValidProjects(projectNames));
}

/**
 * @param commit { header, body, footer }
 * @param loadProjectNames () => string[]  only called when the commit needs a project scope
 * @returns { valid: boolean, message?: string }
 */
function validateCommit(commit, loadProjectNames) {
  const parsedHeader = parseHeader(commit.header);
  if (!parsedHeader) return { valid: true }; // other commitlint rules reject malformed headers
  if (RELEASE_COMMIT_PATTERN.test(commit.header)) return { valid: true };

  if (requiresProjectScope(commit, parsedHeader)) {
    return validateVersioningCommit(commit, parsedHeader, loadProjectNames);
  }
  const problems = areaScopeProblems(parsedHeader.scope);
  return problems.length === 0
    ? { valid: true }
    : failure(commit.header, problems, 'Use a plain word such as "release" or "deps".');
}

// ---------- project discovery ----------

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function releasableProjectName(packageDir) {
  const manifestFile = path.join(packageDir, 'package.json');
  if (!fs.existsSync(manifestFile) || readJson(manifestFile).private === true) return null;
  const projectFile = path.join(packageDir, 'project.json');
  if (!fs.existsSync(projectFile)) throw new Error(`${projectFile} is missing`);
  const { name } = readJson(projectFile);
  if (!name) throw new Error(`${projectFile} has no name`);
  return name;
}

/** Nx project names of the public packages under packages/*, sorted. */
function loadReleasableProjectNames(root = DEFAULT_ROOT) {
  const packagesDir = path.join(root, 'packages');
  const names = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => releasableProjectName(path.join(packagesDir, entry.name)))
    .filter(Boolean)
    .sort();
  if (names.length === 0) throw new Error(`no releasable projects found in ${packagesDir}`);
  return names;
}

// ---------- commitlint adapter ----------

/** Builds a commitlint rule function: (parsed, when) => [valid, message?]. */
function createScopeRule(loadProjectNames = () => loadReleasableProjectNames()) {
  return (parsed, when = 'always') => {
    if (when === 'never') return [true];
    const result = validateCommit(
      { header: parsed.header, body: parsed.body, footer: parsed.footer },
      loadProjectNames
    );
    return result.valid ? [true] : [false, result.message];
  };
}

module.exports = {
  parseHeader,
  isBreakingCommit,
  validateCommit,
  loadReleasableProjectNames,
  createScopeRule,
};
