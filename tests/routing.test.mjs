import {selectionMatches} from '../src/routing-selection.ts';
import assert from 'node:assert/strict';
import {hasModelRequest, parseRouting} from '../src/natural-routing-parser.ts';
const projects=[{id:'website',name:'website'},{id:'demo',name:'demo-app'}];
const hosts=[{id:'mini',name:'Example’s Mac Mini'},{id:'air',name:"Example's Macbook Air"}];
const models=[{providerId:'codex',model:'gpt-6.1-sol',displayName:'6.1-Sol',supportedReasoningEfforts:[{reasoningEffort:'medium'},{reasoningEffort:'high'}]}];
const parse=t=>parseRouting(t,projects,hosts,models);
assert.deepEqual(parse('in my website project on mac mini can you add a landing page for example.com use 6.1 sol med'),{projectId:'website',hostId:'mini',workspace:'checkout',providerId:'codex',model:'gpt-6.1-sol',reasoningLevel:'medium'});
assert.equal(parse('in website on mac mini in a new worktree use 6.1-sol high').workspace,'worktree');
assert.equal(parse('in website on mac mini do not use a new worktree').workspace,'checkout');
assert.equal(parse('in website on mac mini not in a new worktree').workspace,'checkout');
assert.equal(parse('in website on mac mini do not create a new worktree').workspace,'checkout');
assert.equal(parse('in website on macbook air use 6.1 sol high').hostId,'air');
assert.deepEqual(parse('add a landing page for example.com'),{});
assert.deepEqual(parse('explain `in website use 6.1-sol`'),{});
assert.equal(parse('in website project and in demo-app project').error?.includes('multiple projects'),true);
assert.equal(parse('do not use 6.1 sol med').model,undefined);
assert.equal(parse('use 6.1 sol ultra').error?.includes('does not offer'),true);

assert.equal(hasModelRequest('use 6 astra med'), true);
assert.equal(hasModelRequest('use the gpt-6-astra medium'), true);
assert.equal(hasModelRequest('explain `use 6 astra med`'), false);
assert.equal(hasModelRequest('explain "use 6 astra med"'), false);
assert.equal(parseRouting('use 6 astra med', [], [], [{providerId:'codex', model:'gpt-6-astra', displayName:'6-Astra', supportedReasoningEfforts:[{reasoningEffort:'medium'}]}]).reasoningLevel, 'medium');
assert.equal(hasModelRequest('do not use 6 astra med'), false);
const astra = {providerId:'codex', model:'gpt-6-astra', displayName:'6-Astra', supportedReasoningEfforts:[{reasoningEffort:'medium'}]};
const withPersonal = [...projects, {id:'personal', name:'Personal', kind:'personal'}];
assert.deepEqual(parseRouting('work on mac mini on no project selected. use astra 6 medium', withPersonal, hosts, [astra]), {
  projectId:'personal', hostId:'mini', workspace:'checkout', providerId:'codex', model:'gpt-6-astra', reasoningLevel:'medium',
});
assert.equal(parseRouting('use astra 6 ultra', withPersonal, hosts, [astra]).error?.includes('does not offer'), true);
assert.equal(parseRouting('in website with no project selected', withPersonal, hosts).error?.includes('both a project'), true);
assert.equal(parseRouting('no project selected', projects, hosts).error?.includes('unavailable'), true);
assert.deepEqual(parseRouting('explain "no project selected. use astra 6 medium"', withPersonal, hosts, [astra]), {});
console.log('routing parser checks passed');


const requested = {projectId:'personal', environment:{type:'host', hostId:'mini', workspace:{type:'personal'}}, model:'gpt-6-astra', reasoningLevel:'medium'};
const applied = {...requested, environment:{type:'provider', environmentProviderId:'personal-workspace', machine:{type:'existing',hostId:'mini'}, inputs:null}};
assert.equal(selectionMatches(requested, applied), true);
assert.equal(selectionMatches(requested, {...applied, model:'gpt-6-sol'}), false);
assert.equal(selectionMatches(requested, {...applied, projectId:'website'}), false);
assert.equal(selectionMatches(requested, {...applied, environment:undefined}), false);
assert.equal(selectionMatches(requested, {...applied, environment:{...applied.environment,machine:{type:'existing',hostId:'air'}}}), false);
assert.equal(selectionMatches(requested, {...applied, environment:{...applied.environment,environmentProviderId:'project-checkout'}}), false);
console.log('selection reconciliation checks passed');
