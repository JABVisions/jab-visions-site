"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Room, RoomCallSession } from "@/lib/board/rooms";
import {
  CALL_MAX_PARTICIPANTS,
  LIVE_MEDIA_CONSTRAINTS,
  addCallParticipant,
  applyCallParticipants,
  callShouldCreateOffer,
  isCallHost,
  liveIceServers,
  liveSignal,
  roomCallChannelName,
  type LiveSignal,
} from "@/lib/board/rooms/liveWebRtc";

type Props = {
  room: Room;
  session: RoomCallSession;
  userId: string;
  displayName?: string;
  onSessionChange?: (session: RoomCallSession) => void;
  onFailed?: (message: string) => void;
  onEnded?: () => void;
};

type RemoteTile = {
  peerId: string;
  stream: MediaStream;
};

function peerIdFor(userId: string) {
  return `${userId}:${Math.random().toString(36).slice(2, 8)}`;
}

function userIdFromPeer(peerId: string) {
  return String(peerId || "").split(":")[0] || peerId;
}

export default function RoomCallStage({
  room,
  session,
  userId,
  displayName,
  onSessionChange,
  onFailed,
  onEnded,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const knownRef = useRef(new Set<string>());
  const peerIdRef = useRef(peerIdFor(userId));
  const channelRef = useRef<ReturnType<ReturnType<typeof supabaseBrowser>["channel"]> | null>(null);
  const [status, setStatus] = useState("Starting Room Call…");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remotes, setRemotes] = useState<RemoteTile[]>([]);

  useEffect(() => {
    peerIdRef.current = peerIdFor(userId);
  }, [userId, session.id]);

  useEffect(() => {
    let cancelled = false;
    const channelName = roomCallChannelName(room.id);
    const host = isCallHost(session, userId);
    const participants = new Set<string>(session.participantIds.length ? session.participantIds : [userId]);

    function attachLocal(stream: MediaStream) {
      streamRef.current = stream;
      const node = localVideoRef.current;
      if (node) {
        node.srcObject = stream;
        void node.play().catch(() => undefined);
      }
    }

    function setRemoteStream(peerId: string, stream: MediaStream) {
      setRemotes((current) => {
        const without = current.filter((row) => row.peerId !== peerId);
        return [...without, { peerId, stream }];
      });
    }

    function dropRemote(peerId: string) {
      setRemotes((current) => current.filter((row) => row.peerId !== peerId));
    }

    function closePeer(id: string) {
      const peer = peersRef.current.get(id);
      if (peer) {
        try {
          peer.close();
        } catch {
          // ignore
        }
        peersRef.current.delete(id);
      }
      knownRef.current.delete(id);
      dropRemote(id);
      participants.delete(userIdFromPeer(id));
    }

    function publishParticipants() {
      const ids = Array.from(participants).filter(Boolean).slice(0, CALL_MAX_PARTICIPANTS);
      onSessionChange?.(applyCallParticipants(session, ids));
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
        if (remote) setRemoteStream(remoteId, remote);
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
            role: "caller",
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
          body: JSON.stringify({ sessionId: session.id, kind: "call", signal }),
        });
      } catch {
        // local call still stands
      }
    }

    async function offerTo(remoteId: string) {
      const peer = makePeer(remoteId);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal(
        liveSignal({
          kind: "offer",
          sessionId: session.id,
          roomId: room.id,
          from: peerIdRef.current,
          to: remoteId,
          role: "caller",
          sdp: offer.sdp,
        })
      );
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
        closePeer(signal.from);
        publishParticipants();
        return;
      }
      if (signal.kind === "hello") {
        if (participants.size >= CALL_MAX_PARTICIPANTS && !participants.has(userIdFromPeer(signal.from))) {
          return;
        }
        participants.add(userIdFromPeer(signal.from));
        const first = !knownRef.current.has(signal.from);
        knownRef.current.add(signal.from);
        publishParticipants();
        if (first) {
          await sendSignal(
            liveSignal({
              kind: "hello",
              sessionId: session.id,
              roomId: room.id,
              from: peerIdRef.current,
              to: signal.from,
              role: "caller",
            })
          );
        }
        if (callShouldCreateOffer(peerIdRef.current, signal.from) && !peersRef.current.get(signal.from)?.currentRemoteDescription) {
          try {
            await offerTo(signal.from);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not connect a caller.");
          }
        }
        return;
      }
      if (signal.kind === "offer" && signal.sdp) {
        const peer = makePeer(signal.from);
        if (peer.signalingState !== "stable" && peer.currentRemoteDescription) return;
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
            role: "caller",
            sdp: answer.sdp,
          })
        );
        setStatus("In the Room Call");
        return;
      }
      if (signal.kind === "answer" && signal.sdp) {
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
        attachLocal(stream);
        onSessionChange?.(addCallParticipant(session, userId));
        setStatus("In the Room Call");
        await sendSignal(
          liveSignal({
            kind: "hello",
            sessionId: session.id,
            roomId: room.id,
            from: peerIdRef.current,
            role: "caller",
          })
        );
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "Room Call could not start the camera.";
        setError(message);
        setStatus("Call failed");
        onFailed?.(message);
      }
    }

    void start();

    const poll = window.setInterval(() => {
      fetch(
        `/api/board/rooms/${room.id}/live-signal?sessionId=${encodeURIComponent(session.id)}&kind=call`
      )
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
          role: "caller",
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
    // session.id defines the call graph
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, session.id, userId]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
  }

  function toggleCamera() {
    const next = !cameraOff;
    setCameraOff(next);
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
  }

  const count = Math.max(1, remotes.length + 1);

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-cyan-300/25 bg-black/40 p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(500px 200px at 80% 0%, ${room.color}33, transparent 60%),
            linear-gradient(180deg, rgba(34,211,238,0.14), transparent 55%)`,
        }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-300/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-50">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
            Room Call · {room.name}
          </div>
          <span className="text-xs text-white/55">
            {count} {count === 1 ? "in the call" : "in the call"}
            {displayName ? ` · ${displayName}` : ""}
          </span>
        </div>
        <div
          className="mt-4 grid gap-3"
          style={{
            gridTemplateColumns: count === 1 ? "1fr" : "repeat(2, minmax(0, 1fr))",
          }}
        >
          <CallTile
            videoRef={localVideoRef}
            label={displayName ? `${displayName} (you)` : "You"}
            muted
            cameraOff={cameraOff}
          />
          {remotes.map((remote) => (
            <RemoteCallTile key={remote.peerId} stream={remote.stream} label="In the call" />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/55">
          <span>{status}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/80"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/80"
            >
              {cameraOff ? "Camera on" : "Camera off"}
            </button>
          </div>
        </div>
        {error ? <div className="mt-2 text-xs text-rose-200">{error}</div> : null}
      </div>
    </section>
  );
}

function CallTile({
  videoRef,
  label,
  muted,
  cameraOff,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  label: string;
  muted?: boolean;
  cameraOff?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[1.2rem] border border-white/10 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="aspect-video w-full bg-black object-cover"
      />
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/65">
        <span>{label}</span>
        {cameraOff ? <span className="text-white/40">Camera off</span> : null}
      </div>
    </div>
  );
}

function RemoteCallTile({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.srcObject = stream;
    void node.play().catch(() => undefined);
  }, [stream]);
  return <CallTile videoRef={ref} label={label} />;
}
