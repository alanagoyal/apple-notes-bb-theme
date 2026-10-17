# apple notes for bb

an apple notes theme for [bb](https://getbb.app), with light and dark modes,
a searchable sidebar, dated threads, and a note-style writing space.

## install

requires bb 0.46.1 or newer with plugin sdk 0.6.49 or newer, and git.

```sh
bb plugin install git:https://github.com/alanagoyal/apple-notes-bb-theme.git@main
bb theme set plugin:apple-notes:notes
```

bb installs dependencies and builds the plugin for you. choose light, dark, or
system in settings → appearance.

## use

- press `/` to search thread titles and project names.
- press **cmd/ctrl + shift + l** to switch light and dark modes.
- start a new thread on a blank note, or drop attachments into a thread pane.
- use phrases like `in my website project on mac mini` or `in a new worktree`
  to select from your own bb projects, machines, and models before sending.

the plugin uses bb's native threads, composer, menus, shortcuts, and other
plugins. search shows up to 60 active, non-hidden threads. on mobile, home opens
the notes list.

## update

```sh
bb plugin update apple-notes
```

## turn it off

```sh
bb theme reset
bb plugin disable apple-notes
```

## source

`src/` contains the plugin code and styles. `themes/` contains the generated css
that bb loads before the plugin starts. [development](docs/development.md)
covers building and editing the theme.

## license

[mit](LICENSE). the [lucide icon notice](docs/third-party-notices.md) is included.
inspired by apple notes; independent of apple, with no apple fonts or artwork.
