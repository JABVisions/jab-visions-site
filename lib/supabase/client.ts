import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_SETUP_HINT, supabaseCredentials } from "@/lib/supabase/config";

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

  const credentials = supabaseCredentials();
  if (!credentials) {
    throw new Error(SUPABASE_SETUP_HINT);
  }

  browserClient = createBrowserClient(credentials.url, credentials.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: runWithBrowserAuthLock,
    },
  });

  return browserClient;
}
