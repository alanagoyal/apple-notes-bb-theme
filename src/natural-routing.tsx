import { beginNoteHandoff, cancelNoteHandoff } from './note-handoff';
import {useEffect, useRef, useState} from 'react';
import {useComposer, useSdk, type ComposerSelection} from '@get-bb/plugin-sdk/app';
import {selectionMatches} from './routing-selection';
import {hasModelRequest, parseRouting, type RouteIntent, type RouteModel, type RouteProject, type RouteHost} from './natural-routing-parser';

type Composer = ReturnType<typeof useComposer>;
type Catalogs = {projects: RouteProject[]; hosts: RouteHost[]};
type ModelCatalog = {models: RouteModel[]; incomplete: boolean};
type Draft = {
  signature: string;
  status: string;
  error: string | null;
  pending: Promise<void> | null;
  ignore: boolean;
  intent?: RouteIntent;
  composer: Composer;
  listeners: Set<(status: string) => void>;
};
// Project selection remounts composer slots; pending work and feedback belong to
// the draft, not to the old component. The latest handle survives that remount.
const drafts = new Map<string, Draft>();
let submittingPrepared = false;
let submissionPending = false;

export function NaturalRouting() {
  const composer = useComposer();
  const sdk = useSdk();
  let draft = drafts.get(composer.key);
  if (!draft) {
    draft = {signature: '', status: '', error: null, pending: null, ignore: false, composer, listeners: new Set()};
    drafts.set(composer.key, draft);
  }
  const state = draft;
  state.composer = composer;
  const [status, setStatus] = useState(state.status);
  const catalogs = useRef<Promise<Catalogs> | null>(null);
  const modelCatalogs = useRef(new Map<string, Promise<ModelCatalog>>());
  const notify = (text: string) => {
    state.status = text;
    state.listeners.forEach(listener => listener(text));
  };
  const load = () => catalogs.current ??= Promise.all([
    sdk.projects.list({includePersonal: true, signal: AbortSignal.timeout(15_000)}),
    sdk.hosts.list({signal: AbortSignal.timeout(15_000)}),
  ]).then(([projects, hosts]) => ({projects, hosts})).catch(() => {
    catalogs.current = null;
    throw new Error('Could not load projects and machines. Check the connection, then retry or use the current selections.');
  });
  const modelsFor = (hostId?: string) => {
    const key = hostId ?? 'default';
    let promise = modelCatalogs.current.get(key);
    if (!promise) {
      promise = sdk.providers.list(hostId ? {hostId, signal: AbortSignal.timeout(15_000)} : {signal: AbortSignal.timeout(15_000)}).then(async providers => {
        const available = providers.filter(provider => provider.available);
        if (!available.length) throw new Error('No providers are available on that machine.');
        const results = await Promise.allSettled(available.map(async provider => {
          const catalog = await sdk.providers.models(hostId ? {hostId, providerId: provider.id, signal: AbortSignal.timeout(15_000)} : {providerId: provider.id, signal: AbortSignal.timeout(15_000)});
          return catalog.models.map(model => ({...model, providerId: model.routeProviderId ?? provider.id}));
        }));
        const incomplete = results.some(result => result.status === 'rejected');
        // A partial outage must not become a cached "model not found" result.
        if (incomplete) modelCatalogs.current.delete(key);
        return {models: results.flatMap(result => result.status === 'fulfilled' ? result.value : []), incomplete};
      }).catch(() => {
        modelCatalogs.current.delete(key);
        throw new Error('Could not load models on that machine. Check its connection and provider setup, then retry.');
      });
      modelCatalogs.current.set(key, promise);
    }
    return promise;
  };
  const prepare = async (sending = false): Promise<void> => {
    const text = state.composer.text;
    if (!text.trim()) {
      state.signature = ''; state.error = null; state.intent = undefined; state.ignore = false;
      notify('');
      return;
    }
    if (state.ignore) return;
    if (state.pending) {
      await state.pending;
      return prepare(sending);
    }
    const isCurrent = () => state.listeners.size > 0 && !state.ignore && text === state.composer.text && state.composer.scope.kind === 'new-thread';
    const run = async () => {
      const {projects, hosts} = await load();
      if (!isCurrent()) return;
      let intent = parseRouting(text, projects, hosts);
      const selection = state.composer.selection;
      const environment = selection?.environment;
      const selectedHost = environment?.type === 'host' ? environment.hostId
        : environment?.type === 'provider' && environment.machine?.type === 'existing' ? environment.machine.hostId : undefined;
      if (!intent.error && hasModelRequest(text)) {
        const catalog = await modelsFor(intent.hostId ?? selectedHost);
        if (!isCurrent()) return;
        intent = parseRouting(text, projects, hosts, catalog.models);
        if (!intent.model && !intent.error) {
          intent.error = catalog.incomplete
            ? 'Some model catalogs could not be loaded. Retry, or choose a model with the picker.'
            : 'Model not found on that machine. Choose a model with the picker, then use the current selections.';
        }
      }
      const signature = JSON.stringify(intent);
      if (signature === state.signature) {
        notify(state.error ?? '');
        return;
      }
      if (intent.error) {
        state.error = intent.error; state.signature = signature;
        notify(intent.error);
        return;
      }
      const patch: ComposerSelection = {};
      const projectId = intent.projectId ?? selection?.projectId;
      if (intent.projectId && intent.projectId !== state.intent?.projectId) patch.projectId = intent.projectId;
      if (intent.workspace && projectId && (intent.workspace !== state.intent?.workspace || intent.hostId !== state.intent?.hostId || intent.projectId !== state.intent?.projectId)) {
        const project = projects.find(project => project.id === projectId);
        if (project?.kind === 'personal') {
          const hostId = intent.hostId ?? selectedHost;
          if (hostId) patch.environment = {type: 'host', hostId, workspace: {type: 'personal'}};
        } else {
          const sources = (project?.sources ?? []).filter(source => source.type === 'local_path' && source.path && source.hostId);
          const source = sources.find(source => source.hostId === (intent.hostId ?? selectedHost))
            ?? (!intent.hostId ? sources.find(source => source.isDefault) ?? (sources.length === 1 ? sources[0] : undefined) : undefined);
          if (!source?.path || !source.hostId) {
            state.signature = signature;
            state.error = 'No matching project checkout on that machine. Choose an environment below, then use the current selections.';
            notify(state.error);
            return;
          }
          patch.environment = {type: 'host', hostId: source.hostId, workspace: intent.workspace === 'worktree'
            ? {type: 'managed-worktree', baseBranch: {kind: 'default'}} : {type: 'unmanaged', path: source.path}};
        }
      }
      if (intent.model && intent.model !== state.intent?.model) {patch.providerId = intent.providerId; patch.model = intent.model;}
      if (intent.reasoningLevel && intent.reasoningLevel !== state.intent?.reasoningLevel) patch.reasoningLevel = intent.reasoningLevel as ComposerSelection['reasoningLevel'];
      state.error = null;
      if (Object.keys(patch).length) {
        notify('Updating selections…');
        const applied = await state.composer.setSelection(patch);
        if (!isCurrent()) return;
        if (!selectionMatches(patch, applied)) {
          throw new Error('Some requested selections could not be applied. Check the project, machine and model pickers, then retry or use the current selections.');
        }
      }
      // Commit only after selection succeeds, so Retry can reapply a failed patch.
      state.signature = signature; state.intent = intent;
      notify('');
    };
    state.pending = run().catch(error => {
      if (!isCurrent()) return;
      state.signature = '';
      state.error = error instanceof Error ? error.message : 'Could not update selections. Retry or use the current selections.';
      notify(state.error);
    }).finally(() => {state.pending = null;});
    await state.pending;
    if (sending && state.error && !state.ignore) throw new Error(state.error);
  };
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  useEffect(() => {
    state.listeners.add(setStatus); setStatus(state.status);
    return () => {state.listeners.delete(setStatus);};
  }, [state]);
  useEffect(() => {
    const timer = window.setTimeout(() => void prepareRef.current(), 650);
    return () => clearTimeout(timer);
  }, [composer.text]);
  useEffect(() => composer.onSubmitted(() => {drafts.delete(composer.key);}), [composer]);
  useEffect(() => {
    const belongs = (target: EventTarget | null) => target instanceof Element && !!target.closest('form:has(#root-compose-prompt)');
    const send = async (form: HTMLFormElement) => {
      if (submissionPending) return;
      submissionPending = true;
      const text = state.composer.text;
      try {
        await prepareRef.current(true);
        // Do not send an edited draft using selections checked for earlier text.
        if (!state.listeners.size || text !== state.composer.text || state.composer.scope.kind !== 'new-thread') return;
        form = document.querySelector<HTMLFormElement>('form:has(#root-compose-prompt)') ?? form;
        if (!form.isConnected) return;
        const button = form.querySelector<HTMLButtonElement>('[data-promptbox-submit-action]');
        if (!button || button.disabled) return;
        submittingPrepared = true;
        try {
          // Presentation must never prevent the native send path.
          try {beginNoteHandoff();} catch {cancelNoteHandoff();}
          form.requestSubmit(button);
        } finally {submittingPrepared = false;}
      } catch { /* Feedback and recovery controls remain visible in the banner. */ }
      finally {submissionPending = false;}
    };
    const onSubmit = (event: Event) => {
      if (submittingPrepared || !belongs(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void send(event.target as HTMLFormElement);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.keyCode === 229 || !belongs(event.target)) return;
      if (!(event.target instanceof Element) || !event.target.closest('[contenteditable="true"]')) return;
      if (Array.from(document.querySelectorAll('[role="listbox"], [role="dialog"]:not([data-sidebar="panel"]), [role="menu"]')).some(element => element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert]'))) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void send(event.target.closest('form')!);
    };
    document.addEventListener('submit', onSubmit, true); document.addEventListener('keydown', onKeyDown, true);
    return () => {document.removeEventListener('submit', onSubmit, true); document.removeEventListener('keydown', onKeyDown, true);};
  }, [state]);
  const retry = () => {
    catalogs.current = null; modelCatalogs.current.clear();
    state.signature = ''; state.error = null; state.ignore = false;
    notify('Checking selections…');
    void prepareRef.current();
  };
  return <div className="an-routing-status" role="status" aria-live="polite" aria-atomic="true" data-error={state.error ? '' : undefined} hidden={!status}>
    <p className="an-routing-message">{status}</p>
    {state.error && <div className="an-routing-actions">
      <button type="button" onClick={retry}>Retry</button>
      <button type="button" onClick={() => {state.ignore = true; state.error = null; notify('');}}>Use current selections</button>
    </div>}
  </div>;
}
