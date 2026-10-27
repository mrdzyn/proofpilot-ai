// Patch write-scope policy. Decides whether a repository-relative path may be
// written by the (future) patch agent. Deny by default.
import path from 'node:path/posix';

export type PatchPolicy = {
  schemaVersion: 1;
  fixtures: Record<string, { writable: string[]; allowedExtensions: string[] }>;
  trustRoots: string[];
  deniedNamePatterns: string[];
};

export type PathDecision = { allowed: boolean; reason: string };

export function checkPatchPath(policy: PatchPolicy, fixtureId: string, rawPath: string): PathDecision {
  const fixture = policy.fixtures[fixtureId];
  if (!fixture) return { allowed: false, reason: `unknown fixture ${fixtureId}` };
  if (typeof rawPath !== 'string' || rawPath.length === 0) return { allowed: false, reason: 'empty path' };
  if (rawPath.includes('\0') || rawPath.includes('\\')) return { allowed: false, reason: 'invalid characters' };
  if (rawPath.startsWith('/') || /^[a-zA-Z]:/.test(rawPath)) return { allowed: false, reason: 'absolute path' };
  if (rawPath.split('/').includes('..')) return { allowed: false, reason: 'parent traversal' };

  const normalized = path.normalize(rawPath);
  const base = path.basename(normalized);
  for (const pattern of policy.deniedNamePatterns) {
    if (new RegExp(pattern).test(base)) return { allowed: false, reason: `denied name pattern ${pattern}` };
  }
  for (const root of policy.trustRoots) {
    if (normalized === root.replace(/\/$/, '') || normalized.startsWith(root.endsWith('/') ? root : `${root}/`)) {
      return { allowed: false, reason: `trust root ${root}` };
    }
  }
  if (!fixture.writable.some((prefix) => normalized.startsWith(prefix))) {
    return { allowed: false, reason: 'outside fixture writable scope' };
  }
  if (!fixture.allowedExtensions.includes(path.extname(normalized))) {
    return { allowed: false, reason: `extension ${path.extname(normalized) || '(none)'} not allowed` };
  }
  return { allowed: true, reason: 'within fixture writable scope' };
}
