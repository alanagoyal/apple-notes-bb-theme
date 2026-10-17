import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { parser } from '@lezer/markdown';

export function continueMarkdownList(state: EditorState): Transaction | null {
  if (state.schema.nodes.bulletList || !state.selection.empty) return null;
  const {$from} = state.selection;
  if ($from.parent.type.name !== 'paragraph') return null;
  const leafText = (node: {type: {name: string}}) => node.type.name === 'hardBreak' ? '\n' : '\uFFFC';
  const line = $from.parent.textBetween(0, $from.parent.content.size, '', leafText);
  const marker = /^([ \t]*)([-+*]|(\d{1,9})([.)]))[ \t]+(?:\[([ xX])\][ \t]+)?/.exec(line);
  if (!marker || $from.parentOffset < marker[0].length) return null;

  const beforeCaret = state.doc.textBetween(0, $from.pos, '\n', leafText);
  const markerOffset = beforeCaret.lastIndexOf('\n') + 1 + marker[1].length;
  if (parser.parse(beforeCaret).resolveInner(markerOffset, 1).name !== 'ListMark') return null;

  if (line.slice(marker[0].length).trim() === '') {
    return state.tr.delete($from.start(), $from.end()).scrollIntoView();
  }
  const nextMarker = marker[3] ? `${Number(marker[3]) + 1}${marker[4]}` : marker[2];
  const prefix = `${marker[1]}${nextMarker} ${marker[5] !== undefined ? '[ ] ' : ''}`;
  return state.tr.split($from.pos).insertText(prefix).scrollIntoView();
}

// BB serializes both paragraph boundaries and hard breaks as a single newline.
// Separate paragraphs give each list line its own gutter, including after paste
// and draft restoration, without changing text or mention nodes.
export function splitDraftLines(state: EditorState): Transaction | null {
  if (state.schema.nodes.bulletList) return null;
  const breaks: number[] = [];
  state.doc.descendants((node, pos, parent) => {
    if (node.type.name === 'hardBreak' && parent?.type.name === 'paragraph') breaks.push(pos);
  });
  if (!breaks.length) return null;
  const tr = state.tr;
  for (const pos of breaks.reverse()) tr.delete(pos, pos + 1).split(pos);
  return tr;
}

interface NativeEditor {
  isDestroyed: boolean;
  state: EditorState;
  view: { composing: boolean; editable: boolean; dispatch(transaction: Transaction): void };
  registerPlugin(plugin: Plugin): void;
  unregisterPlugin(key: PluginKey): void;
}

export function installMarkdownLines(): () => void {
  const attached = new Map<HTMLElement, {editor: NativeEditor; key: PluginKey}>();
  let frame = 0;
  const scan = () => {
    frame = 0;
    for (const [element, {editor, key}] of attached) {
      if (element.isConnected && !editor.isDestroyed) continue;
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
      attached.delete(element);
    }
    document.querySelectorAll<HTMLElement>('form[data-promptbox] [contenteditable="true"].tiptap').forEach(element => {
      const existing = attached.get(element);
      if (existing) {
        if (!existing.editor.view.composing) {
          const transaction = splitDraftLines(existing.editor.state);
          if (transaction) existing.editor.view.dispatch(transaction.setMeta('addToHistory', false));
        }
        return;
      }
      const editor = (element as HTMLElement & {editor?: NativeEditor}).editor;
      if (!editor || editor.isDestroyed || typeof editor.registerPlugin !== 'function') return;
      const key = new PluginKey('apple-notes-markdown-lines');
      editor.registerPlugin(new Plugin({
        key,
        appendTransaction(transactions, _old, state) {
          if (editor.view.composing || !transactions.some(tr => tr.docChanged)) return null;
          return splitDraftLines(state);
        },
      }));
      attached.set(element, {editor, key});
      if (!editor.view.composing) {
        const transaction = splitDraftLines(editor.state);
        if (transaction) editor.view.dispatch(transaction.setMeta('addToHistory', false));
      }
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(scan); };
  const continueAt = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    const element = target.closest<HTMLElement>('.tiptap[contenteditable="true"]');
    const entry = element && attached.get(element);
    if (!entry || entry.editor.view.composing || !entry.editor.view.editable) return false;
    // Enter still accepts an open mention, skill, or command suggestion.
    if (element.closest('form')?.querySelector('[data-promptbox-typeahead-menu]')) return false;
    const transaction = continueMarkdownList(entry.editor.state);
    if (!transaction) return false;
    entry.editor.view.dispatch(transaction);
    return true;
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    if (!continueAt(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const beforeinput = (event: InputEvent) => {
    if (event.defaultPrevented || !event.cancelable || event.isComposing || !['insertParagraph','insertLineBreak'].includes(event.inputType)) return;
    if (!continueAt(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('root') ?? document.body, {childList:true, subtree:true});
  document.addEventListener('compositionend', schedule, true);
  document.addEventListener('keydown', keydown, true);
  document.addEventListener('beforeinput', beforeinput, true);
  scan();
  return () => {
    observer.disconnect(); cancelAnimationFrame(frame);
    document.removeEventListener('compositionend', schedule, true);
    document.removeEventListener('keydown', keydown, true);
    document.removeEventListener('beforeinput', beforeinput, true);
    for (const {editor, key} of attached.values()) if (!editor.isDestroyed) editor.unregisterPlugin(key);
    attached.clear();
  };
}
