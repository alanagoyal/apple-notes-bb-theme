import type {ComposerSelection} from '@get-bb/plugin-sdk/app';

/** BB may normalize a host workspace into its corresponding provider. */
export function selectionMatches(requested: ComposerSelection, applied: ComposerSelection): boolean {
  for (const key of ['projectId', 'providerId', 'model', 'reasoningLevel'] as const) {
    if (requested[key] !== undefined && requested[key] !== applied[key]) return false;
  }
  const expected = requested.environment;
  if (expected?.type !== 'host') return true;
  const actual = applied.environment;
  if (actual?.type === 'host') {
    if (expected.hostId !== actual.hostId || expected.workspace.type !== actual.workspace.type) return false;
    return expected.workspace.type !== 'unmanaged' || actual.workspace.type !== 'unmanaged' || expected.workspace.path === actual.workspace.path;
  }
  if (actual?.type === 'provider' && actual.machine?.type === 'existing') {
    const provider = {personal: 'personal-workspace', unmanaged: 'project-checkout', 'managed-worktree': 'git-worktree'}[expected.workspace.type];
    return actual.machine.hostId === expected.hostId && actual.environmentProviderId === provider;
  }
  return false;
}
