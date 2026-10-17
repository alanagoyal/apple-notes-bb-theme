import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  definePluginApp, experimental_useSidebarThreads, useBbNavigate,
  type PluginThreadHeaderActionProps,
} from '@get-bb/plugin-sdk/app';
import './app.css';
import { cancelNoteHandoff } from './note-handoff';
import { dateGroup } from './date-groups';
import { NaturalRouting } from './natural-routing';
import { installThemeColorSync } from './theme-color-sync';
import { installNewNoteFocus } from './new-note-focus';

// Readiness belongs to a thread, not a virtualizer's replaceable DOM node.
const revealedThreads = new Set<string>();

const shortDate = (value: number) => new Date(value).toLocaleDateString(undefined, {month:'numeric',day:'numeric',year:'numeric'});

// Present the already-mounted native sidebar as mobile home; no second list.
function useMobileNotesHome() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(max-width:767px)');
    let panel: HTMLElement | null = null;
    const restore = () => {
      if (!panel) return;
      panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
      panel.inert = panel.getAttribute('data-state') !== 'open';
      panel = null;
    };
    const sync = () => {
      const home = !!document.querySelector('[data-testid="root-compose-compact-home"]');
      if (!home) root.classList.remove('an-mobile-compose');
      const show = media.matches && home && !root.classList.contains('an-mobile-compose');
      const next = show ? document.querySelector<HTMLElement>('[data-sidebar="panel"]') : null;
      if (panel !== next) { restore(); panel = next; }
      if (panel) {
        if (panel.inert) panel.inert = false;
        if (panel.getAttribute('role') !== 'navigation') panel.setAttribute('role','navigation');
        panel.removeAttribute('aria-modal');
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!media.matches || !document.querySelector('[data-testid="root-compose-compact-home"]')) return;
      const button = (event.target as Element)?.closest('button');
      if (!button) return;
      if (button.matches('[data-sidebar-header-slot] button') || button.getAttribute('aria-label')?.startsWith('New thread')) {
        root.classList.add('an-mobile-compose'); restore();
      } else if (button.getAttribute('aria-label')?.startsWith('Toggle sidebar') || button.getAttribute('aria-label') === 'Home') {
        root.classList.remove('an-mobile-compose');
        if (button.getAttribute('aria-label')?.startsWith('Toggle sidebar')) {
          event.preventDefault(); event.stopPropagation();
        }
        sync();
      }
    };
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync(); }); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.getElementById('root') || document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['inert','data-state']});
    document.addEventListener('click',onClick,true); media.addEventListener('change',sync); sync();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame); document.removeEventListener('click',onClick,true); media.removeEventListener('change',sync);
      restore(); root.classList.remove('an-mobile-compose');
    };
  },[]);
}

function useSidebarSearchShortcut() {
  useEffect(() => {
    let frame = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || event.repeat || event.defaultPrevented) return;
      const target = event.composedPath()[0];
      if (target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],.monaco-editor,.cm-editor,.xterm')) return;
      if (document.querySelector('[role="dialog"][data-state="open"]:not([data-sidebar="panel"]), [role="alertdialog"], [role="menu"][data-state="open"]')) return;
      const field = document.querySelector<HTMLInputElement>('.an-search input');
      if (!field) return;
      event.preventDefault();
      const panel = field.closest('[data-sidebar="panel"]');
      const hidden = !!field.closest('[inert]') || panel?.getAttribute('data-collapsible') === 'rail' || getComputedStyle(field).visibility === 'hidden';
      if (hidden) document.querySelector<HTMLButtonElement>('button[aria-label^="Toggle sidebar"]')?.click();
      cancelAnimationFrame(frame);
      const started = performance.now();
      const focus = () => {
        const input = document.querySelector<HTMLInputElement>('.an-search input');
        if (input && !input.closest('[inert]') && getComputedStyle(input).visibility !== 'hidden' && input.getBoundingClientRect().width > 0) {
          const content = input.closest('[data-sidebar="content"]');
          if (content) content.scrollTop = 0;
          input.focus({preventScroll:true}); input.select(); frame = 0;
        } else if (performance.now() - started < 1200) frame = requestAnimationFrame(focus);
      };
      frame = requestAnimationFrame(focus);
    };
    document.addEventListener('keydown',onKeyDown);
    return () => { document.removeEventListener('keydown',onKeyDown); cancelAnimationFrame(frame); };
  },[]);
}

