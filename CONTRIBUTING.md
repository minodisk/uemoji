# Contributing

## Development

```shell
pnpm i
pnpm dev
```

1. Open [chrome://extensions/](chrome://extensions/) in Chrome.
1. Turn on `Developer mode`.
1. Click `Load unpacked` and select `out` directory.
1. When you rebuild, you need to press the reload button of the target extension in [chrome://extensions/](chrome://extensions/).

## Publication

```shell
pnpm version {patch|minor|major}
git push --tags
```

1. GitHub Actions will build and upload the files to the chrome web store.
