"use client";

import { useEffect, useRef, useState } from "react";
import { defaultAvatar, sanitizeAvatar, SKIN_TONES, EYE_STYLES, HAIR_STYLES, CLOTHING, ACCESSORIES, type AvatarAppearance } from "@/lib/anderzone/avatar";
import { DOOBOO_SPECIES } from "@/lib/anderzone/dooboo/species";
import { adoptFirstDooboo, commandPet, feedPet, type Dooboo } from "@/lib/anderzone/dooboo/pet";
import {
  cancelEdit,
  createEditor,
  createStarterPod,
  ensureStarterPod,
  FURNITURE_CATALOG,
  moveItem,
  placeItem,
  redoEdit,
  removeItem,
  rotateItem,
  saveEdit,
  undoEdit,
  type EditorState,
  type HomePod,
} from "@/lib/anderzone/homePod";
import type { AnderzoneSession } from "@/lib/anderzone/session";
import { enterRegion } from "@/lib/anderzone/world";
import { supabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";

const LOCAL_KEY = "anderzone-local-v1";

type LocalSave = {
  name: string;
  avatar: AvatarAppearance;
  pet: Dooboo | null;
  pod: HomePod;
  userId: string;
};

function readLocal(userId: string): LocalSave {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(LOCAL_KEY) || "null") as LocalSave | null;
    if (parsed?.pod && parsed.userId === userId) {
      return { ...parsed, avatar: sanitizeAvatar(parsed.avatar) };
    }
  } catch {
    // A broken local draft should not block play.
  }
  const granted = ensureStarterPod(userId, null, false);
  return { name: "Ander", avatar: defaultAvatar(), pet: null, pod: granted.pod ?? createStarterPod(userId), userId };
}

