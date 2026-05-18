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
4. ルートの `package.json` の `version` を新バージョンに更新する PR を作成しマージする
   （manifest.json は `package.json` から ejs で生成されるため、ここを上げないと
   Chrome Web Store 側のバージョン重複でリジェクトされる）
5. `gh release create v<version> --generate-notes --draft` で draft リリースを作成する
   （CI が `created` イベントでトリガーされ、ビルド・アップロード後に自動で publish される）
6. `gh run list --limit 1` で CI の実行状況を監視し、成功を確認する
7. リリースが publish されたことを `gh release view v<version>` で確認する

### ルール

- タグは必ず `v<version>` 形式にする（例: `v0.0.9`, `v1.2.3`）
- Release は必ず `--draft` で作成する（CI が draft にアセットをアップロードした後、
  自動で publish する）
- `package.json` の version を上げずにタグだけ作ると Chrome Web Store のアップロードが
  失敗する。必ず PR でバージョンを上げてから release を作成する
- CI が失敗した場合はエラー内容をユーザーに報告する
