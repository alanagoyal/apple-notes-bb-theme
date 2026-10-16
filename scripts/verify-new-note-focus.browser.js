const p = await browser.getPage('main');
const origin = await p.evaluate(() => location.origin);
const threadPath = await p.evaluate(() => location.pathname);
if (!threadPath.includes('/threads/')) throw new Error('Start from an existing thread page');
const results = [];
async function refFor(text) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const line = (await p.snapshot()).split('\n').find(line => line.includes(text));
    const ref = line?.match(/\[ref=(e\d+)\]/)?.[1];
    if (ref) return `ref/${ref}`;
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  }
  throw new Error(`Missing control: ${text}`);
}
async function expectPrompt(label) {
  const active = await p.evaluate(() => new Promise(resolve => {
    const started = performance.now();
    const check = () => {
      if (document.activeElement?.id === 'root-compose-prompt') return resolve(true);
      if (performance.now() - started > 3500) return resolve(false);
      requestAnimationFrame(check);
    };
    check();
  }));
  if (!active) throw new Error(`${label}: prompt did not gain focus`);
  results.push(label);
}
for (let attempt = 0; attempt < 3; attempt++) {
  await p.goto(origin + threadPath);
  await p.click(await refFor('button "Close pane"'));
  await expectPrompt(`close X ${attempt + 1}`);
}
await p.click(await refFor('textbox "Search threads"'));
await p.evaluate(() => new Promise(resolve => setTimeout(resolve, 900)));
if (!(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Search threads'))) throw new Error('Search focus was stolen');
results.push('explicit search focus retained');
await p.goto(origin + threadPath);
await p.click(await refFor('button "Close pane"'));
await p.click(await refFor('textbox "Search threads"'));
await p.evaluate(() => new Promise(resolve => setTimeout(resolve, 900)));
if (!(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Search threads'))) throw new Error('Pending autofocus overrode the user click');
results.push('click during reveal cancels pending autofocus');
await p.click(await refFor('button "New thread ('));
await expectPrompt('new-thread button refocuses');
await p.goto(origin + '/');
await expectPrompt('direct new-prompt screen load');
console.log(JSON.stringify({passed:results}, null, 2));
