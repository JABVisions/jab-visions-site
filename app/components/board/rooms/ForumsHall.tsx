"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOARD_ROOM_CATALOG,
  resolveRoomId,
  roomHref,
  type Room,
  type RoomCardModel,
} from "@/lib/board/rooms";
import {
  liveRoomsFromSessions,
  readMemberships,
  readPresence,
  readRecentRoomIds,
  readSessions,
} from "@/lib/board/rooms/storage";
import { livePresence } from "@/lib/board/rooms/presence";
import RoomCard from "./RoomCard";
import OfficialRoomBadge from "./OfficialRoomBadge";

function Carousel({
  title,
  hint,
  children,
  empty,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <h2 className="text-sm font-black uppercase tracking-[0.22em] text-white/80">{title}</h2>
        {hint}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
        {empty}
      </div>
    </section>
  );
}

function decorate(rooms: Room[], liveIds: Set<string>, presenceByRoom: Map<string, number>, memberships: ReturnType<typeof readMemberships>, recent: string[], userId: string | null): RoomCardModel[] {
  return rooms.map((room) => {
    const mine = userId
      ? memberships.find((row) => row.roomId === room.id && row.userId === userId)
      : memberships.find((row) => row.roomId === room.id);
    return {
      ...room,
      live: liveIds.has(room.id) || room.state === "LIVE" || room.state === "STAGE",
      presenceCount: presenceByRoom.get(room.id) ?? room.presenceCount,
      joined: mine?.status === "joined",
      following: Boolean(mine?.following),
      recentlyEntered: recent.includes(room.id),
    };
  });
}

export default function ForumsHall() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>(BOARD_ROOM_CATALOG);
  const [userId, setUserId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const thread = params.get("thread") || params.get("conversation");
    const requested = params.get("forum") || params.get("room");
    const legacy = resolveRoomId(requested || (thread ? "lobby" : ""));
    if (requested && legacy) {
      router.replace(roomHref(legacy, thread ? { conversation: thread } : undefined));
    } else if (thread && legacy) {
      router.replace(roomHref(legacy, { conversation: thread }));
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/board/rooms")
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled || !Array.isArray(payload?.rooms)) return;
        setRooms(payload.rooms);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const models = useMemo(() => {
    const liveIds = liveRoomsFromSessions(readSessions());
    const presenceByRoom = new Map<string, number>();
    for (const row of livePresence(readPresence())) {
      presenceByRoom.set(row.roomId, (presenceByRoom.get(row.roomId) || 0) + 1);
    }
    for (const room of rooms) {
      if (room.presenceCount) {
        presenceByRoom.set(room.id, Math.max(presenceByRoom.get(room.id) || 0, room.presenceCount));
      }
      if (room.state === "LIVE" || room.state === "STAGE") liveIds.add(room.id);
    }
    return decorate(rooms, liveIds, presenceByRoom, readMemberships(), readRecentRoomIds(), userId);
  }, [rooms, userId, tick]);

  const liveNow = models.filter((room) => room.live && !room.comingSoon);
  const yourRooms = models.filter(
    (room) => !room.comingSoon && (room.joined || room.following || room.recentlyEntered)
  );
  const boardRooms = models.filter((room) => room.kind === "board");
  const jabOfficial = models.filter((room) => room.isOfficial);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="relative mb-7 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(124,92,255,0.22),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(255,107,157,0.16),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(52,211,153,0.12),transparent_32%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.38em] text-emerald-200/70">Board · Live community layer</p>
            <OfficialRoomBadge compact />
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">FORUMS</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
            Walk the hallway. Rooms are places — conversations, Drops, presence, and later calls live inside them.
          </p>
        </div>
      </header>

      <div className="space-y-8">
        <Carousel
          title="Live Now"
          hint={<span className="text-[11px] uppercase tracking-[0.18em] text-white/35">Broadcast portals</span>}
          empty={
            liveNow.length ? null : (
              <div className="min-w-[240px] rounded-[1.4rem] border border-white/8 bg-white/[0.025] px-4 py-6 text-sm text-white/40">
                No rooms are broadcasting right now.
              </div>
            )
          }
        >
          {liveNow.map((room) => (
            <RoomCard key={room.id} room={room} compact />
          ))}
        </Carousel>

        <Carousel
          title="Your Rooms"
          empty={
            yourRooms.length ? null : (
              <div className="min-w-[260px] rounded-[1.4rem] border border-white/8 bg-white/[0.025] px-4 py-6 text-sm text-white/40">
                Rooms you join, follow, or step into will gather here.
              </div>
            )
          }
        >
          {yourRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </Carousel>

        <Carousel title="Board Rooms">
          {boardRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </Carousel>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <h2 className="text-sm font-black uppercase tracking-[0.22em] text-amber-100/90">JAB Official</h2>
            <OfficialRoomBadge />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {jabOfficial.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
