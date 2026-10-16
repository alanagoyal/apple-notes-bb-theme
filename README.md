# apple notes for bb

my apple notes theme for [bb](https://getbb.app). light and dark modes, a searchable
sidebar, and a note-style writing space.

it keeps bb's native threads, composer, menus, shortcuts, and plugins. the theme
adds the notes layout, dates, headings, and search.

## install

you'll need bb 0.46.1 or newer, plugin sdk 0.6.49 or newer, and git.

```sh
bb plugin install git:https://github.com/alanagoyal/apple-notes-bb-theme.git@^0.1.0
bb theme set plugin:apple-notes:notes
```

choose light, dark, or system in settings → appearance. the theme is shared across
your bb server; each client has its own light/dark preference.

if you're moving from the local `apple-notes` plugin, save a copy of that source
and uninstall it first. the local and git versions use the same plugin id.

## using it

- press `/` to search threads by title or project.
- browse dated notes with your pinned threads and native controls still in place.
- start a thread on a blank note and drop attachments anywhere in the pane.
- press **cmd/ctrl + shift + l** to switch between light and dark. you can change
  the shortcut in settings → keyboard.
- type `in my website project on mac mini` or `in a new worktree` to update the
  draft's project and machine pickers. model selection works with the models
  available in your bb setup, too.

routing leaves your draft as written. you can still change the pickers, and
nothing is created until you send.

search shows up to 60 results from active, non-hidden threads. it searches titles
and project names, not messages. on mobile, home opens the notes list.

## update

```sh
bb plugin update apple-notes
```

## turn it off

```sh
bb theme reset
bb plugin disable apple-notes
```

to bring it back, run `bb plugin enable apple-notes` and select
`plugin:apple-notes:notes` again.

## development

you'll need node.js 22.19+, 24, or 26, and python 3. ci uses node.js 24.

```sh
git clone https://github.com/alanagoyal/apple-notes-bb-theme.git
cd apple-notes-bb-theme
npm ci
npm run typecheck
npm test
npm run theme:check
npm run build
```

after editing `app.css` or `theme-palette.css`, run `npm run theme:sync` and commit
`themes/apple-notes.css`. that file lets bb apply the layout before the plugin
starts. the script only writes inside the repo.

for local development, install with `bb plugin install .` and run `bb plugin dev`.
keep the checkout while it's installed from a local path.

issues and prs are welcome. more in the [behavior notes](docs/BEHAVIOR.md).

## compatibility

built and typechecked against bb 0.46.1 and plugin sdk 0.6.49. it uses public sdk
hooks and css selectors, including some experimental hooks, so bb updates may
need small fixes here. if something breaks, open an issue with your bb version
and steps to reproduce it.

## license

[mit](LICENSE), with a separate [notice for the lucide icon](THIRD_PARTY_NOTICES.md).
inspired by apple notes. independent of apple, with no apple fonts or artwork
included.
