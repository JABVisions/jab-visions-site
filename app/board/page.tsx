import Link from "next/link";

export default function BoardPage() {
  return (
    <main className="min-h-screen board-bg text-black">
      {/* Header */}
      <header className="mx-auto max-w-5xl px-6 pt-14 pb-10">
        <div className="board-header rounded-[30px] p-8 border border-black/15 shadow-[0_12px_40px_rgba(0,0,0,0.15),0_0_60px_rgba(0,255,150,0.18)]">
          <h1 className="text-center text-4xl md:text-5xl font-semibold tracking-wide text-[rgba(0,160,80,1)] drop-shadow-[0_0_12px_rgba(0,255,150,0.45)]">
            JAB Visions™ Board
          </h1>

          <p className="mt-3 text-center text-[15px] md:text-base text-[rgba(255,0,190,0.92)] drop-shadow-[0_0_10px_rgba(255,0,190,0.35)]">
            a shared dreamspace for stories, art, and imagination
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/board/signup"
              className="rounded-full bg-[#FFE36A] px-5 py-2 text-sm font-medium text-[rgba(255,0,190,0.95)]
                         border border-black/20
                         shadow-[0_0_22px_rgba(255,0,190,0.25)]
                         transition hover:translate-y-[-1px] hover:shadow-[0_0_34px_rgba(255,0,190,0.35)]"
            >
              Join JAB Visions™ Board
            </Link>
          </div>
        </div>
      </header>

      {/* Tiles */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          <BoardCard title="Those Ryderz">
            <BoardItem label="General Discussion" />
            <BoardItem label="Fan Theories" />
            <BoardItem label="Fan Fiction" />
            <BoardItem label="Concept Art" />
            <BoardItem label="Ryder Lore & Info" />
          </BoardCard>

          <BoardCard title="JAB Comic Visions">
            <BoardItem label="Paranormal Activity Division" />
            <BoardItem label="Thee Unisons" />
            <BoardItem label="Worldbuilding Threads" />
            <BoardItem label="Art & Visual Development" />
          </BoardCard>

          <BoardCard title="Community">
            <BoardItem label="Introductions" />
            <BoardItem label="Vision Boards" />
            <BoardItem label="Collaboration Requests" />
            <BoardItem label="Announcements" />
          </BoardCard>
        </div>
      </section>
    </main>
  );
}

function BoardCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[26px] bg-[#FFF2A6]/90 p-6 border border-white/70 shadow-[0_10px_30px_rgba(0,0,0,0.12),0_0_40px_rgba(255,0,190,0.15)]">
      <h2 className="text-xl font-semibold tracking-wide text-[rgba(0,160,80,1)] drop-shadow-[0_0_8px_rgba(0,255,150,0.35)]">
        {title}
      </h2>
      <ul className="mt-4 space-y-2">{children}</ul>
    </div>
  );
}

function BoardItem({ label }: { label: string }) {
  return (
    <li className="cursor-pointer text-[rgba(255,0,190,0.92)] drop-shadow-[0_0_8px_rgba(255,0,190,0.30)] transition hover:translate-x-1 hover:opacity-95">
      {label}
    </li>
  );
}
