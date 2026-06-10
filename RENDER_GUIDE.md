# Render公開手順書

この手順を最後まで進めると、スマートフォンや別のPCからCampus Compassを開ける公開URLが作成されます。

## 最初に知っておくこと

- GitHub Pagesではなく、Node.jsを実行できるRenderを使います。
- 公開先はローカルPCとは別の環境です。最初は登録データが空の状態です。
- GitHubに保存されているソースコードから公開します。
- `SESSION_SECRET` やデータベースのパスワードはRenderが自動設定します。
- このリポジトリの `render.yaml` はWebサービスとPostgreSQLを無料プランで作成します。

### 無料プランの注意

- Webサービスは15分間アクセスがないと休止します。次に開いたとき、表示まで約1分かかる場合があります。
- 無料PostgreSQLは作成から30日で期限切れになります。
- 無料PostgreSQLにはバックアップ機能がありません。
- 30日以上継続して使う場合は、期限前にRenderでデータベースを有料プランへ変更してください。

## 1. Renderのアカウントを作る

1. ブラウザで [Render](https://dashboard.render.com/) を開きます。
2. **Get Started** または **Sign Up** を押します。
3. **GitHub** を選んでログインします。
4. GitHubとの接続許可画面が表示されたら、`mickey-chiba/student-life-manager` を利用できるよう許可します。

すでにRenderへログインできる場合、この手順は不要です。

## 2. Blueprintを作る

1. RenderのDashboardを開きます。
2. 画面右上の **New +** を押します。
3. **Blueprint** を押します。
4. GitHubリポジトリ一覧から `mickey-chiba/student-life-manager` を探します。
5. 対象リポジトリの **Connect** を押します。
6. Blueprint名を求められた場合は、`campus-compass` と入力します。
7. `render.yaml` が読み込まれ、次の2つが表示されることを確認します。

```text
campus-compass       Web Service / Free
campus-compass-db    PostgreSQL / Free
```

8. 料金表示がどちらも **Free** になっていることを確認します。
9. **Apply** または **Deploy Blueprint** を押します。

## 3. 公開完了を待つ

作成には数分かかります。Renderの画面で次の状態になるまで待ちます。

```text
campus-compass       Live
campus-compass-db    Available
```

Webサービスのログに次の表示があれば、アプリは正常に起動しています。

```text
Student Life Manager: http://localhost:...
```

## 4. 公開URLを開く

1. RenderのDashboardで **campus-compass** を押します。
2. 画面上部にある `https://campus-compass-....onrender.com` のURLを押します。
3. Campus Compassのログイン画面が表示されたら公開成功です。
4. **新規登録**から公開先専用の名前とパスワードを登録します。

公開URLをスマートフォンへ送って、SafariまたはChromeで開けば利用できます。

## 5. スマートフォンのホーム画面へ追加する

### iPhone

1. Safariで公開URLを開きます。
2. 画面下の共有ボタンを押します。
3. **ホーム画面に追加**を押します。
4. **追加**を押します。

### Android

1. Chromeで公開URLを開きます。
2. 右上のメニューを押します。
3. **ホーム画面に追加**を押します。

## 今後アプリを更新する方法

このリポジトリの `main` ブランチへ変更を保存すると、Renderが自動で新しいバージョンを公開します。Renderで毎回作り直す必要はありません。

## 困ったとき

### GitHubリポジトリが表示されない

RenderのGitHub接続設定で、`mickey-chiba/student-life-manager` へのアクセスを許可してください。

### `Deploy failed` と表示される

Renderで **campus-compass** を開き、**Logs** の一番下にある赤いエラーを確認します。エラー内容をそのまま共有すれば原因を調べられます。

### 最初の表示が遅い

無料Webサービスは休止するため、最初の表示に約1分かかる場合があります。故障ではありません。

### 30日後も使いたい

Renderで **campus-compass-db** を開き、データベースのプランを期限前に有料プランへ変更してください。期限切れ後はデータへアクセスできなくなり、猶予期間後に削除されます。

### ローカルPCの予定が表示されない

ローカルPCのデータは `data/store.json`、公開先のデータはPostgreSQLに保存されます。保存場所が別なので、自動では移動されません。
