import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
const authLocks = new Map<string, Promise<unknown>>();

async function runWithBrowserAuthLock<T>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>
): Promise<T> {
  const previous = authLocks.get(name) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  authLocks.set(
    name,
    previous
      .catch(() => undefined)
      .then(() => current)
  );

  await previous.catch(() => undefined);

  try {
    return await fn();
  } finally {
    release();
    if (authLocks.get(name) === current) {
      authLocks.delete(name);
    }
  }
}

export function createClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  browserClient = createBrowserClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: runWithBrowserAuthLock,
    },
  });

  return browserClient;
}