function useNoteAutoFocus() {
  useEffect(() => {
    let frame = 0;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      const newNote = !!button && (button.matches('[data-sidebar-header-slot] button') || !!button.getAttribute('aria-label')?.startsWith('New thread'));
      const row = target.closest('[data-sidebar-rename-row]');
      const link = target.closest<HTMLAnchorElement>('a[href*="/threads/"]')
        ?? (!button ? row?.querySelector<HTMLAnchorElement>('a[href*="/threads/"]') : null);
      if (!newNote && !link) return;
      // Touch navigation should not summon the keyboard for an existing note.
      // New notes may focus once in the gesture, never in a retry loop.
      if (window.matchMedia('(pointer: coarse)').matches) {
        if (newNote) document.getElementById('root-compose-prompt')?.focus({preventScroll:true});
        return;
      }
      const path = link ? new URL(link.href,location.href).pathname : null;
      cancelAnimationFrame(frame);
      const started = performance.now();
      let firstVisible = 0;
      const focus = () => {
        const input = path && location.pathname !== path ? null : document.getElementById(path ? 'thread-detail-follow-up-composer' : 'root-compose-prompt');
        if (input && !input.closest('[inert]') && getComputedStyle(input).visibility !== 'hidden' && input.getBoundingClientRect().width > 0) {
          if (!firstVisible) firstVisible = performance.now();
          input.focus({preventScroll:true});
          // Native navigation can replace the editor or restore sidebar focus.
          frame = performance.now() - firstVisible < 600 ? requestAnimationFrame(focus) : 0;
        } else if (performance.now() - started < 1500) frame = requestAnimationFrame(focus);
      };
      // Focus inside the user gesture as well, so iOS can open its keyboard.
      focus();
    };
    const cancel = () => { cancelAnimationFrame(frame); frame = 0; };
    document.addEventListener('pointerdown',cancel,true);
    document.addEventListener('keydown',cancel,true);
    document.addEventListener('click',onClick,true);
    return () => { document.removeEventListener('click',onClick,true); document.removeEventListener('pointerdown',cancel,true); document.removeEventListener('keydown',cancel,true); cancelAnimationFrame(frame); };
  },[]);
}


// Forward pane-wide file drops to BB's original attachment handler.
function useThreadFileDrop() {
  useEffect(() => {
    const marked = new Set<HTMLElement>();
    const clear = () => { marked.forEach(pane => pane.removeAttribute('data-an-file-drop')); marked.clear(); };
    const destination = (event: DragEvent) => {
      if (!(event.target instanceof Element)) return null;
      const pane = event.target.closest<HTMLElement>('[data-split-pane-id], #root-compose-main-panel');
      const editor = pane?.querySelector<HTMLElement>('#thread-detail-follow-up-composer, #root-compose-prompt');
      const form = editor?.closest('form[data-promptbox]');
      if (!pane || !form || pane.closest('[inert]')) return null;
      return {pane,form};
    };
    const over = (event: DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      const target = destination(event);
      if (!target) { clear(); return; }
      event.preventDefault();
      // One pane-wide treatment replaces the native composer's drag outline.
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      if (!marked.has(target.pane)) {
        clear(); target.pane.setAttribute('data-an-file-drop',''); marked.add(target.pane);
      }
    };
    const drop = (event: DragEvent) => {
      clear();
      if (!event.dataTransfer?.files.length) return;
      const target = destination(event);
      if (!target || target.form.contains(event.target as Node)) return;
      event.preventDefault(); event.stopPropagation();
      target.form.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:event.dataTransfer}));
    };
    const leave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node) || !Array.from(marked).some(pane => pane.contains(event.relatedTarget as Node))) clear();
    };
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') clear(); };
    document.addEventListener('dragenter',over,true);
    document.addEventListener('dragover',over,true);
    document.addEventListener('drop',drop,true);
    document.addEventListener('dragleave',leave,true);
    document.addEventListener('dragend',clear,true);
    document.addEventListener('keydown',cancel,true);
    window.addEventListener('blur',clear);
    return () => {
      clear(); document.removeEventListener('dragenter',over,true); document.removeEventListener('dragover',over,true); document.removeEventListener('drop',drop,true);
      document.removeEventListener('dragleave',leave,true); document.removeEventListener('dragend',clear,true);
      document.removeEventListener('keydown',cancel,true); window.removeEventListener('blur',clear);
    };
  },[]);
}

