"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  catalogHallwayRooms,
  FORUMS_HALL_SECTIONS,
  hallwayRoomsForClient,
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
import "./forumsLayout.css";

function HallSection({
  id,
  title,
  layout,
  hint,
  children,
  empty,
}: {
  id: (typeof FORUMS_HALL_SECTIONS)[number]["id"];
  title: string;
  layout: "rail" | "stack";
  hint?: React.ReactNode;
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <section className="forumsHallSection" data-forums-section={id} data-layout={layout}>
      <div className="forumsHallSectionHead">
        <h2>{title}</h2>
        {hint}
      </div>
      <div className="forumsHallTrack">
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
  const [rooms, setRooms] = useState<Room[]>(() => catalogHallwayRooms());
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
        setRooms(hallwayRoomsForClient(payload.rooms));
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
    try {
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
    } catch {
      return decorate(rooms, new Set(), new Map(), [], [], userId);
    }
  }, [rooms, userId, tick]);

  const liveNow = models.filter((room) => room.live && !room.comingSoon);
  const yourRooms = models.filter(
    (room) => !room.comingSoon && (room.joined || room.following || room.recentlyEntered)
  );
  const boardRooms = models.filter((room) => room.kind === "board");
  const jabOfficial = models.filter((room) => room.isOfficial);

  return (
    <div className="forumsHall mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" data-forums-hall="1">
      <header className="relative mb-7 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(124,92,255,0.22),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(255,107,157,0.16),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(52,211,153,0.12),transparent_32%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.38em] text-emerald-200/70">Board · Live community layer</p>
            <OfficialRoomBadge compact />
          </div>
          <h1 className="forumsHallTitle mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">FORUMS</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
            Walk the hallway. Rooms are places — conversations, Drops, presence, and later calls live inside them.
          </p>
        </div>
      </header>

      <div className="forumsHallLog">
        <HallSection
          id="live-now"
          title={FORUMS_HALL_SECTIONS[0].title}
          layout={FORUMS_HALL_SECTIONS[0].layout}
          hint={<span className="text-[11px] uppercase tracking-[0.18em] text-white/35">Broadcast portals</span>}
          empty={
            liveNow.length ? null : (
              <div className="forumsHallEmpty">No rooms are broadcasting right now.</div>
            )
          }
        >
          {liveNow.map((room) => (
            <RoomCard key={room.id} room={room} compact />
          ))}
        </HallSection>

        <HallSection
          id="your-rooms"
          title={FORUMS_HALL_SECTIONS[1].title}
          layout={FORUMS_HALL_SECTIONS[1].layout}
          empty={
            yourRooms.length ? null : (
              <div className="forumsHallEmpty">Rooms you join, follow, or step into will gather here.</div>
            )
          }
        >
          {yourRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </HallSection>

        <HallSection id="board-rooms" title={FORUMS_HALL_SECTIONS[2].title} layout={FORUMS_HALL_SECTIONS[2].layout}>
          {boardRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </HallSection>

        <HallSection
          id="jab-official"
          title={FORUMS_HALL_SECTIONS[3].title}
          layout={FORUMS_HALL_SECTIONS[3].layout}
          hint={<OfficialRoomBadge />}
        >
          {jabOfficial.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </HallSection>
      </div>
      <style>{`
        .forumsHall,
        .forumsRoomCard {
          display: block;
          visibility: visible;
        }
      `}</style>
    </div>
  );
}
