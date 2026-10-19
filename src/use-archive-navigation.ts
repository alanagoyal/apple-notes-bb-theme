import {useEffect, useLayoutEffect, useRef} from 'react';
import {useBbContext, useBbNavigate, useRealtime, type PluginSidebarThread} from '@get-bb/plugin-sdk/app';
import {ARCHIVED_CHANNEL, createArchiveNavigation, sidebarThreadOrder} from './archive-navigation';

export function useArchiveNavigation(threads: readonly PluginSidebarThread[]) {
  const {threadId} = useBbContext();
  const navigate = useBbNavigate();
  const live = useRef({threads, threadId, navigate});
  live.current = {threads, threadId, navigate};
  const controller = useRef<ReturnType<typeof createArchiveNavigation> | null>(null);
  useRealtime(ARCHIVED_CHANNEL, payload => controller.current?.archived(payload));
  useLayoutEffect(() => {
    const navigation = createArchiveNavigation(() => ({
      ...live.current,
      order: sidebarThreadOrder(document.querySelector('[data-sidebar="content"]') || document.createDocumentFragment()),
      compose: !!document.getElementById('root-compose-main-panel'),
    }), id => live.current.navigate.toThread(id));
    controller.current = navigation;
    const observer = new MutationObserver(navigation.refresh);
    observer.observe(document.getElementById('root') || document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['data-sidebar-windowed-nav','hidden']});
    navigation.refresh();
    return () => { observer.disconnect(); navigation.cancel(); controller.current = null; };
  }, []);
  useLayoutEffect(() => { controller.current?.refresh(); }, [threads, threadId]);
  useEffect(() => {
    // Explicit navigation wins over a late archive event or pane transition.
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('a[href], [data-sidebar-header-slot] button, button[aria-label^="New thread"], button[aria-label="Home"]')) controller.current?.cancel();
    };
    const cancel = () => controller.current?.cancel();
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', cancel);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('popstate', cancel); };
  }, []);
}
