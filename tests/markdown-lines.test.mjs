import assert from 'node:assert/strict';
import {Schema} from 'prosemirror-model';
import {EditorState, TextSelection} from 'prosemirror-state';
import {splitDraftLines, continueMarkdownList} from '../src/markdown-lines.ts';
const schema = new Schema({nodes:{
  doc:{content:'block+'}, paragraph:{content:'inline*',group:'block'},
  text:{group:'inline'},hardBreak:{inline:true,group:'inline',selectable:false},
  mention:{inline:true,group:'inline',atom:true,attrs:{id:{default:''}}},
}});
const content=[schema.text('* first'),schema.node('hardBreak'),schema.text('  - nested'),schema.node('hardBreak'),schema.node('hardBreak'),schema.text('- with '),schema.node('mention',{id:'thread-123'}),schema.node('hardBreak')];
const doc=schema.node('doc',null,[schema.node('paragraph',null,content)]);
const initial=EditorState.create({schema,doc,selection:TextSelection.create(doc,doc.content.size-1)});
const tr=splitDraftLines(initial);
assert.ok(tr);
const next=initial.apply(tr);
const plain=d=>d.textBetween(0,d.content.size,'\n','\n');
assert.equal(plain(initial.doc),plain(next.doc));
assert.equal(next.doc.childCount,5);
assert.equal(next.doc.child(2).content.size,0);
assert.equal(next.doc.child(3).lastChild.attrs.id,'thread-123');
assert.equal(next.selection.from,next.doc.content.size-1);
assert.equal(splitDraftLines(next),null);
console.log('Markdown line layout checks passed');

const atEnd = text => {
  const doc=schema.node('doc',null,text.split('\n').map(line=>schema.node('paragraph',null,line?schema.text(line):null)));
  return EditorState.create({schema,doc,selection:TextSelection.create(doc,doc.content.size-1)});
};
const continueText = text => {
  const state=atEnd(text), tr=continueMarkdownList(state);
  assert.ok(tr, `Expected list continuation for ${JSON.stringify(text)}`);
  return plain(state.apply(tr).doc);
};
assert.equal(continueText('* one'), '* one\n* ');
assert.equal(continueText('* one\n* two'), '* one\n* two\n* ');
assert.equal(continueText('- one\n  + nested'), '- one\n  + nested\n  + ');
assert.equal(continueText('9. nine'), '9. nine\n10. ');
assert.equal(continueText('1) one'), '1) one\n2) ');
assert.equal(continueText('- [x] done'), '- [x] done\n- [ ] ');
assert.equal(continueText('* [ ] todo'), '* [ ] todo\n* [ ] ');
assert.equal(continueText('* one\n* '), '* one\n');
assert.equal(continueText('- top\n  - '), '- top\n');
assert.equal(continueText('- [ ] '), '');
for (const text of ['plain text', '\\* escaped', '```md\n* literal', '    - indented code']) {
  assert.equal(continueMarkdownList(atEnd(text)), null, text);
}
const middle=atEnd('* first second');
const midState=middle.apply(middle.tr.setSelection(TextSelection.create(middle.doc,8)));
const midTr=continueMarkdownList(midState);
assert.ok(midTr);
assert.equal(plain(midState.apply(midTr).doc),'* first\n*  second');
const selected=atEnd('* one');
assert.equal(continueMarkdownList(selected.apply(selected.tr.setSelection(TextSelection.create(selected.doc,3,6)))),null);
console.log('List continuation, numbering, nesting, tasks, and exit checks passed');
