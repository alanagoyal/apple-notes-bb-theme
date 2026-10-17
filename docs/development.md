# development

requires node.js 22.19+, 24, or 26. no running bb server is needed to build.

```sh
npm ci
npm run typecheck
npm test
npm run theme:check
npm run build
```

## files

- `src/app.tsx` registers the layout, search, shortcuts, and composer behavior.
- the other `src/*.ts` and `src/*.tsx` files implement those features.
- `src/app.css` is the layout; `src/theme-palette.css` defines light and dark colors.
- `src/server.ts` is the minimal server entry required by bb's plugin manifest.
- `themes/apple-notes.css` combines the palette and layout for the initial page load.
- `tests/` contains automated regression checks, run with `npm test`.
- `scripts/sync-theme.mjs` generates the theme css; it does not change bb settings.

## edit styles

after editing either css source, run `npm run theme:sync`. commit the generated
`themes/apple-notes.css` with your changes. `theme:check` fails if it is stale.
`npm run build` also generates it before building the plugin.

for a live development loop, install this checkout with `bb plugin install .`,
select `plugin:apple-notes:notes`, and run `bb plugin dev`. after css changes,
run `npm run theme:sync` and reselect the theme with
`bb theme set plugin:apple-notes:notes`.

## compatibility

built against bb 0.46.1 and plugin sdk 0.6.49. the plugin uses public sdk hooks
and bb's native controls. some hooks are experimental, and css/dom selectors
may need updates when bb's interface changes.

after layout edits, check sidebar search, menus, mobile navigation, new notes,
and both color modes in bb. dispose listeners, observers, and portals on unload.
