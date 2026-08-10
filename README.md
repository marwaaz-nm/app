This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# GeoSurvey-Pro

## Survey governance database upgrade

Before using survey editing, approval, version history, attachments, and overlap
validation, run the following migration once in the Supabase SQL Editor:

1. `supabase/migrations/20260802_survey_governance.sql`
2. `supabase/migrations/20260802_workspace_intelligence.sql`

The app server also requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Never
expose that key through a `NEXT_PUBLIC_` environment variable.

## Drive Files menu (Google Drive search)

The "Diiwaanka Drive" menu browses and searches Word files (`.doc`/`.docx`)
in a shared Google Drive folder using a Google service account. It never
uses your personal Google login — it authenticates as a service account
that must be explicitly invited to view the folder.

### 1. Create the service account key (one-time, in Google Cloud Console)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and select
   (or create) the project that owns the `drive-search-bot` service account.
2. Enable the **Google Drive API**: APIs & Services → Library → search
   "Google Drive API" → Enable.
3. Go to IAM & Admin → Service Accounts, and open
   `drive-search-bot@geosurveypro-drive.iam.gserviceaccount.com`
   (create it here first if it doesn't exist yet).
4. Open the **Keys** tab → Add Key → Create new key → choose **JSON** → Create.
   A `.json` file downloads to your computer. Keep it private — it is a
   credential, not something to paste into chat, commit to git, or share.
5. Open that downloaded JSON file. Copy the `client_email` and `private_key`
   field values into `.env.local` at the project root:

   ```
   GOOGLE_DRIVE_CLIENT_EMAIL=drive-search-bot@geosurveypro-drive.iam.gserviceaccount.com
   GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIExampleKeyContents...\n-----END PRIVATE KEY-----\n"
   GOOGLE_DRIVE_ROOT_FOLDER_ID=1-3YLIQdaEThxkZAp23VoedAb5cXTs-ie
   ```

   Keep the `private_key` value exactly as it appears in the JSON (including
   the `\n` sequences) and wrapped in quotes.

### 2. Share the Drive folder with the service account

The service account can only see files it has been explicitly shared with:

1. Open the target folder in Google Drive (the one at the shared link).
2. Click **Share** → add `drive-search-bot@geosurveypro-drive.iam.gserviceaccount.com`
   as a **Viewer**.
3. This grants read access to that folder and everything nested inside it —
   no other Drive content becomes visible to the app.

### 3. Restart the dev server

Environment variables are only read at server startup, so restart
`npm run dev` after editing `.env.local`.

Until these steps are complete, the Drive Files page will show a setup
message instead of results.
