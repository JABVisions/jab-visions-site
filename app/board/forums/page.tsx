"use client";

import ForumsHall from "@/app/components/board/rooms/ForumsHall";
import BoardClientErrorBoundary from "@/app/components/board/BoardClientErrorBoundary";
import { catalogHallwayRooms, roomHref } from "@/lib/board/rooms";

function ForumsHallFallback() {
  const rooms = catalogHallwayRooms();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 text-white" data-forums-hall="1">
      <h1 className="text-4xl font-black tracking-tight">FORUMS</h1>
      <p className="mt-3 text-sm text-white/55">Walk the hallway. Official and Board rooms stay open without a cached session.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {rooms.map((room) => (
          <a
            key={room.id}
            href={roomHref(room.id)}
            data-forums-room={room.id}
            data-room-id={room.id}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white"
          >
            <span className="mr-2">{room.icon}</span>
            {room.name}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function ForumsPage() {
  return (
    <div className="min-h-screen w-full text-white">
      <BoardClientErrorBoundary name="forums-hall" fallback={<ForumsHallFallback />}>
        <ForumsHall />
      </BoardClientErrorBoundary>
    </div>
  );
}
