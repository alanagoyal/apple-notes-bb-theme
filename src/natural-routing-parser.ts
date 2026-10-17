export type RouteProject = {id:string; name:string; kind?:string; sources?:readonly {type:string; hostId?:string|null; path?:string|null; isDefault?:boolean}[]};
export type RouteHost = {id:string; name:string};
export type RouteModel = {providerId:string; model:string; displayName:string; supportedReasoningEfforts:readonly {reasoningEffort:string}[]};
export type RouteIntent = {projectId?:string; hostId?:string; workspace?:'checkout'|'worktree'; providerId?:string; model?:string; reasoningLevel?:string; error?:string};
export const normalize = (value:string) => value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const escape = (value:string) => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const phrase = (value:string) => escape(normalize(value)).replace(/ /g,'\\s+');

const routingText = (text: string) => text.replace(/```[\s\S]*?```|`[^`]*`|"[^"\n]*"/g, ' ');

export function hasModelRequest(text: string): boolean {
  const plain = routingText(text);
  const requests = plain.matchAll(/\b(?:use|using|model|switch to)\s+(?:the\s+)?(?:gpt[\s-]*)?(?:\d+(?:\.\d+)?\b|sol\b|astra\b|claude\b|opus\b|sonnet\b|haiku\b)/gi);
  return [...requests].some(match => !/(?:don t|do not|not|instead of)\s*$/.test(normalize(plain.slice(0, match.index))));
}

/** Conservative explicit routing phrases, resolved only against BB's catalogs. */
export function parseRouting(text:string, projects:readonly RouteProject[], hosts:readonly RouteHost[], models:readonly RouteModel[]=[]):RouteIntent {
  const plain = routingText(text);
  const clean = normalize(plain);
  const intent:RouteIntent = {};
  const namedProjects = projects.filter(p=> {
    const name=phrase(p.name);
    return new RegExp(`\\b(?:in|within|for)\\s+(?:(?:my|the)\\s+)?${name}(?:\\s+project)?(?:\\b|$)|\\bproject\\s+${name}(?:\\b|$)|\\b${name}\\s+project\\b`).test(clean);
  });
  if (namedProjects.length>1) return {error:'multiple projects mentioned — choose one with the project picker'};
  const noProject = /\b(?:no project(?: selected)?|without (?:a )?project|don t work in a project)\b/.test(clean);
  if (noProject && namedProjects.length) return {error:'both a project and no project requested — choose one with the project picker'};
  if (noProject) {
    const personal = projects.find(project => project.kind === 'personal');
    if (!personal) return {error:'the personal workspace is unavailable — choose a project with the picker'};
    intent.projectId = personal.id;
  } else if (namedProjects[0]) intent.projectId=namedProjects[0].id;
  const namedHosts = hosts.filter(h=> {
    const full=normalize(h.name);
    const aliases=new Set([full,full.replace(/^.*?\bs\s+/,''),full.replace(/^.*?\b(mac(?:book)?\s.*)$/,'$1')]);
    return [...aliases].some(a=>a && new RegExp(`\\b(?:on|machine|host)\\s+(?:(?:my|the)\\s+)?${phrase(a)}(?:\\b|$)`).test(clean));
  });
  if (namedHosts.length>1) return {error:'multiple machines mentioned — choose one with the machine picker'};
  if (namedHosts[0]) intent.hostId=namedHosts[0].id;
  const worktree=/\b(?:in|on|use|using|create)\s+(?:a\s+)?new\s+worktree\b/.test(clean);
  const noWorktree=/\b(?:no|without|not|dont|don t)\s+(?:(?:in|on|use|using|create)\s+)?(?:a\s+)?(?:new\s+)?worktree\b/.test(clean);
  if (worktree && !noWorktree) intent.workspace='worktree';
  else if (intent.projectId || intent.hostId) intent.workspace='checkout';
  const matches:{model:RouteModel; end:number; length:number}[]=[];
  for (const model of models) {
    const aliases=new Set([normalize(model.model),normalize(model.displayName)]);
    for (const a of [...aliases]) {
      const short = a.replace(/^gpt\s+/, '');
      aliases.add(short);
      // Accept the name-first spelling without guessing a version or provider.
      const versionFirst = short.match(/^(\d+(?: \d+)*) (astra|sol|luna|terra)$/);
      if (versionFirst) aliases.add(`${versionFirst[2]} ${versionFirst[1]}`);
    }
    for (const alias of aliases) {
      if (!alias) continue;
      const re=new RegExp(`\\b(?:use|using|model|switch to)\\s+(?:the\\s+)?${phrase(alias)}\\b`,'g');
      for (const m of clean.matchAll(re)) {
        if (/(?:don t|do not|not|instead of)\s*$/.test(clean.slice(Math.max(0,m.index!-20),m.index))) continue;
        matches.push({model,end:m.index!+m[0].length,length:alias.length});
      }
    }
  }
  matches.sort((a,b)=>b.length-a.length);
  const best=matches[0];
  if(best) {
    const ties=matches.filter(m=>m.length===best.length);
    if(new Set(ties.map(m=>m.model.providerId+':'+m.model.model)).size>1) return {...intent,error:'that model name is ambiguous — choose it with the model picker'};
    intent.providerId=best.model.providerId; intent.model=best.model.model;
    const effort=clean.slice(best.end).match(/^\s+(?:(?:with|at)\s+)?(extra high|xhigh|ultra|high|medium|med|low|none|max)\b/)?.[1];
    if(effort) {
      const level=effort==='med'?'medium':effort==='extra high'?'xhigh':effort;
      if(!best.model.supportedReasoningEfforts.some(e=>e.reasoningEffort===level)) return {...intent,error:`${best.model.displayName.toLowerCase()} does not offer ${level} reasoning`};
      intent.reasoningLevel=level;
    }
  }
  return intent;
}