// Pinned and virtualized lists wrap rows differently. Determine adjacent
// separators from the actual row bounds, never from wrapper siblings.
function useNoteSeparators() {
  useLayoutEffect(() => {
    let frame = 0;
    let marked = new Set<HTMLElement>();
    const selector = '[data-sidebar-rename-row]:has(> span > [data-sidebar-thread-id])';
    const sync = () => {
      frame = 0;
      const hidden = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>('[data-sidebar="content"]').forEach(sidebar => {
        const rows = Array.from(sidebar.querySelectorAll<HTMLElement>(selector))
          .map(node => ({node,rect:node.getBoundingClientRect()}))
          .filter(({rect}) => rect.width > 0 && rect.height > 0)
          .sort((a,b) => a.rect.top - b.rect.top);
        rows.forEach(({node,rect},index) => {
          if (!node.matches('.bb-sidebar-selected-row,:hover,[data-state="open"],:focus-visible') && !node.querySelector('[data-state="open"], [data-sidebar-rename-anchor]:focus-visible')) return;
          hidden.add(node);
          const previous = rows[index-1];
          // Section headings and collapsed/hidden groups break adjacency.
          if (previous && Math.abs(previous.rect.left-rect.left) < 2 && rect.top-previous.rect.bottom >= -1 && rect.top-previous.rect.bottom <= 6) hidden.add(previous.node);
        });
      });
      marked.forEach(node => { if (!hidden.has(node)) node.removeAttribute('data-an-separator-hidden'); });
      hidden.forEach(node => { if (!node.hasAttribute('data-an-separator-hidden')) node.setAttribute('data-an-separator-hidden',''); });
      marked = hidden;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    const observer = new MutationObserver(records => {
      if (records.some(record => record.target instanceof Element && (record.target.closest('[data-sidebar="content"]') || record.target.querySelector('[data-sidebar="content"]')))) schedule();
    });
    observer.observe(document.getElementById('root') || document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-state','style','hidden']});
    const events = ['pointerover','pointerout','focusin','focusout','scroll'] as const;
    const onSidebarEvent = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-sidebar="content"]')) schedule();
    };
    events.forEach(event => document.addEventListener(event,onSidebarEvent,true));
    window.addEventListener('resize',schedule); sync();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      events.forEach(event => document.removeEventListener(event,onSidebarEvent,true));
      window.removeEventListener('resize',schedule);
      marked.forEach(node => node.removeAttribute('data-an-separator-hidden'));
    };
  },[]);
}

