export const ARCHIVED_CHANNEL = 'note-archived';

interface Thread {
  id: string;
  isArchived: boolean;
  isHidden: boolean;
}

interface State {
  threadId: string | null;
  threads: readonly Thread[];
  order: readonly string[];
  compose: boolean;
}

// Keep the pre-archive order: the native list may remove the row before its
// confirmed archive event arrives, or before the native pane closes.
export function createArchiveNavigation(read: () => State, open: (id: string) => void, now = Date.now) {
  let snapshot: {threadId: string; previousId: string | null; leftAt: number | null} | null = null;
  let pending: {threadId: string; previousId: string; expiresAt: number} | null = null;
  const active = (state: State, id: string) => state.threads.some(t => t.id === id && !t.isArchived && !t.isHidden);
  const refresh = () => {
    const state = read();
    if (pending) {
      if (now() > pending.expiresAt || (state.threadId && state.threadId !== pending.threadId)) pending = null;
      else if (!state.threadId && state.compose) {
        const destination = pending.previousId;
        pending = null; snapshot = null;
        if (active(state, destination)) open(destination);
        return;
      }
    }
    if (state.threadId) {
      if (snapshot?.threadId !== state.threadId) snapshot = null;
      const index = state.order.indexOf(state.threadId);
      if (index >= 0 && active(state, state.threadId)) {
        snapshot = {threadId: state.threadId, previousId: state.order[index - 1] ?? null, leftAt: null};
      } else if (snapshot) {
        snapshot.leftAt ??= now();
      }
    } else if (snapshot) {
      snapshot.leftAt ??= now();
      if (now() - snapshot.leftAt > 5000) snapshot = null;
    }
  };
  return {
    refresh,
    archived(payload: unknown) {
      if (!payload || typeof payload !== 'object' || !('threadId' in payload) || typeof payload.threadId !== 'string') return;
      if (pending?.previousId === payload.threadId) pending = null;
      const state = read();
      if (!snapshot || snapshot.threadId !== payload.threadId || !snapshot.previousId) return;
      if (state.threadId && state.threadId !== snapshot.threadId) return;
      if (!state.threadId && (!state.compose || (snapshot.leftAt !== null && now() - snapshot.leftAt > 5000))) return;
      pending = {threadId: snapshot.threadId, previousId: snapshot.previousId, expiresAt: now() + 5000};
      refresh();
    },
    cancel() { snapshot = null; pending = null; },
  };
}

// Include virtualized placeholders in DOM order, just like BB's sidebar
// keyboard navigation. Collapsed groups and overflow rows are excluded.
export function sidebarThreadOrder(root: ParentNode): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => { if (id && !seen.has(id)) { seen.add(id); order.push(id); } };
  root.querySelectorAll<HTMLElement>('[data-sidebar-thread-shortcut-target], [data-sidebar-windowed-nav]').forEach(node => {
    if (node.closest('[hidden], [data-sidebar-overflow="true"]') || !node.getBoundingClientRect().height) return;
    if (node.dataset.sidebarThreadId) add(node.dataset.sidebarThreadId);
    else for (const pair of (node.dataset.sidebarWindowedNav || '').split(' ')) {
      const separator = pair.indexOf(':');
      if (separator > 0 && separator < pair.length - 1) add(pair.slice(0, separator));
    }
  });
  return order;
}
