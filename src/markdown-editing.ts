import { parser, Strikethrough, TaskList } from '@lezer/markdown';
import type { ComposerRichTextSpec } from '@get-bb/plugin-sdk/app';

const markdown = parser.configure([Strikethrough, TaskList]);
type Range = { from: number; to: number };
const styles: Record<string, string> = {
  StrongEmphasis: 'strong', Emphasis: 'emphasis', Strikethrough: 'strike',
  InlineCode: 'code', FencedCode: 'code-block', CodeBlock: 'code-block',
  Blockquote: 'quote',
  ATXHeading1: 'h1', ATXHeading2: 'h2', ATXHeading3: 'h3',
  ATXHeading4: 'h4', ATXHeading5: 'h5', ATXHeading6: 'h6',
  SetextHeading1: 'h1', SetextHeading2: 'h2',
  EmphasisMark: 'syntax', StrikethroughMark: 'syntax', HeaderMark: 'syntax',
};
const classes = [...new Set([...Object.values(styles), 'bullet', 'quote-mark',
  'task-open', 'task-done', 'fence', 'syntax', 'link', 'indent', 'ordered',
  ...Array.from({length:9}, (_, depth) => `list-${depth}`)])];

// Every SDK effect asks about the same draft. Parse it once, retaining only the
// latest draft in this window. Offsets remain UTF-16, exactly like BB's editor.
let previousText: string | undefined;
let previousRanges = new Map<string, Range[]>();
export function markdownRanges(text: string): Map<string, Range[]> {
  if (text === previousText) return previousRanges;
  const ranges = new Map<string, Range[]>();
  const add = (name: string, from: number, to: number) => {
    if (to <= from) return;
    const entries = ranges.get(name) ?? [];
    entries.push({ from, to }); ranges.set(name, entries);
  };
  const afterSpaces = (to: number) => {
    while (text[to] === ' ' || text[to] === '\t') to++;
    return to;
  };
  markdown.parse(text).iterate({ enter(node) {
    const parent = node.node.parent?.name;
    const style = styles[node.name];
    if (style) add(style, node.from, node.to);
    // Lezer intentionally parses unresolved reference links; leave those raw.
    if (node.name === 'Link' && node.node.getChild('URL')) add('link', node.from, node.to);
    if (node.name === 'ListMark') {
      const end = afterSpaces(node.to);
      let depth = -1;
      for (let ancestor = node.node.parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor.name === 'ListItem') depth++;
      }
      add(`list-${Math.min(8, Math.max(0, depth))}`, node.from, end);
      add(/^[-+*]$/.test(text.slice(node.from, node.to)) ? 'bullet' : 'ordered', node.from, end);
      const lineStart = text.lastIndexOf('\n', node.from - 1) + 1;
      if (/^[ \t]+$/.test(text.slice(lineStart, node.from))) add('indent', lineStart, node.from);
    } else if (node.name === 'QuoteMark') {
      add('quote-mark', node.from, node.to);
    } else if (node.name === 'TaskMarker') {
      add(text.slice(node.from, node.to).toLowerCase() === '[x]' ? 'task-done' : 'task-open', node.from, afterSpaces(node.to));
    } else if (node.name === 'CodeMark') {
      add(parent === 'InlineCode' ? 'syntax' : 'fence', node.from, node.to);
    } else if (node.name === 'CodeInfo') {
      add('fence', node.from, node.to);
    } else if (parent === 'Link' && node.node.parent?.getChild('URL') && ['LinkMark', 'URL', 'LinkTitle', 'LinkLabel'].includes(node.name)) {
      add('syntax', node.from, node.to);
    }
  }});
  previousText = text; previousRanges = ranges;
  return ranges;
}

// Decorations are paint only: BB still owns input, mentions, copy, undo, paste,
// selection, IME and submission of the original Markdown.
export const markdownRichText: ComposerRichTextSpec = {
  effects: classes.map(name => ({
    id: `markdown-${name}`, className: `an-md-${name}`,
    match: text => markdownRanges(text).get(name) ?? [],
  })),
};
