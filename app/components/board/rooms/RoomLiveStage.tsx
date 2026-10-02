"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Room, RoomLiveSession } from "@/lib/board/rooms";
import {
  LIVE_MEDIA_CONSTRAINTS,
  applyLiveViewerCount,
  isLiveHost,
  liveIceServers,
  liveSignal,
  roomLiveChannelName,
  type LiveSignal,
} from "@/lib/board/rooms/liveWebRtc";

type Props = {
  room: Room;
  session: RoomLiveSession;
  userId: string;
  displayName?: string;
  onSessionChange?: (session: RoomLiveSession) => void;
  onFailed?: (message: string) => void;
  onEnded?: () => void;
};

function peerIdFor(userId: string) {
  return `${userId}:${Math.random().toString(36).slice(2, 8)}`;
}

export default function RoomLiveStage({
  room,
  session,
  userId,
  displayName,
  onSessionChange,
  onFailed,
  onEnded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const peerIdRef = useRef(peerIdFor(userId));
  const channelRef = useRef<ReturnType<ReturnType<typeof supabaseBrowser>["channel"]> | null>(null);
  const [status, setStatus] = useState(isLiveHost(session, userId) ? "Starting camera…" : "Connecting to Live…");
  const [error, setError] = useState("");
  const [watching, setWatching] = useState(Math.max(1, session.viewerCount || 1));
  const host = isLiveHost(session, userId);

  useEffect(() => {
    peerIdRef.current = peerIdFor(userId);
  }, [userId, session.id]);

  useEffect(() => {
    let cancelled = false;
    const viewers = new Set<string>(host ? [peerIdRef.current] : []);
    const channelName = roomLiveChannelName(room.id);

    function attachStream(stream: MediaStream) {
      streamRef.current = stream;
      const node = videoRef.current;
      if (node) {
        node.srcObject = stream;
        void node.play().catch(() => undefined);
      }
    }

    function closePeer(id: string) {
      const peer = peersRef.current.get(id);
      if (!peer) return;
      try {
        peer.close();
      } catch {
        // ignore
      }
      peersRef.current.delete(id);
    }

    function publishViewerCount() {
      const count = Math.max(1, viewers.size);
      setWatching(count);
      onSessionChange?.(applyLiveViewerCount(session, count));
    }

    function makePeer(remoteId: string) {
      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;
      const peer = new RTCPeerConnection({ iceServers: liveIceServers() });
      peersRef.current.set(remoteId, peer);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          peer.addTrack(track, streamRef.current);
        }
      }
      peer.ontrack = (event) => {
        const [remote] = event.streams;
        if (remote) attachStream(remote);
      };
      peer.onicecandidate = (event) => {
        if (!event.candidate || cancelled) return;
        void sendSignal(
          liveSignal({
            kind: "ice",
            sessionId: session.id,
            roomId: room.id,
            from: peerIdRef.current,
            to: remoteId,
            role: host ? "host" : "viewer",
            candidate: event.candidate.toJSON(),
          })
        );
      };
      return peer;
    }

    async function sendSignal(signal: LiveSignal) {
      try {
        const channel = channelRef.current;
        if (channel) {
          await channel.send({ type: "broadcast", event: "signal", payload: signal });
        }
      } catch {
        // Realtime optional — REST mailbox still tries
      }
      try {
        await fetch(`/api/board/rooms/${room.id}/live-signal`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, signal }),
        });
      } catch {
        // local live still stands
      }
    }

    async function handleSignal(signal: LiveSignal) {
      if (cancelled || !signal || signal.sessionId !== session.id) return;
      if (signal.from === peerIdRef.current) return;
      if (signal.to && signal.to !== peerIdRef.current) return;

      if (signal.kind === "ended") {
        onEnded?.();
        return;
      }
      if (signal.kind === "goodbye") {
        viewers.delete(signal.from);
        closePeer(signal.from);
        publishViewerCount();
        return;
      }
      if (signal.kind === "hello") {
        viewers.add(signal.from);
        publishViewerCount();
        if (!host) return;
        const peer = makePeer(signal.from);
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await sendSignal(
            liveSignal({
              kind: "offer",
              sessionId: session.id,
              roomId: room.id,
              from: peerIdRef.current,
              to: signal.from,
              role: "host",
              sdp: offer.sdp,
            })
          );
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Could not connect a viewer.");
        }
        return;
      }
      if (signal.kind === "offer" && !host && signal.sdp) {
        const peer = makePeer(signal.from);
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal(
          liveSignal({
            kind: "answer",
            sessionId: session.id,
            roomId: room.id,
            from: peerIdRef.current,
            to: signal.from,
            role: "viewer",
            sdp: answer.sdp,
          })
        );
        setStatus("Live");
        return;
      }
      if (signal.kind === "answer" && host && signal.sdp) {
        const peer = peersRef.current.get(signal.from);
        if (peer && !peer.currentRemoteDescription) {
          await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        }
        return;
      }
      if (signal.kind === "ice" && signal.candidate) {
        const peer = peersRef.current.get(signal.from) || makePeer(signal.from);
        try {
          await peer.addIceCandidate(signal.candidate as RTCIceCandidateInit);
        } catch {
          // candidate may arrive early
        }
      }
    }

    async function start() {
      try {
        const sb = supabaseBrowser();
        const channel = sb.channel(channelName, { config: { broadcast: { ack: true } } });
        channelRef.current = channel;
        channel.on("broadcast", { event: "signal" }, ({ payload }) => {
          void handleSignal(payload as LiveSignal);
        });
        await new Promise<void>((resolve) => {
          channel.subscribe((state) => {
            if (state === "SUBSCRIBED" || state === "CHANNEL_ERROR" || state === "TIMED_OUT") resolve();
          });
          window.setTimeout(resolve, 2500);
        });

        if (host) {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("This browser cannot open a camera or microphone.");
          }
          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia(LIVE_MEDIA_CONSTRAINTS);
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          }
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          attachStream(stream);
          setStatus("You are Live");
          await sendSignal(
            liveSignal({
              kind: "hello",
              sessionId: session.id,
              roomId: room.id,
              from: peerIdRef.current,
              role: "host",
            })
          );
        } else {
          await sendSignal(
            liveSignal({
              kind: "hello",
              sessionId: session.id,
              roomId: room.id,
              from: peerIdRef.current,
              role: "viewer",
            })
          );
          setStatus("Watching Live");
        }
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "Go Live could not start the camera.";
        setError(message);
        setStatus("Live failed");
        onFailed?.(message);
      }
    }

    void start();

    const poll = window.setInterval(() => {
      fetch(`/api/board/rooms/${room.id}/live-signal?sessionId=${encodeURIComponent(session.id)}`)
        .then((res) => res.json())
        .then((payload) => {
          const signals = Array.isArray(payload?.signals) ? payload.signals : [];
          for (const signal of signals) void handleSignal(signal as LiveSignal);
        })
        .catch(() => undefined);
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void sendSignal(
        liveSignal({
          kind: host ? "ended" : "goodbye",
          sessionId: session.id,
          roomId: room.id,
          from: peerIdRef.current,
          role: host ? "host" : "viewer",
        })
      );
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      for (const id of [...peersRef.current.keys()]) closePeer(id);
      try {
        const sb = supabaseBrowser();
        if (channelRef.current) void sb.removeChannel(channelRef.current);
        channelRef.current = null;
      } catch {
        // ignore
      }
    };
    // session.id + host role define the live graph
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, session.id, userId, host]);

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-rose-300/25 bg-black/40 p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(500px 200px at 20% 0%, ${room.color}33, transparent 60%),
            linear-gradient(180deg, rgba(244,63,94,0.16), transparent 55%)`,
        }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-400/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-rose-50">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400 shadow-[0_0_10px_#fb7185]" />
            Live Room · {room.name}
          </div>
          <span className="text-xs text-white/55">
            {watching} {watching === 1 ? "inside" : "inside"}
            {displayName && host ? ` · ${displayName}` : ""}
          </span>
        </div>
        <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={host}
            className="aspect-video w-full bg-black object-cover"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/55">
          <span>{status}</span>
          {error ? <span className="text-rose-200">{error}</span> : null}
        </div>
      </div>
    </section>
  );
}