export default function AnderzoneClient() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<AnderzoneSession | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState("");
  const [connection, setConnection] = useState<"loading" | "local" | "online" | "failed">("loading");
  const [persistence, setPersistence] = useState("Checking Board save…");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [action, setAction] = useState<AnderzoneSession["action"]>(null);
  const [avatar, setAvatar] = useState<AvatarAppearance>(defaultAvatar());
  const [pet, setPet] = useState<Dooboo | null>(null);
  const [name, setName] = useState("Pip");
  const [regionTitle, setRegionTitle] = useState("ANDERZONE CENTRAL");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pod, setPod] = useState<HomePod | null>(null);
  const [note, setNote] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let destroy = () => undefined;
    const boot = async () => {
      let id = window.sessionStorage.getItem("anderzone-dev-id") || "";
      if (!id) {
        id = `dev-${crypto.randomUUID()}`;
        window.sessionStorage.setItem("anderzone-dev-id", id);
      }
      if (isSupabaseConfigured()) {
        const { data } = await supabaseBrowser().auth.getUser();
        if (data.user?.id) id = data.user.id;
      }
      const local = readLocal(id);
      let nextPod = local.pod;
      let nextAvatar = local.avatar;
      let nextPet = local.pet;
      let nextName = local.name;
      let persistenceNote = "This browser is keeping a local Anderzone draft. Apply supabase/sql/anderzone.sql to save it on Board.";
      try {
        const response = await fetch("/api/board/anderzone");
        if (response.status === 401) {
          if (!cancelled) setFailed("Sign in on Board to enter ANDERZONE CENTRAL.");
          return;
        }
        if (response.ok) {
          const body = await response.json();
          if (body?.pod) nextPod = body.pod;
          if (body?.appearance) nextAvatar = sanitizeAvatar(body.appearance);
          if (Array.isArray(body?.dooboos) && body.dooboos[0]) nextPet = body.dooboos[0];
          if (body?.displayName) nextName = body.displayName;
          persistenceNote = "Saved to your Board account.";
        }
      } catch {
        persistenceNote = "Board save is offline. Play continues in this browser.";
      }
      if (cancelled) return;
      const central = enterRegion("anderzone-central");
      if (!central.ok) return;
      const session: AnderzoneSession = {
        regionId: "anderzone-central",
        direction: { x: 0, y: 0 },
        interactQueued: false,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        name: nextName,
        avatar: nextAvatar,
        pet: nextPet,
        layout: nextPod.layout,
        editing: false,
        remote: [],
        player: { x: central.region.spawn!.x, y: central.region.spawn!.y, facing: "s" },
        prompt: null,
        action: null,
        picked: null,
        mapEpoch: 0,
      };
      sessionRef.current = session;
      setUserId(id);
      setAvatar(nextAvatar);
      setPet(nextPet);
      setPod(nextPod);
      setEditor(createEditor(nextPod.layout));
      setPersistence(persistenceNote);
      setConnection(process.env.NEXT_PUBLIC_ANDERZONE_ROOM_URL ? "loading" : "local");
      const host = hostRef.current;
      if (!host) return;
      try {
        const mounted = await import("./mountAnderzone");
        if (cancelled) return;
        const game = mounted.mountAnderzone(host, session, () => {
          setPrompt(session.prompt);
          setAction(session.action);
          setPet(session.pet ? { ...session.pet } : null);
          setRegionTitle(session.regionId === "home-pod" ? "Home Pod" : "ANDERZONE CENTRAL");
          const debug = {
            regionId: session.regionId,
            x: session.player.x,
            y: session.player.y,
            prompt: session.prompt,
            pet: session.pet ? { name: session.pet.name, behavior: session.pet.behavior, x: session.pet.x, y: session.pet.y } : null,
          };
          (window as unknown as { __anderzone?: unknown }).__anderzone = debug;
        });
        (window as unknown as { __anderzone?: unknown }).__anderzone = game.debug();
        destroy = () => {
          game.destroy();
          delete (window as unknown as { __anderzone?: unknown }).__anderzone;
        };
        setReady(true);
      } catch (error) {
        if (!cancelled) setFailed(error instanceof Error ? error.message : "Anderzone could not start.");
      }
    };
    void boot();
    return () => {
      cancelled = true;
      destroy();
    };
  }, []);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.reducedMotion = reducedMotion;
    session.avatar = avatar;
    session.pet = pet;
    session.layout = editor?.draft ?? pod?.layout ?? [];
    session.editing = session.regionId === "home-pod" && Boolean(editor);
  }, [reducedMotion, avatar, pet, editor, pod]);

  useEffect(() => {
    if (!userId || !pod) return;
    const save: LocalSave = { name: "Ander", avatar, pet, pod: { ...pod, layout: editor?.saved ?? pod.layout }, userId };
    window.sessionStorage.setItem(LOCAL_KEY, JSON.stringify(save));
  }, [userId, avatar, pet, pod, editor]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_ANDERZONE_ROOM_URL;
    if (!url || !userId || !ready) return;
    let socket: WebSocket;
    let seq = 1;
    try {
      socket = new WebSocket(url);
    } catch {
      setConnection("failed");
      return;
    }
    socket.onopen = () => {
      setConnection("online");
      socket.send(JSON.stringify({ type: "join", userId, name: "Ander", appearance: avatar, pet }));
    };
    socket.onerror = () => setConnection("failed");
    socket.onclose = () => setConnection((current) => (current === "online" ? "failed" : current));
    socket.onmessage = (event) => {
      const session = sessionRef.current;
      if (!session) return;
      const message = JSON.parse(String(event.data)) as { snapshot?: AnderzoneSession["remote"] extends never ? never : { players: AnderzoneSession["remote"] } };
      const players = (message as { snapshot?: { players?: AnderzoneSession["remote"] } }).snapshot?.players;
      if (players) session.remote = players.filter((player) => player.id !== userId);
    };
    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session || socket.readyState !== WebSocket.OPEN) return;
      seq += 1;
      socket.send(JSON.stringify({
        type: "input",
        seq,
        x: session.player.x,
        y: session.player.y,
        facing: session.player.facing,
        pet: session.pet ? { name: session.pet.name, speciesId: session.pet.speciesId, behavior: session.pet.behavior, x: session.pet.x, y: session.pet.y } : null,
      }));
    }, 100);
    return () => {
      window.clearInterval(timer);
      socket.close();
    };
  }, [userId, ready]);

  const hold = (x: number, y: number) => {
    const session = sessionRef.current;
    if (!session) return;
    session.direction = { x, y };
  };

  const interact = () => {
    const session = sessionRef.current;
    if (!session) return;
    session.interactQueued = true;
  };

  const adopt = (speciesId: string) => {
    const session = sessionRef.current;
    if (!session) return;
    const result = adoptFirstDooboo(session.pet ? [session.pet] : [], speciesId, name, session.player);
    if (!result.ok) {
      setNote(result.reason);
      return;
    }
    session.pet = result.pet;
    setPet(result.pet);
    setNote(`${result.pet.name} is with you.`);
    void fetch("/api/board/anderzone/dooboos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ speciesId, name }),
    }).catch(() => undefined);
  };

  const care = (command: "play" | "sleep" | "follow" | "greet" | "feed") => {
    const session = sessionRef.current;
    if (!session?.pet) return;
    const next = command === "feed"
      ? { ...session.pet, care: feedPet(session.pet.care), behavior: "idle" as const }
      : commandPet(session.pet, command, performance.now());
    session.pet = next;
    setPet({ ...next });
  };

  const edit = (next: EditorState, error?: string | null) => {
    setEditor(next);
    if (sessionRef.current) sessionRef.current.layout = next.draft;
    if (error) setNote(error);
  };

  const placeSelected = (kind: HomePod["inventory"][number]["kind"]) => {
    if (!editor || !pod) return;
    const spot = sessionRef.current?.picked ?? { x: 2, y: 2 };
    const result = placeItem(editor, { id: `${kind}-${Date.now()}`, kind, x: spot.x, y: spot.y, rotation: 0 }, pod.inventory);
    edit(result.editor, result.error);
  };

  const commitPod = async () => {
    if (!editor || !pod) return;
    const saved = saveEdit(pod, editor, pod.version);
    if (!saved.ok) {
      setNote(saved.reason === "version" ? "This Home Pod changed somewhere else. Reload before saving." : saved.reason);
      return;
    }
    setPod(saved.pod);
    setEditor(saved.editor);
    setNote("Home Pod saved.");
    await fetch("/api/board/anderzone/pod", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layout: saved.pod.layout, version: pod.version, visitorAccess: saved.pod.visitorAccess }),
    }).catch(() => undefined);
  };

  return (
    <section className="anderzone-shell" data-reduced={reducedMotion ? "true" : "false"}>
      <header className="anderzone-top">
        <div>
          <p>JAB Visions Board</p>
          <h1>{regionTitle}</h1>
        </div>
        <p className="anderzone-status" data-connection={connection}>
          {failed ? failed : ready ? persistence : "Opening ANDERZONE CENTRAL…"}
          {connection === "failed" ? " Room server unreachable. Playing locally." : ""}
          {connection === "local" ? " Local district." : ""}
          {connection === "online" ? " District connected." : ""}
        </p>
      </header>
      <div className="anderzone-stage" ref={hostRef} />
      {prompt ? <p className="anderzone-prompt">{prompt}</p> : null}
      {note ? <p className="anderzone-note">{note}</p> : null}
      <div className="anderzone-pad" aria-label="Move">
        {[{ x: 0, y: -1, label: "N" }, { x: 1, y: -1, label: "NE" }, { x: 1, y: 0, label: "E" }, { x: 1, y: 1, label: "SE" }, { x: 0, y: 1, label: "S" }, { x: -1, y: 1, label: "SW" }, { x: -1, y: 0, label: "W" }, { x: -1, y: -1, label: "NW" }].map((key) => (
          <button key={key.label} type="button" onPointerDown={() => hold(key.x, key.y)} onPointerUp={() => hold(0, 0)} onPointerLeave={() => hold(0, 0)}>
            {key.label}
          </button>
        ))}
        <button type="button" onClick={interact}>Use</button>
      </div>
      <div className="anderzone-panels">
        <fieldset>
          <legend>Ander</legend>
          <label>Skin<select value={avatar.skin} onChange={(event) => setAvatar({ ...avatar, skin: event.target.value as AvatarAppearance["skin"] })}>{SKIN_TONES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Eyes<select value={avatar.eyes} onChange={(event) => setAvatar({ ...avatar, eyes: event.target.value as AvatarAppearance["eyes"] })}>{EYE_STYLES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Hair<select value={avatar.hair} onChange={(event) => setAvatar({ ...avatar, hair: event.target.value as AvatarAppearance["hair"] })}>{HAIR_STYLES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Clothes<select value={avatar.clothing} onChange={(event) => setAvatar({ ...avatar, clothing: event.target.value as AvatarAppearance["clothing"] })}>{CLOTHING.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Extra<select value={avatar.accessory} onChange={(event) => setAvatar({ ...avatar, accessory: event.target.value as AvatarAppearance["accessory"] })}>{ACCESSORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </fieldset>
        {action === "adopt" || !pet ? (
          <fieldset>
            <legend>Dooboo Adoption Center</legend>
            <label>Name<input value={name} maxLength={16} onChange={(event) => setName(event.target.value)} /></label>
            <div>
              {DOOBOO_SPECIES.map((species) => (
                <button key={species.id} type="button" onClick={() => adopt(species.id)}>{species.label}</button>
              ))}
            </div>
          </fieldset>
        ) : null}
        {pet ? (
          <fieldset>
            <legend>{pet.name}</legend>
            <p>{pet.behavior} · bond {pet.care.bond} · fed {Math.round(pet.care.fullness)} · rest {Math.round(pet.care.energy)}</p>
            <button type="button" onClick={() => care("feed")}>Feed</button>
            <button type="button" onClick={() => care("play")}>Play</button>
            <button type="button" onClick={() => care("sleep")}>Sleep</button>
            <button type="button" onClick={() => care("greet")}>Greet</button>
            <button type="button" onClick={() => care("follow")}>Follow</button>
          </fieldset>
        ) : null}
        {regionTitle === "Home Pod" && editor && pod ? (
          <fieldset>
            <legend>Home Pod</legend>
            <p>Visitor access stays {pod.visitorAccess}. Click the floor, then place a piece.</p>
            {FURNITURE_CATALOG.map((item) => (
              <button key={item.id} type="button" onClick={() => placeSelected(item.id)}>{item.label}</button>
            ))}
            <button type="button" onClick={() => {
              if (!editor.selectedId) return;
              const result = rotateItem(editor, editor.selectedId, pod.inventory);
              edit(result.editor, result.error);
            }}>Rotate</button>
            <button type="button" onClick={() => {
              if (!editor.selectedId) return;
              const result = moveItem(editor, editor.selectedId, sessionRef.current?.picked?.x ?? 2, sessionRef.current?.picked?.y ?? 2, pod.inventory);
              edit(result.editor, result.error);
            }}>Move</button>
            <button type="button" onClick={() => editor.selectedId && edit(removeItem(editor, editor.selectedId))}>Remove</button>
            <button type="button" onClick={() => edit(undoEdit(editor))}>Undo</button>
            <button type="button" onClick={() => edit(redoEdit(editor))}>Redo</button>
            <button type="button" onClick={() => { const next = cancelEdit(editor); edit(next); setNote("Edits cancelled."); }}>Cancel</button>
            <button type="button" onClick={() => void commitPod()}>Save</button>
          </fieldset>
        ) : null}
      </div>
      <style>{`
        .anderzone-shell { color: #f4fff8; padding: 12px 12px 24px; }
        .anderzone-top { display: flex; justify-content: space-between; gap: 12px; align-items: end; }
        .anderzone-top p, .anderzone-status { letter-spacing: .14em; text-transform: uppercase; font-size: 10px; color: #b7ffe0; }
        .anderzone-top h1 { margin: 4px 0 0; font-size: 28px; }
        .anderzone-stage { margin-top: 12px; height: min(68vh, 640px); min-height: 280px; border: 1px solid rgba(183,255,224,.3); background: #071018; }
        .anderzone-prompt, .anderzone-note { margin: 8px 0 0; }
        .anderzone-pad, .anderzone-panels { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .anderzone-pad button, .anderzone-panels button, .anderzone-panels select, .anderzone-panels input {
          background: #102028; color: #f4fff8; border: 1px solid rgba(183,255,224,.35); border-radius: 999px; padding: 8px 10px; font: inherit;
        }
        .anderzone-panels fieldset { border: 1px solid rgba(183,255,224,.25); border-radius: 16px; padding: 10px; }
        @media (prefers-reduced-motion: reduce) {
          .anderzone-stage { scroll-behavior: auto; }
        }
      `}</style>
    </section>
  );
}
