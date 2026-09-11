 This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment setup

Board talks to Supabase for auth, profiles, drops, and the feed. Create a `.env.local` in the
repository root (next to `package.json`) before starting the dev server.

The project is already linked to Vercel, so the quickest route is to pull the real values down:

```bash
vercel env pull .env.local
```

That overwrites `.env.local` with everything configured in Vercel. It defaults to the
**development** environment, so if the Supabase keys were only ever set on Production, use:

```bash
vercel env pull .env.local --environment=production
```

To set them by hand instead, copy `.env.example` to `.env.local` and fill in the two values from
Supabase Dashboard → Project Settings → API:

```bash
cp .env.example .env.local
```

| Variable | Required | Used for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Everything: auth, profiles, drops, feed |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Same. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is accepted as an alias |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Explore's orbit-users list and the Stripe webhook only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | No | Pay Drop checkout |
| `BOARD_PLATFORM_FEE_BPS` | No | Pay Drop platform fee, in basis points |
| `GAS_URL` / `NEXT_PUBLIC_GAS_URL`, `JOIN_US_SCRIPT_TOKEN` | No | Join Us form submissions |
| `NEXT_PUBLIC_APP_URL` | No | Absolute links in emails and redirects |

Only ever put an **anon** or `sb_publishable_` key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Anything
prefixed `NEXT_PUBLIC_` is shipped to the browser, so a `service_role` or `sb_secret_` key there
would be public.

Next.js reads env files once at boot. After editing `.env.local`, stop and restart the dev server —
a hot reload will not pick it up.

### Running without Supabase

The app stays browsable with no credentials at all: the browser client falls back to an offline
guest client, middleware skips its auth redirect, and the Board API routes return empty results
with a `503`/setup message instead of failing. Login and signup show a banner and refuse to submit,
since there is nothing to verify credentials against. Anything that needs the network — the feed,
saved profiles, remote drops — will be empty until you add the keys.

## Getting Started

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. Board
itself lives at [/board](http://localhost:3000/board).

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
