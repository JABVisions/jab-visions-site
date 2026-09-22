"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RoomSession } from "@/lib/board/rooms";

export default function RoomMediaSession({
  roomId,
  session,
}: {
  roomId: string;
  session: RoomSession;
}) {
  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const remoteMediaRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [message, setMessage] = useState("Connecting to LiveKit…");

  useEffect(() => {
    let disposed = false;
    const liveKitRoom = new Room({ adaptiveStream: true, dynacast: true });

    function attachTrack(track: Track) {
      const element = track.attach();
      element.autoplay = true;
      element.setAttribute("playsinline", "true");
      element.className =
        track.kind === Track.Kind.Video
          ? "h-full w-full rounded-xl object-cover"
          : "hidden";
      (track.kind === Track.Kind.Video ? remoteMediaRef.current : remoteMediaRef.current)?.append(element);
    }

    async function connect() {
      try {
        const response = await fetch(`/api/board/rooms/${roomId}/sessions/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, kind: session.kind }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.token || !payload?.url) {
          throw new Error(payload?.message || "Could not join this session.");
        }

        liveKitRoom.on(RoomEvent.TrackSubscribed, (track) => attachTrack(track));
        liveKitRoom.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((element) => element.remove()));
        await liveKitRoom.connect(payload.url, payload.token);
        if (disposed) return;

        if (payload.canPublish) {
          await liveKitRoom.localParticipant.setMicrophoneEnabled(true);
          await liveKitRoom.localParticipant.setCameraEnabled(true);
          const publication = liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera);
          const video = publication?.videoTrack;
          if (video && localVideoRef.current) {
            const element = video.attach();
            element.autoplay = true;
            element.muted = true;
            element.setAttribute("playsinline", "true");
            element.className = "h-full w-full rounded-xl object-cover";
            localVideoRef.current.replaceChildren(element);
          }
        }

        setStatus("connected");
        setMessage(payload.canPublish ? "You are live in this room." : "Watching this room live.");
      } catch (error) {
        if (disposed) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not connect to this session.");
      }
    }

    void connect();
    return () => {
      disposed = true;
      liveKitRoom.disconnect();
    };
  }, [roomId, session.id, session.kind]);

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="min-h-[160px] overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/55">
        <div ref={remoteMediaRef} className="grid h-full min-h-[160px] place-items-center">
          <span className="px-5 text-center text-xs leading-5 text-white/55">
            {status === "connected" ? "Waiting for another camera to join…" : message}
          </span>
        </div>
      </div>
      <div className="min-h-[160px] overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/55">
        <div ref={localVideoRef} className="grid h-full min-h-[160px] place-items-center">
          <span className="px-5 text-center text-xs leading-5 text-white/45">
            {status === "connected" ? "Your camera" : "Preparing your camera…"}
          </span>
        </div>
      </div>
      {status === "error" ? <p className="sm:col-span-2 text-xs text-rose-200">{message}</p> : null}
    </div>
  );
}