function NotesEnhancements() {
  useEffect(() => cancelNoteHandoff, []);
  useMobileNotesHome();
  useSidebarSearchShortcut();
  useNoteAutoFocus();
  useEffect(installNewNoteFocus, []);
  useThreadFileDrop();
  useNoteSeparators();
  const { threads, projects } = experimental_useSidebarThreads();
  const navigate = useBbNavigate();
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const live = useRef({threads, projects});
  live.current = {threads, projects};
  useLayoutEffect(() => {
    const owned = new Set<HTMLElement>();
    const timelines = new Map<HTMLElement, number>();
    const prepareSurface = (container: HTMLElement | null, needsHeading: boolean) => {
      if (!container || timelines.has(container)) return;
      const started = performance.now();
      let previous = '', stableSince = started;
      const settle = () => {
        if (!container.isConnected) { timelines.delete(container); return; }
        const rect = container.getBoundingClientRect();
        const composer = (container.closest('[data-split-pane-id]') || container)?.querySelector('form[data-promptbox]')?.getBoundingClientRect();
        const heading = container.querySelector('.an-document-heading')?.getBoundingClientRect();
        const list = container.querySelector('[data-timeline-row-list]')?.getBoundingClientRect();
        const signature = [rect.y, rect.height, rect.width, heading?.height, list?.y, list?.height, composer?.y, composer?.height, document.styleSheets.length].join(':');
        const now = performance.now();
        if (signature !== previous) { previous = signature; stableSince = now; }
        if ((now - stableSince >= 120 && (needsHeading ? container.querySelector('.an-document-heading h1') : composer)) || now - started > 1500) {
          container.setAttribute('data-an-initial-ready', '');
          if (container.dataset.anThreadId) revealedThreads.add(container.dataset.anThreadId);
          timelines.set(container, 0);
        } else timelines.set(container, requestAnimationFrame(settle));
      };
      timelines.set(container, requestAnimationFrame(settle));
    };
    let frame = 0;
    let search: HTMLElement | null = null;
    const reconcile = () => {
      frame = 0;
      timelines.forEach((id, node) => { if (!node.isConnected) { cancelAnimationFrame(id); timelines.delete(node); } });
      document.querySelectorAll<HTMLElement>('[data-timeline-row-list="top-level"]').forEach(list => prepareSurface(list.parentElement, true));
      document.querySelectorAll<HTMLElement>('#root-compose-main-panel').forEach(panel => prepareSurface(panel, false));
      const content = document.querySelector<HTMLElement>('[data-sidebar="content"]:has([data-bb-plugin="thread-list"], [data-thread-list-placeholder="loading"])');
      if (content && !search?.isConnected) {
        search = document.createElement('div');
        search.className = 'an-search-mount';
        content.prepend(search);
        owned.add(search);
        setMount(search);
      }
      // Placeholder decorations belong to the native editor. Rewriting them
      // can ping-pong with its DOM observer; presentation is handled in CSS.
      document.querySelectorAll<HTMLElement>('[data-promptbox-shell]:has(#root-compose-prompt)').forEach(shell => {
        if (shell.querySelector(':scope > .an-new-note-date')) return;
        const date = document.createElement('time');
        date.className = 'an-new-note-date';
        const now = new Date(); date.dateTime = now.toISOString();
        date.textContent = now.toLocaleString(undefined,{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
        shell.prepend(date); owned.add(date);
      });
      const byId = new Map(live.current.threads.map(t => [t.id,t]));
      const names = new Map(live.current.projects.map(p => [p.id,p.name]));
      const wantedHeadings = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>('[data-sidebar-visibility-group="threads"]').forEach(group => {
        let previous = '';
        let first = '';
        group.querySelectorAll<HTMLElement>('[data-sidebar-thread-id]').forEach(anchor => {
          const thread = byId.get(anchor.dataset.sidebarThreadId!);
          const row = anchor.closest<HTMLElement>('[data-sidebar-rename-row]');
          const item = row?.closest<HTMLElement>('[data-sidebar-windowed-item]');
          if (!thread || thread.isPinned || !row || !item) return;
          const bucket = dateGroup(thread.updatedAt);
          if (!first) first = bucket;
          else if (previous !== bucket) {
            let heading = item.querySelector<HTMLElement>(':scope > .an-date-heading');
            if (!heading) {
              heading = document.createElement('h2');
              heading.className = 'an-date-heading';
              item.prepend(heading); owned.add(heading);
            }
            if (heading.textContent !== bucket) heading.textContent = bucket;
            wantedHeadings.add(heading);
          }
          previous = bucket;
        });
        if (first) {
          if (group.getAttribute('data-an-first-date') !== first) group.setAttribute('data-an-first-date', first);
          if (group.style.getPropertyValue('--an-first-date') !== JSON.stringify(first)) group.style.setProperty('--an-first-date', JSON.stringify(first));
        } else {
          group.removeAttribute('data-an-first-date'); group.style.removeProperty('--an-first-date');
        }
      });
      document.querySelectorAll<HTMLElement>('.an-date-heading').forEach(heading => {
        if (!wantedHeadings.has(heading)) { heading.remove(); owned.delete(heading); }
      });
      document.querySelectorAll<HTMLElement>('[data-bb-plugin="thread-list"] [data-sidebar-thread-id]').forEach(anchor => {
        const thread = byId.get(anchor.dataset.sidebarThreadId!);
        const row = anchor.closest<HTMLElement>('[data-sidebar-rename-row]');
        if (!thread || !row) return;
        let meta = row.querySelector<HTMLElement>(':scope > .an-note-meta');
        if (!meta) {
          meta = document.createElement('span');
          meta.className = 'an-note-meta';
          meta.setAttribute('aria-hidden','true');
          row.append(meta);
          owned.add(meta);
        }
        const text = `${shortDate(thread.updatedAt)}   ${names.get(thread.projectId) || 'Personal'}${thread.indicatorLabel ? ' · ' + thread.indicatorLabel.replace(/^Thread /,'') : ''}`;
        if (meta.textContent !== text) meta.textContent = text;
        if (!row.hasAttribute('data-an-note-row')) row.setAttribute('data-an-note-row','');
      });
      for (const node of owned) if (!node.isConnected) owned.delete(node);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(reconcile); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.getElementById('root') || document.body, {childList:true,subtree:true});
    reconcile();
    const refreshDates = window.setInterval(schedule, 60_000);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      clearInterval(refreshDates);
      document.querySelectorAll<HTMLElement>('[data-an-first-date]').forEach(group => {
        group.removeAttribute('data-an-first-date'); group.style.removeProperty('--an-first-date');
      });
      timelines.forEach((id, node) => { cancelAnimationFrame(id); node.removeAttribute('data-an-initial-ready'); });
      owned.forEach(node => node.remove());
      document.querySelectorAll('[data-an-note-row]').forEach(node => node.removeAttribute('data-an-note-row'));
    };
  }, []);
  useEffect(() => { if (mount) mount.parentElement?.toggleAttribute('data-an-searching', !!query.trim()); return () => mount?.parentElement?.removeAttribute('data-an-searching'); }, [mount,query]);
  if (!mount) return null;
  const matches = threads.filter(t => !t.isArchived && !t.isHidden && `${t.displayTitle} ${projects.find(p=>p.id===t.projectId)?.name || ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,60);
  return createPortal(<>
    <div className="an-search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input aria-label="Search threads" placeholder="Search" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setQuery('');}}/>
      {query && <button type="button" aria-label="Clear search" onClick={()=>{setQuery('');mount.querySelector<HTMLInputElement>('input')?.focus();}}>×</button>}
    </div>
    {query.trim() && <div className="an-search-results" aria-label="Search results">
      <p className="an-section-label">{matches.length ? 'Search results' : 'No matching threads'}</p>
      {matches.map(t=><a key={t.id} href={t.href} className="an-result" data-sidebar-thread-shortcut-target="" data-sidebar-thread-id={t.id} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate.toThread(t.id);setQuery('');if(matchMedia('(max-width: 767px)').matches)document.querySelector<HTMLButtonElement>('[data-sidebar="trigger"][aria-expanded="true"]')?.click();}}>
        <strong>{t.displayTitle}</strong><span>{shortDate(t.updatedAt)} · {projects.find(p=>p.id===t.projectId)?.name || 'Personal'}</span>
      </a>)}
    </div>}
  </>,mount);
}

function NoteHeading({threadId}: PluginThreadHeaderActionProps) {
  const {threads} = experimental_useSidebarThreads();
  const thread = threads.find(t=>t.id===threadId);
  const source = threads.find(t=>t.id===thread?.sourceThreadId);
  const navigate = useBbNavigate();
  const anchor = useRef<HTMLSpanElement>(null);
  const [mount,setMount] = useState<HTMLElement|null>(null);
  useLayoutEffect(()=>{
    let heading: HTMLElement|null=null;
    const pane=anchor.current?.closest('[data-split-pane-id]');
    if(!pane)return;
    const resize = new ResizeObserver(()=>{
      if (heading) heading.parentElement?.style.setProperty('--an-heading-height', `${heading.getBoundingClientRect().height}px`);
    });
    const attach=()=>{
      const list=pane.querySelector('[data-timeline-row-list="top-level"]');
      if(list && !heading?.isConnected){
        if (heading) resize.unobserve(heading);
        heading=document.createElement('div');heading.className='an-document-heading';
        const container = list.parentElement!;
        container.dataset.anThreadId = threadId;
        // Provisioning and virtualizer remounts must never blank a visible note.
        if (revealedThreads.has(threadId)) container.setAttribute('data-an-initial-ready', '');
        list.before(heading);resize.observe(heading);setMount(heading);
      }
    };
    const observer=new MutationObserver(() => { if (!heading?.isConnected) attach(); });observer.observe(pane,{childList:true,subtree:true});attach();
    return()=>{observer.disconnect();resize.disconnect();heading?.parentElement?.style.removeProperty('--an-heading-height');heading?.remove();};
  },[threadId]);
  return <><span ref={anchor} className="an-heading-anchor"/>{mount && thread && createPortal(<>
    <time dateTime={new Date(thread.createdAt).toISOString()}>{new Date(thread.createdAt).toLocaleString(undefined,{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</time>
    <h1>{thread.displayTitle}</h1>
    {thread.sourceThreadId && <p className="an-fork-source">forked from <button type="button" onClick={()=>navigate.toThread(thread.sourceThreadId!)}>{source?.displayTitle || 'original thread'}</button></p>}
  </>,mount)}</>;
}

export default definePluginApp(app=>{
  app.composer.customize({id:'natural-routing',scopes:['new-thread'],banners:[{id:'routing-status',chrome:'bare',component:NaturalRouting}]});
  app.commands.register({
    id:'toggle-color-mode', title:'Toggle light / dark mode',
    defaultShortcut:{key:'l',mod:true,shift:true},
    run(){
      // BB stores color mode per client; notify its native storage subscriber
      // so appearance settings, code themes and desktop chrome update together.
      const key = 'bb.theme';
      const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      const oldValue = localStorage.getItem(key);
      localStorage.setItem(key,next);
      window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue:next,storageArea:localStorage}));
    },
  });
  app.contentScripts.register({id:'notes-layout',mount(){
    document.documentElement.classList.remove('apple-notes-layout-disabled');
    document.documentElement.classList.add('apple-notes-ui');
    const disposeThemeColorSync = installThemeColorSync();
    return ()=>{
      disposeThemeColorSync();
      document.documentElement.classList.remove('apple-notes-ui');
      document.documentElement.classList.add('apple-notes-layout-disabled');
    };
  }});
  app.slots.experimental_appOverlay({id:'notes-details',component:NotesEnhancements});
  app.slots.experimental_threadHeaderAction({id:'note-heading',title:'Note heading',component:NoteHeading});
});
