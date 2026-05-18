---
name: publish-extension
description: GitHub Release を作成して Chrome Web Store にパブリッシュする
---

## Uemoji Publish

uemoji の GitHub Release を作成し、CI 経由で Chrome Web Store
にパブリッシュするスキル。

### 手順

1. `gh release list --limit 5` で最新リリースバージョンを確認する
2. `git log <最新タグ>..HEAD --oneline` で前回リリース以降の変更を確認する
3. 変更内容に基づいて次のバージョンを決定する
   - `feat` が含まれる場合: マイナーバージョンを上げる
   - `fix` のみの場合: パッチバージョンを上げる
   - 破壊的変更がある場合: メジャーバージョンを上げる
   - 判断に迷う場合はユーザーに確認する
4. `gh release create v<version> --generate-notes` でリリースを作成する
   （CI が `published` イベントでトリガーされ、tag 名から `v` を剥がしたものを
   `VERSION` env として build に渡し、manifest.json に注入する）
5. `gh run list --workflow=Release --limit 1` で CI の実行状況を監視し、成功を確認する
6. リリースに zip が添付されたことを `gh release view v<version>` で確認する

### ルール

- タグは必ず `v<version>` 形式にする（例: `v0.0.9`, `v1.2.3`）
- バージョンは tag 名が単一の真実。`package.json` には `version` を持たない
- CI が失敗した場合は、`gh release delete v<version> --cleanup-tag` で公開済みリリースを
  削除してからユーザーに報告する（publish 後にトリガーされる方式のため、失敗時は
  zip 無しの公開リリースが残ることがある）
