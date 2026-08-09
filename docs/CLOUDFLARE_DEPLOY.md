# Cloudflare Workers移行手順

この手順を完了すると、静的ファイルとBFF APIが同じ`*.workers.dev`オリジンで動作します。ブラウザにはHttpOnly Cookieだけが保存され、Supabaseのaccess token／refresh tokenは暗号化してD1へ保存されます。

## 構成

```text
Browser
  └─ __Host-deosil_session (Secure / HttpOnly / SameSite=Strict)
       └─ Cloudflare Worker /api/*
            ├─ D1: 暗号化されたSupabaseセッション
            └─ Supabase REST/Auth: ユーザーJWTで接続（RLS適用）

Supabase Cron
  └─ x-cron-secret
       └─ send-scheduled-push
            └─ Service Role（通知処理だけ）
```

## 1. ローカル準備

Node.js 22以上を使用します。

```powershell
npm ci
npx wrangler login
npx wrangler d1 create deosil-sessions
```

表示された`database_id`を[`wrangler.jsonc`](../wrangler.jsonc)の`REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID`へ設定し、D1マイグレーションを適用します。

```powershell
npm run d1:migrate:remote
```

## 2. Worker Secrets

Supabase DashboardのSettings > API Keysにあるpublishable keyを登録します。

```powershell
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
```

32バイトの暗号化鍵を生成します。表示値はパスワードマネージャー等へ保管し、Gitやチャットへ貼らないでください。

```powershell
$keyBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($keyBytes)
[Convert]::ToBase64String($keyBytes)
```

生成値を登録します。

```powershell
npx wrangler secret put SESSION_ENCRYPTION_KEY
```

暗号化鍵を失うと既存BFFセッションを復号できません。その場合はD1の`bff_sessions`を削除し、全員に再ログインしてもらいます。鍵を変更する場合も同様です。

## 3. Supabase RLS

Supabase CLIを対象プロジェクトへリンク済みであることを確認し、マイグレーションを適用します。

```powershell
npx supabase db push
```

[`20260809000000_harden_rls.sql`](../supabase/migrations/20260809000000_harden_rls.sql)は対象3テーブルの既存ポリシーを一度削除し、このPJ用のポリシーへ置き換えます。適用前に本番DBのバックアップを取得してください。

適用後、SQL Editorで確認します。

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('sessions', 'push_subscriptions', 'notification_marks')
order by tablename, cmd;
```

`sessions`にはSELECT/INSERT/UPDATEだけが存在し、DELETEとALLが存在しないことを確認します。`notification_marks`にはユーザー向けポリシーを作りません。

## 4. 通知Edge Function

十分に長いCron専用Secretを別途生成します。Workerのセッション暗号化鍵とは別の値にしてください。Supabase DashboardのEdge Functions > Secretsへ次を登録します。

```text
CRON_SECRET=<生成した値>
```

スケジュール通知関数をデプロイします。

```powershell
npx supabase functions deploy send-scheduled-push --no-verify-jwt
```

`verify_jwt=false`ですが、関数内で`x-cron-secret`を定数時間比較します。一般ユーザーJWTは認証手段として使用しません。

危険だった一斉テスト送信関数は削除します。削除前に安全な410応答へ切り替えたい場合は、先にこのリポジトリの実装をデプロイできます。

```powershell
npx supabase functions deploy send-push-notifications --no-verify-jwt
npx supabase functions delete send-push-notifications
```

Supabase Vaultに関数URLと同じCron Secretを保存します。`<CRON_SECRET>`は実値へ置き換え、SQL履歴へ残したくない場合はDashboardのVault画面から登録してください。

```sql
select vault.create_secret(
  'https://bllysyzdusuregqlraoi.supabase.co/functions/v1/send-scheduled-push',
  'deosil_scheduled_push_url'
);

select vault.create_secret('<CRON_SECRET>', 'deosil_cron_secret');
```

Supabase DashboardのIntegrations > CronでHTTP POSTジョブを作成します。SQLで登録する場合の例です。Cron時刻はUTCなので、下記は平日の10:00 JSTと22:00 JSTです。`regular`は5分おきに実行し、DB上の送信済みマークで重複を防ぎます。

```sql
select cron.schedule(
  'deosil-morning-push',
  '0 1 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deosil_scheduled_push_url') || '?mode=morning',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'deosil_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

select cron.schedule(
  'deosil-night-push',
  '0 13 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deosil_scheduled_push_url') || '?mode=night',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'deosil_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

select cron.schedule(
  'deosil-regular-push',
  '*/5 * * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deosil_scheduled_push_url') || '?mode=regular',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'deosil_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
```

既存ジョブがある場合は、重複送信を避けるため無効化または削除してから登録します。

## 5. Workerデプロイ

```powershell
npm run check
npm run deploy
```

表示された`https://deosil.<account>.workers.dev`へアクセスします。

GitHub自動デプロイを設定する場合はCloudflare Dashboard > Workers & Pages > Worker > Settings > Buildsからリポジトリを接続します。

```text
Build command:  npm ci && npm run build
Deploy command: npx wrangler deploy
```

Cloudflare Buildへ同じWorker SecretsとD1 bindingが設定されていることを確認します。

## 6. 動作・セキュリティ確認

1. ログインできることを確認する。
2. DevTools > Application > Local Storageに`sb-...-auth-token`が存在しないことを確認する。
3. Cookiesに`__Host-deosil_session`があり、HttpOnly/Secure/SameSite=Strictであることを確認する。
4. DevTools > NetworkでブラウザからSupabaseへ直接通信していないことを確認する。
5. 出勤、退勤、休暇、一覧、ソフトデリート、Push設定を確認する。
6. Secretなしで通知関数をPOSTし、`401`になることを確認する。
7. GETで通知関数を呼び、`405`になることを確認する。
8. Supabase Cronの実行履歴とEdge Functionログを確認する。

新環境の確認後、GitHub Pagesをunpublishします。旧GitHub Pages版を残すと、旧URLでブラウザへSupabaseトークンを発行し続けられるためです。

最後にSupabase Authの既存セッションを全失効させ、全ユーザーへ新Worker URLから再ログインしてもらいます。これにより、移行前に発行されたrefresh tokenを無効化できます。

## ローカル開発

`.dev.vars.example`を`.dev.vars`へコピーし、実値を設定します。`.dev.vars`はGit管理対象外です。

```powershell
npm run d1:migrate:local
npm run dev
```

ローカル用D1と本番D1は分離されます。
