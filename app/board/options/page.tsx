// File: /app/board/options/page.tsx
export const metadata = {
  title: "Board Options",
};

export default function BoardOptionsPage() {
  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl">
        <div className="board-rim">
          <div className="board-tile p-8">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-3xl font-semibold board-accent">Options</h1>
              <span className="board-chip">Coming soon</span>
            </div>

            <p className="mt-3 text-sm opacity-80">
              This is the settings hub for Board. We’ll wire this up to profile preferences,
              privacy controls, and Board+ once the core launch flow is locked.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-black/10 bg-white/60 p-5">
                <div className="text-sm font-semibold board-accent">Account</div>
                <div className="mt-1 text-xs opacity-70">
                  Email, password, login sessions, device history.
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white/60 p-5">
                <div className="text-sm font-semibold board-accent">Privacy</div>
                <div className="mt-1 text-xs opacity-70">
                  Profile visibility, DMs, sensitive content controls.
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white/60 p-5">
                <div className="text-sm font-semibold board-accent">Notifications</div>
                <div className="mt-1 text-xs opacity-70">
                  Friend Zone pings, drop activity, thread updates.
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white/60 p-5">
                <div className="text-sm font-semibold board-accent">Board+</div>
                <div className="mt-1 text-xs opacity-70">
                  Membership status, perks, billing and receipts.
                </div>
              </div>
            </div>

            <div className="mt-8 text-xs opacity-70">
              Tip: This page exists mainly to keep routing stable while we build the real settings UI.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
