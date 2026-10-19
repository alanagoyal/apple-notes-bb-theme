import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArchiveNavigation, sidebarThreadOrder} from '../src/archive-navigation.ts';

const thread = id => ({id, isArchived:false, isHidden:false});
function setup(order = ['a','b','c'], threadId = 'b') {
  let time = 0;
  const state = {order, threadId, threads:order.map(thread), compose:false};
  const opened = [];
  const navigation = createArchiveNavigation(() => state, id => opened.push(id), () => time);
  navigation.refresh();
  const close = () => {
    state.threads = state.threads.filter(t => t.id !== threadId);
    state.order = state.order.filter(id => id !== threadId);
    state.threadId = null; state.compose = true;
    navigation.refresh();
  };
  return {state, opened, navigation, close, advance: value => {time += value;}};
}

test('waits for native pane closure when confirmation arrives first', () => {
  const f = setup();
  f.navigation.archived({threadId:'b'});
  assert.deepEqual(f.opened, []);
  f.close();
  assert.deepEqual(f.opened, ['a']);
  f.navigation.refresh();
  f.navigation.archived({threadId:'b'});
  assert.deepEqual(f.opened, ['a']);
});

test('retains the previous order when the pane closes before confirmation', () => {
  const f = setup();
  // A note may have been idle for hours before it is archived.
  f.advance(3_600_000);
  f.close();
  assert.deepEqual(f.opened, []);
  f.navigation.archived({threadId:'b'});
  assert.deepEqual(f.opened, ['a']);
});

test('confirmation can arrive while the sidebar data is still stale', () => {
  const f = setup();
  f.state.threadId = null; f.state.compose = true;
  f.navigation.refresh();
  f.navigation.archived({threadId:'b'});
  assert.deepEqual(f.opened, ['a']);
});

test('top and only threads stay on compose', () => {
  for (const order of [['a','b'], ['a']]) {
    const f = setup(order, 'a');
    f.navigation.archived({threadId:'a'});
    f.close();
    assert.deepEqual(f.opened, []);
  }
});

test('uses sidebar order across groups, rather than thread data order', () => {
  const f = setup(['c','a','b']);
  f.state.threads = ['a','b','c'].map(thread);
  f.navigation.refresh();
  f.close();
  f.navigation.archived({threadId:'b'});
  assert.deepEqual(f.opened, ['a']);
});

test('a cancelled or failed archive, deletion, or unrelated archive never navigates', () => {
  const f = setup();
  f.navigation.archived(null);
  f.navigation.archived({threadId:42});
  f.navigation.archived({threadId:'c'});
  f.close();
  assert.deepEqual(f.opened, []);
});

test('explicit navigation and stale events cannot steal focus', () => {
  for (const change of [
    f => f.navigation.cancel(),
    f => {f.state.threadId = 'c'; f.navigation.refresh();},
    f => f.advance(5001),
  ]) {
    const f = setup();
    f.close(); change(f);
    f.navigation.archived({threadId:'b'});
    assert.deepEqual(f.opened, []);
  }
});

test('does not open a previous thread that was archived or hidden too', () => {
  for (const change of [
    f => {f.state.threads[0].isArchived = true;},
    f => {f.state.threads[0].isHidden = true;},
    f => {f.state.threads = f.state.threads.filter(t => t.id !== 'a');},
    f => f.navigation.archived({threadId:'a'}),
  ]) {
    const f = setup();
    f.navigation.archived({threadId:'b'}); change(f); f.close();
    assert.deepEqual(f.opened, []);
  }
});

test('reads virtualized placeholders and skips hidden and overflow rows', () => {
  const node = (dataset, excluded = false) => ({
    dataset, closest:() => excluded ? {} : null,
    getBoundingClientRect:() => ({height:66}),
  });
  const nodes = [
    node({sidebarThreadId:'pinned'}),
    node({sidebarWindowedNav:'old:project older:project invalid :bad broken:'}),
    node({sidebarThreadId:'current'}),
    node({sidebarThreadId:'pinned'}),
    node({sidebarThreadId:'hidden'}, true),
  ];
  assert.deepEqual(sidebarThreadOrder({querySelectorAll:() => nodes}), ['pinned','old','older','current']);
});
