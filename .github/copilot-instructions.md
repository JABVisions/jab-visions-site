# JAB Visions Site - AI Coding Guidelines

## Architecture Overview
- **Framework**: Next.js 14 with App Router (`app/` directory)
- **Auth/Database**: Supabase (auth + PostgreSQL)
- **Styling**: Tailwind CSS with custom emerald/green theme
- **State Management**: Local storage for user interactions ("buckets"), React state for UI
- **Key Directories**:
  - `app/board/`: Board-specific pages and components
  - `lib/board/`: Business logic (drops, buckets, types)
  - `app/components/`: Shared UI components
  - `app/api/board/`: Server-side API routes

## Core Concepts
- **Board System**: Social feed with posts, user profiles, and interactive "drops"
- **Buckets**: Client-side localStorage system for saving activities (pass/pin/push folders)
- **Drops**: User-generated content stored in Supabase with style snapshots
- **Auth Flow**: Supabase auth required for board access; redirects to `/board/profile` after login

## Development Patterns
- **Supabase Helpers**: Use `supabaseBrowser()` (client) or `supabaseServer()` (server) from `lib/supabase/`
- **Class Names**: Use `clsx()` for conditional Tailwind classes (defined inline in components)
- **Animations**: Canvas-based backgrounds (matrix on home, glitter on board)
- **Data Fetching**: Server components for initial loads, client components for interactions
- **Error Handling**: Graceful fallbacks for missing env vars (e.g., Supabase keys)
- **Icons**: Lucide React icons throughout UI

## Common Workflows
- **Start Dev**: `npm run dev` (auto-reloads on changes)
- **Build**: `npm run build` (check for TypeScript/lint errors)
- **Auth Testing**: Use Supabase dashboard for user management; test login/signup flows
- **Database**: Schema in Supabase (posts, profiles, board_drops tables)
- **Uploads**: tus-js-client for resumable file uploads (see API routes)

## Code Examples
- **Fetch Posts** (server): `supabase.from("posts").select("*, profiles(*)").order("created_at", { ascending: false })`
- **Create Post** (API): Insert with `user_id`, `content`, optional `image_url`
- **Bucket Interaction** (client): `addToBucket("pin", activityId)` emits custom events for UI updates
- **Auth Check** (middleware): Redirect unauthed users from `/board/*` to login

## File References
- `lib/board/types.ts`: Core type definitions (FeedDrop, BucketRegistry)
- `lib/board/bucket.ts`: Local storage logic with event system
- `app/board/ui/BoardFeed.tsx`: Server component for post rendering
- `app/api/board/posts/route.ts`: CRUD operations for posts</content>
<parameter name="filePath">/workspaces/jab-visions-site/.github/copilot-instructions.md