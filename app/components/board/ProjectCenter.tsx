"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProjectDropMenu, {
  type ProjectDrop,
} from "@/app/components/board/projects/ProjectDropMenu";
import DropCommentsDrawer from "@/app/components/board/DropCommentsDrawer";
import LazyDropStudioStage from "@/app/components/board/LazyDropStudioStage";
import { compactDropCustomizations, type DropCustomization } from "@/lib/board/dropCustomizations";
import {
  addDropPadAsset,
  upsertDropPadAssetRemote,
  type DropPadAsset,
} from "@/lib/board/dropPadAssets";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  appendLocalActivity,
  createActivity,
  removeLocalActivity,
  type BoardActivity,
} from "@/lib/board/activity";
import { addDrop, EVENTS, removeDrops } from "@/lib/boardStore";
import {
  BOARD_PROJECTS_UPDATED_EVENT,
  configureBoardProjectsStorage,
  createBoardProject,
  pruneCorruptProjects,
  readBoardProjects,
  resolveBoardProjects,
  syncRemoteProjectActivitiesToStorage,
  syncResolvedProjectsToStorage,
  statusLabel,
  type BoardProject,
  type ProjectInvite,
  type ProjectRoomPost,
  writeBoardProjects,
} from "@/lib/board/projects";
import { pushDrop, readDrops, writeDrops } from "@/lib/board/drops/storage";
import { readCurrentBoardIdentity } from "@/lib/board/currentProfile";
import { emitBoardDropSignal } from "@/lib/board/dropSignals";
import {
  DESCRIPT_SHARE_EVENT,
  descriptPlainText,
  type DescriptDoc,
} from "@/lib/board/descriptDocs";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type StudioCaptureMode = "photo" | "video" | "audio" | "art" | "descript";
const WORK_THOUGHT_BUCKET = "board-media";

function sanitizeStudioFileName(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120) || "thought-media";
}

function isAudioThoughtFile(file: File | null) {
  if (!file) return false;
  return file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac|weba)$/i.test(file.name);
}

const PROJECT_DROPS_STORAGE_KEY = "jab_drop_pad_project_drops_v1";
const PROJECT_DROPS_STORAGE_KEYS = [
  PROJECT_DROPS_STORAGE_KEY,
  "jab_drop_pad_project_drops",
  "jab_drop_pad_projects_v1",
];
const PROJECT_DROPS_UPDATED_EVENT = "board:project-drops:updated";

type DropPadProjectDrop = {
  id: string;
  kind: string;
  title: string;
  description?: string;
  createdAt: number;
  payload?: {
    mediaUrl?: string;
    mediaType?: "image";
    embedUrl?: string;
    url?: string;
    text?: string;
  };
};

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return "";
  }
}

function TileFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-3xl border border-white/10 bg-black/20 overflow-hidden",
        "shadow-[0_12px_44px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function kindLabel(kind: string) {
  switch (kind) {
    case "media":
      return "Vision Drop";
    case "music":
      return "Music Drop";
    case "youtube":
      return "YouTube Drop";
    case "doc":
      return "Doc Drop";
    case "link":
      return "Link Drop";
    case "note":
      return "Note Drop";
    default:
      return "Project Drop";
  }
}

function readDropPadProjectDrops(): DropPadProjectDrop[] {
  if (typeof window === "undefined") return [];
  try {
    const drops: DropPadProjectDrop[] = [];

    for (const key of PROJECT_DROPS_STORAGE_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        const title = String(item?.title ?? item?.name ?? "").trim();
        const id = String(item?.id ?? "").trim();
        if (!title || !id) continue;

        const payload =
          item?.payload && typeof item.payload === "object"
            ? item.payload
            : {
                mediaUrl: item?.mediaUrl,
                mediaType: item?.mediaType,
                embedUrl: item?.embedUrl,
                url: item?.url,
                text: item?.text,
              };

        drops.push({
          id,
          kind: String(item?.kind ?? item?.type ?? "project"),
          title,
          description:
            typeof item?.description === "string"
              ? item.description
              : typeof item?.body === "string"
                ? item.body
                : undefined,
          createdAt: Number(item?.createdAt ?? item?.updatedAt ?? Date.now()),
          payload,
        });
      }
    }

    const seen = new Set<string>();
    return drops
      .filter((drop) => {
        if (seen.has(drop.id)) return false;
        seen.add(drop.id);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function projectFromDropPadProjectDrop(drop: DropPadProjectDrop): BoardProject {
  const mediaUrl =
    drop.payload?.mediaType === "image" && drop.payload.mediaUrl
      ? drop.payload.mediaUrl
      : undefined;
  const body = drop.payload?.text || drop.description || "";

  return {
    id: `droppad_${drop.id}`,
    createdAt: drop.createdAt,
    updatedAt: drop.createdAt,
    title: drop.title,
    logline: body,
    projectType: kindLabel(drop.kind),
    status: "casting",
    location: "",
    startDate: "",
    unionStatus: "Negotiable",
    compensationType: "Negotiable",
    rolesNeeded: body,
    contactName: "Project Host",
    contactEmail: "",
    notes: body || undefined,
    media: mediaUrl ? { kind: "image", src: mediaUrl } : undefined,
    invites: [],
    roomPosts: [
      {
        id: `post_${drop.id}`,
        authorName: "Project Host",
        text: body || `${drop.title} was added from Drop Pad OS.`,
        createdAt: drop.createdAt,
      },
    ],
  };
}

function DropPadProjectDropCard({ drop }: { drop: DropPadProjectDrop }) {
  const mediaUrl =
    drop.payload?.mediaType === "image" ? drop.payload.mediaUrl : undefined;
  const externalUrl = drop.payload?.url;
  const body = drop.payload?.text || drop.description;

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_16px_44px_rgba(0,0,0,0.24)]">
      {mediaUrl ? (
        <div className="bg-black/30 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt={drop.title}
            className="max-h-72 w-full rounded-2xl object-contain"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-white/90">{drop.title}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/45">
              {kindLabel(drop.kind)}
            </div>
          </div>
          <div className="shrink-0 text-xs text-white/40">
            {formatDate(drop.createdAt)}
          </div>
        </div>

        {body ? (
          <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/65">
            {body}
          </div>
        ) : null}

        {drop.payload?.embedUrl ? (
          <iframe
            src={drop.payload.embedUrl}
            title={`${drop.title} embed`}
            className="mt-4 h-40 w-full rounded-2xl border border-white/10 bg-black/30"
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
          />
        ) : null}

        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/76 hover:bg-black/40"
          >
            Open Link
          </a>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-white/10 bg-white/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.35em] text-white/55">{eyebrow}</div>
          <div className="mt-2 text-xl font-semibold text-white/90">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-white/55">{subtitle}</div> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

function projectFromDrop(drop: ProjectDrop): BoardProject {
  return createBoardProject({
    title: drop.title,
    logline: drop.logline,
    projectType: drop.projectType,
    status: drop.status,
    location: drop.location,
    startDate: drop.startDate,
    endDate: drop.endDate,
    unionStatus: drop.unionStatus,
    compensationType: drop.compensationType,
    rate: drop.rate,
    rolesNeeded: drop.rolesNeeded,
    contactName: drop.contactName,
    contactEmail: drop.contactEmail,
    notes: drop.notes,
    goal: drop.goal,
    milestone: drop.milestone,
    source: "work_board",
    media: drop.media,
  });
}

function projectCommentDropId(projectId: string) {
  return `project_drop_${projectId}`;
}

export default function ProjectCenter() {
  const [storageReady, setStorageReady] = useState(false);
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [dropPadProjectDrops, setDropPadProjectDrops] = useState<
    DropPadProjectDrop[]
  >([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inviteDraft, setInviteDraft] = useState({
    name: "",
    handle: "",
    email: "",
    role: "",
  });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [roomDraft, setRoomDraft] = useState("");
  const [commentsProject, setCommentsProject] = useState<BoardProject | null>(null);
  const [thoughtTitle, setThoughtTitle] = useState("");
  const [thoughtText, setThoughtText] = useState("");
  const [thoughtVisibility, setThoughtVisibility] = useState<"public" | "private">("public");
  const [thoughtMessage, setThoughtMessage] = useState<string | null>(null);
  // Work thought capture — mirrors Drop Studio's Thought Drop settings (voice + art).
  const [thoughtStudioMode, setThoughtStudioMode] = useState<StudioCaptureMode | null>(null);
  const [thoughtFile, setThoughtFile] = useState<File | null>(null);
  const [thoughtMediaSource, setThoughtMediaSource] = useState<"upload" | "capture" | null>(null);
  const [thoughtMediaPreview, setThoughtMediaPreview] = useState("");
  const [thoughtCustomizations, setThoughtCustomizations] = useState<DropCustomization>({});

  useEffect(() => {
    if (!thoughtFile) {
      setThoughtMediaPreview("");
      return;
    }
    const url = URL.createObjectURL(thoughtFile);
    setThoughtMediaPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thoughtFile]);

  function clearThoughtMedia() {
    setThoughtFile(null);
    setThoughtMediaSource(null);
    setThoughtCustomizations({});
  }

  useEffect(() => {
    function onDescriptShare(event: Event) {
      const doc = (event as CustomEvent<DescriptDoc>).detail;
      if (!doc || (doc.destination && doc.destination !== "work")) return;
      const plain = doc.plainText?.trim() || descriptPlainText(doc.html);
      if (doc.title?.trim()) setThoughtTitle(doc.title.trim());
      if (plain) setThoughtText(plain);
      setThoughtStudioMode(null);
      setThoughtMessage("Descript loaded into Work Drop Station.");
      window.setTimeout(() => setThoughtMessage(null), 1800);
    }
    window.addEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
    return () => window.removeEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
  }, []);

  async function uploadThoughtMedia(file: File, dropId: string) {
    try {
      const sb = supabaseBrowser();
      const { data: auth } = await sb.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return null;
      const storagePath = `${userId}/${dropId}/${Date.now()}-${sanitizeStudioFileName(file.name)}`;
      const { error } = await sb.storage.from(WORK_THOUGHT_BUCKET).upload(storagePath, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      });
      if (error) return null;
      return { bucket: WORK_THOUGHT_BUCKET, storagePath };
    } catch {
      return null;
    }
  }

  function loadProjects() {
    if (typeof window === "undefined") return;
    const localProjectDrops = readDropPadProjectDrops();
    const resolved = syncResolvedProjectsToStorage();
    const resolvedIds = new Set(resolved.map((project) => project.id));
    const merged = new Map(resolved.map((project) => [project.id, project]));

    for (const drop of localProjectDrops) {
      const project = projectFromDropPadProjectDrop(drop);
      const existing = merged.get(project.id);
      merged.set(project.id, existing ? { ...project, ...existing } : project);
    }

    const next = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    // Only persist when the drop-pad merge actually introduced NEW projects.
    // Writing on every load re-fires the projects/storage events this component
    // listens to, which re-enters loadProjects and writes again — an endless
    // loop that was multiplying the notebook with repetitive project drops.
    const hasNewProjects = next.some((project) => !resolvedIds.has(project.id));
    if (hasNewProjects) writeBoardProjects(next);
    setProjects(next);
    setDropPadProjectDrops(localProjectDrops);
  }

  function loadDropPadProjectDrops() {
    if (typeof window === "undefined") return;
    setDropPadProjectDrops(readDropPadProjectDrops());
  }

  async function loadRemoteProjects() {
    try {
      const sb = supabaseBrowser();
      setProjects(await syncRemoteProjectActivitiesToStorage(sb));
    } catch {
      loadProjects();
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function configureStorage() {
      try {
        const sb = supabaseBrowser();
        const { data: auth } = await sb.auth.getUser();
        const userId = auth.user?.id ?? null;
        setCurrentUserId(userId);
        let username = "";
        if (userId) {
          const { data: profile } = await sb
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();
          username = String(profile?.username || "").toLowerCase();
        }
        configureBoardProjectsStorage(userId, username === "johnandy");
      } catch {
        setCurrentUserId(null);
        configureBoardProjectsStorage(null, true);
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    }

    loadDropPadProjectDrops();
    void configureStorage();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadDropPadProjectDrops();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || PROJECT_DROPS_STORAGE_KEYS.includes(event.key)) {
        loadDropPadProjectDrops();
      }
    };
    const onProjectDropsUpdated = () => {
      loadDropPadProjectDrops();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(
      PROJECT_DROPS_UPDATED_EVENT,
      onProjectDropsUpdated as EventListener
    );

    const t = window.setInterval(loadDropPadProjectDrops, 1000);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        PROJECT_DROPS_UPDATED_EVENT,
        onProjectDropsUpdated as EventListener
      );
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    // Purge the corrupt, auto-ingested project drops from storage before loading.
    pruneCorruptProjects();
    loadProjects();
    void loadRemoteProjects();

    const onStorage = (event: StorageEvent) => {
      if (event.key) loadProjects();
    };
    const onProjectsUpdated = () => {
      loadProjects();
    };
    const onFeedUpdated = () => {
      loadProjects();
    };
    const onActivityNew = () => {
      loadProjects();
      void loadRemoteProjects();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(
      BOARD_PROJECTS_UPDATED_EVENT,
      onProjectsUpdated as EventListener
    );
    window.addEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
    window.addEventListener("board:activity:new", onActivityNew as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        BOARD_PROJECTS_UPDATED_EVENT,
        onProjectsUpdated as EventListener
      );
      window.removeEventListener(EVENTS.feedUpdated, onFeedUpdated as EventListener);
      window.removeEventListener("board:activity:new", onActivityNew as EventListener);
    };
  }, [storageReady]);

  useEffect(() => {
    const onCreate = () => {
      setActiveProjectId(null);
      setCreateOpen(true);
    };

    window.addEventListener("board:projects:create", onCreate as EventListener);
    return () =>
      {
        window.removeEventListener("board:projects:create", onCreate as EventListener);
      };
  }, []);

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null;
    return projects.find((project) => project.id === activeProjectId) ?? null;
  }, [projects, activeProjectId]);

  const commitProjects = (
    updater: (current: BoardProject[]) => BoardProject[]
  ) => {
    setProjects((current) => {
      const next = updater(current);
      writeBoardProjects(next);
      return next;
    });
  };

  const createProjectFromDrop = (drop: ProjectDrop) => {
    const next = projectFromDrop(drop);
    const nowIso = new Date(next.createdAt).toISOString();
    const identity = readCurrentBoardIdentity();
    const authorName = identity.displayName || next.authorName || next.contactName || "Project Host";
    const authorUsername = identity.username || next.authorUsername || "";
    const authorAvatar = identity.avatar || next.authorAvatar || "";
    const authorGlow = identity.glow || next.authorGlow || "#FF4FD8";
    const authorAuraIntensity = identity.auraIntensity ?? next.authorAuraIntensity;
    const activity: BoardActivity = {
      id: `project_drop_${next.id}`,
      created_at: nowIso,
      user_id: currentUserId,
      kind: "board_drop",
      title: `Project Drop: ${next.title}`,
      body:
        next.logline ||
        `${next.contactName || "Host"} is planning a ${next.projectType.toLowerCase()} project.`,
      href: "/board/work",
      image_url: next.media?.kind === "image" ? next.media.src : null,
      meta: {
        cardStyle: "project_drop",
        projectId: next.id,
        dropType: "project",
        projectType: next.projectType,
        location: next.location || null,
        status: next.status,
        rolesNeeded: next.rolesNeeded || null,
        startDate: next.startDate || null,
        endDate: next.endDate || null,
        unionStatus: next.unionStatus || null,
        contactName: next.contactName || null,
        contactEmail: next.contactEmail || null,
        description: next.logline || null,
        notes: next.notes || null,
        goal: next.goal || null,
        milestone: next.milestone || null,
        source: "work_board",
        authorId: currentUserId || identity.id,
        authorName,
        authorUsername,
        authorAvatar,
        authorGlow,
        authorAuraIntensity,
        ownerUsername: authorUsername,
        ownerLabel: authorName,
        // Future backend fields for casting/gig database + Pay Drops routing.
        productionTitle: next.productionTitle || next.title,
        roleTitle: next.roleTitle || null,
        department: next.department || null,
        compensationType: next.compensationType || null,
        payRange: next.payRange || next.rate || null,
        remoteOrInPerson: next.remoteOrInPerson || null,
        deadline: next.deadline || null,
        auditionInstructions: next.auditionInstructions || null,
        applicationLink: next.applicationLink || null,
        attachedFiles: next.attachedFiles || null,
        payDropEligible: next.payDropEligible ?? null,
        signalSeed: {
          type: "project_drop_created",
          projectId: next.id,
        },
      },
    };

    addDrop({
      type: "status",
      title: `Project Drop: ${next.title}`,
      text:
        next.logline ||
        `${next.contactName || "Host"} opened a new project room on BOARD.`,
      authorId: currentUserId || identity.id,
      authorName,
      href: "/board/work",
      meta: {
        kind: "project_drop",
        cardStyle: "project_drop",
        dropType: "project",
        projectId: next.id,
        projectType: next.projectType,
        status: next.status,
        description: next.logline,
        goal: next.goal || null,
        milestone: next.milestone || null,
        source: "work_board",
        authorId: currentUserId || identity.id,
        authorName,
        authorUsername,
        authorAvatar,
        authorGlow,
        authorAuraIntensity,
        ownerUsername: authorUsername,
        ownerLabel: authorName,
      },
    });
    pushDrop({
      id: projectCommentDropId(next.id),
      type: "project",
      title: `Project Drop: ${next.title}`,
      createdAt: next.createdAt,
      url: "/board/work",
      description:
        next.logline ||
        `${next.contactName || "Host"} opened a new project room on BOARD.`,
      tags: [
        "project",
        next.projectType,
        statusLabel(next.status),
        next.location,
      ].filter(Boolean),
      authorId: currentUserId || identity.id,
      authorName,
      authorUsername,
      authorAvatar,
      authorGlow,
      authorAuraIntensity,
      imageUrl: next.media?.kind === "image" ? next.media.src : undefined,
      mediaUrl: next.media?.src,
      mediaKind: next.media?.kind,
      projectId: next.id,
      projectType: next.projectType,
      projectStatus: next.status,
      goal: next.goal,
      milestone: next.milestone,
      source: "work_board",
      origin: "project_notebook",
      meta: {
        kind: "project_drop",
        cardStyle: "project_drop",
        dropType: "project",
        projectId: next.id,
        projectType: next.projectType,
        status: next.status,
        location: next.location || null,
        rolesNeeded: next.rolesNeeded || null,
        startDate: next.startDate || null,
        endDate: next.endDate || null,
        unionStatus: next.unionStatus || null,
        compensationType: next.compensationType || null,
        rate: next.rate || null,
        contactName: next.contactName || null,
        contactEmail: next.contactEmail || null,
        description: next.logline || null,
        notes: next.notes || null,
        goal: next.goal || null,
        milestone: next.milestone || null,
        source: "work_board",
        authorId: currentUserId || identity.id,
        authorName,
        authorUsername,
        authorAvatar,
        authorGlow,
        authorAuraIntensity,
        signalSeed: {
          type: "project_drop_created",
          projectId: next.id,
        },
      },
    });
    appendLocalActivity(activity);
    window.dispatchEvent(new CustomEvent("board:activity:new", { detail: activity }));
    emitBoardDropSignal({
      type: "project_drop_created",
      dropId: projectCommentDropId(next.id),
      projectId: next.id,
      userId: currentUserId || identity.id,
      title: next.title,
      meta: {
        projectType: next.projectType,
        status: next.status,
        source: "work_board",
      },
    });
    void (async () => {
      try {
        const sb = supabaseBrowser();
        const { data } = await sb.auth.getUser();
        const userId = data.user?.id;
        if (!userId) return;
        await createActivity(sb, {
          user_id: userId,
          kind: activity.kind,
          title: activity.title,
          body: activity.body,
          href: activity.href,
          image_url: activity.image_url,
          meta: activity.meta,
        });
      } catch {
        // Keep the local project notebook even if remote activity sync fails.
      }
    })();

    commitProjects((prev) => [next, ...prev]);
    setActiveProjectId(next.id);
    setCreateOpen(false);
  };

  const createWorkThoughtDrop = async () => {
    const cleanTitle = thoughtTitle.trim();
    const cleanThought = thoughtText.trim();

    if (!cleanTitle && !cleanThought && !thoughtFile) {
      setThoughtMessage("Add a note or capture a Work Drop first.");
      window.setTimeout(() => setThoughtMessage(null), 1800);
      return;
    }

    const identity = readCurrentBoardIdentity();
    const dropId = uid("thought");
    const createdAt = Date.now();
    const title = cleanTitle || "Work Thought";
    const body = cleanThought || "A work thought landed on Board.";

    const isAudio = isAudioThoughtFile(thoughtFile);
    const isVideo = !!thoughtFile && thoughtFile.type.startsWith("video/");
    const mediaKind: "audio" | "video" | "image" | null = thoughtFile
      ? isAudio
        ? "audio"
        : isVideo
          ? "video"
          : "image"
      : null;
    const thoughtFormat = thoughtFile ? (isAudio ? "voice" : "doodle") : "text";

    let uploaded: { bucket: string; storagePath: string } | null = null;
    if (thoughtFile) {
      uploaded = await uploadThoughtMedia(thoughtFile, dropId);
      if (!uploaded) {
        setThoughtMessage("Couldn't upload that capture — saving the text only.");
        window.setTimeout(() => setThoughtMessage(null), 2200);
      }
    }

    const mediaMeta = uploaded
      ? {
          mediaKind,
          bucket: uploaded.bucket,
          storagePath: uploaded.storagePath,
          fileName: thoughtFile?.name ?? null,
          mediaSource: thoughtMediaSource ?? "upload",
          badgeLabel: thoughtMediaSource === "capture" ? "Captured on Board" : null,
          customizations: compactDropCustomizations(thoughtCustomizations) ?? null,
        }
      : {};

    const activity: BoardActivity = {
      id: `work_thought_${dropId}`,
      created_at: new Date(createdAt).toISOString(),
      user_id: currentUserId || identity.id,
      kind: "board_drop",
      title,
      body,
      href: "/board/work",
      image_url: null,
      meta: {
        source: "work_board",
        origin: "work_board",
        dropId,
        dropType: "thought",
        drop_flavor: "thought",
        visibility: thoughtVisibility,
        thoughtFormat,
        thoughtText: cleanThought || null,
        description: cleanThought || null,
        authorId: currentUserId || identity.id,
        authorName: identity.displayName,
        authorUsername: identity.username || null,
        authorAvatar: identity.avatar || null,
        authorGlow: identity.glow,
        authorAuraIntensity: identity.auraIntensity,
        ...mediaMeta,
        signalSeed: {
          type: "thought_drop_created",
          dropId,
        },
      },
    };

    appendLocalActivity(activity);
    if (thoughtVisibility === "public") {
      pushDrop({
        id: dropId,
        type: "thought",
        title,
        createdAt,
        url: "/board/work",
        description: cleanThought || undefined,
        visibility: "public",
        thoughtFormat,
        thoughtText: cleanThought || body,
        authorId: currentUserId || identity.id,
        authorName: identity.displayName,
        authorUsername: identity.username || undefined,
        authorAvatar: identity.avatar || undefined,
        authorGlow: identity.glow,
        authorAuraIntensity: identity.auraIntensity,
        source: "work_board",
        origin: "work_board",
        ...(uploaded
          ? {
              bucket: uploaded.bucket,
              storagePath: uploaded.storagePath,
              mediaKind: mediaKind ?? undefined,
              mediaSource: thoughtMediaSource ?? "upload",
            }
          : {}),
        meta: {
          activityId: activity.id,
          signalSeed: {
            type: "thought_drop_created",
            dropId,
          },
        },
      });
      window.dispatchEvent(new CustomEvent("board:activity:new", { detail: activity }));
    }

    window.dispatchEvent(new StorageEvent("storage", { key: "jab_board_activity_v1" }));
    emitBoardDropSignal({
      type: "thought_drop_created",
      dropId,
      userId: currentUserId || identity.id,
      title,
      meta: {
        visibility: thoughtVisibility,
        source: "work_board",
      },
    });

    // Every Work Drop also lands in the Drop Pad Assets bin.
    try {
      const assetId = `wd_${dropId}`;
      let asset: DropPadAsset;
      if (uploaded) {
        const sb = supabaseBrowser();
        const publicUrl =
          sb.storage.from(uploaded.bucket).getPublicUrl(uploaded.storagePath).data.publicUrl || "";
        asset = {
          id: assetId,
          kind: "media",
          title,
          description: cleanThought || undefined,
          createdAt,
          payload:
            mediaKind === "image"
              ? { mediaType: "image", mediaUrl: publicUrl }
              : { mediaUrl: publicUrl },
        };
      } else {
        asset = {
          id: assetId,
          kind: "note",
          title,
          description: cleanThought || undefined,
          createdAt,
          payload: { text: cleanThought || body },
        };
      }
      addDropPadAsset(asset);
      if (currentUserId) {
        void upsertDropPadAssetRemote(supabaseBrowser(), currentUserId, asset);
      }
    } catch {
      // Best-effort mirror — the Work Drop still posts even if the Assets write fails.
    }

    setThoughtTitle("");
    setThoughtText("");
    setThoughtVisibility("public");
    clearThoughtMedia();
    setThoughtMessage(thoughtVisibility === "private" ? "Private Work Drop saved → Assets." : "Work Drop dropped → Assets.");
    window.setTimeout(() => setThoughtMessage(null), 1800);
  };

  const updateProject = (id: string, patch: Partial<BoardProject>) => {
    commitProjects((prev) =>
      prev.map((project) =>
        project.id === id
          ? { ...project, ...patch, updatedAt: Date.now() }
          : project
      )
    );
  };

  const deleteProject = (id: string) => {
    removeLocalActivity(
      (item) =>
        item.id === `project_drop_${id}` ||
        item.meta?.projectId === id
    );
    removeDrops(
      (drop) => drop.meta?.projectId === id
    );
    writeDrops(
      readDrops().filter(
        (drop) => drop.projectId !== id && drop.id !== projectCommentDropId(id)
      )
    );

    commitProjects((prev) => prev.filter((project) => project.id !== id));
    if (commentsProject?.id === id) setCommentsProject(null);
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setInviteError(null);
      setInviteDraft({ name: "", handle: "", email: "", role: "" });
      setRoomDraft("");
    }
  };

  const addInvite = () => {
    if (!activeProject) return;
    const name = inviteDraft.name.trim();
    if (!name) {
      setInviteError("Invite name is required.");
      return;
    }

    const invite: ProjectInvite = {
      id: uid("invite"),
      name,
      handle: inviteDraft.handle.trim() || undefined,
      email: inviteDraft.email.trim() || undefined,
      role: inviteDraft.role.trim() || undefined,
      status: "invited",
      invitedAt: Date.now(),
    };

    updateProject(activeProject.id, {
      invites: [invite, ...(activeProject.invites ?? [])],
      roomPosts: [
        {
          id: uid("post"),
          authorName: activeProject.contactName || "Host",
          text: `Invited ${invite.name}${invite.role ? ` for ${invite.role}` : ""} to the project room.`,
          createdAt: Date.now(),
        },
        ...(activeProject.roomPosts ?? []),
      ],
    });

    setInviteDraft({ name: "", handle: "", email: "", role: "" });
    setInviteError(null);
  };

  const toggleInviteStatus = (invite: ProjectInvite) => {
    if (!activeProject) return;
    updateProject(activeProject.id, {
      invites: (activeProject.invites ?? []).map((item) =>
        item.id === invite.id
          ? {
              ...item,
              status: item.status === "joined" ? "invited" : "joined",
            }
          : item
      ),
    });
  };

  const postRoomMessage = () => {
    if (!activeProject) return;
    const text = roomDraft.trim();
    if (!text) return;

    const post: ProjectRoomPost = {
      id: uid("post"),
      authorName: activeProject.contactName || "Host",
      text,
      createdAt: Date.now(),
    };

    updateProject(activeProject.id, {
      roomPosts: [post, ...(activeProject.roomPosts ?? [])],
    });
    setRoomDraft("");
  };

  const projectTiles = useMemo(
    () =>
      [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects]
  );

  const allProjectDropCount = projectTiles.length + dropPadProjectDrops.length;
  const universalProjectDropCount = useMemo(() => {
    if (typeof window === "undefined") return 0;
    return readDrops().filter((drop) => drop.type === "project").length;
  }, [projects, dropPadProjectDrops]);

  if (!activeProject) {
    return (
      <div className="w-full">
        <TileFrame className="mb-5">
          <SectionHeader
            eyebrow="WORK DROP"
            title="Work Drop Station"
            subtitle="Write a Work Drop in Descript — scripts, notes, and production docs."
          />
          <div className="grid gap-4 p-5">
            <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
              <textarea
                value={thoughtTitle}
                onChange={(event) => setThoughtTitle(event.target.value)}
                placeholder="Optional title"
                rows={2}
                aria-label="Optional title"
                className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-snug text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-200/15"
              />
              <div className="flex flex-wrap gap-2">
                {(["public", "private"] as const).map((visibility) => (
                  <button
                    key={visibility}
                    type="button"
                    onClick={() => setThoughtVisibility(visibility)}
                    className={clsx(
                      "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
                      thoughtVisibility === visibility
                        ? "border-lime-200/30 bg-lime-300/18 text-lime-50"
                        : "border-white/10 bg-black/25 text-white/55 hover:bg-white/10"
                    )}
                  >
                    {visibility}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={thoughtText}
              onChange={(event) => setThoughtText(event.target.value)}
              rows={4}
              placeholder="Catch the work thought before it leaves..."
              className="min-h-[116px] w-full rounded-3xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-lime-200/15"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setThoughtStudioMode("descript")}
                className="rounded-full border border-slate-200/25 bg-slate-300/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-50/88 transition hover:bg-slate-300/20"
              >
                ✍️ Open Descript
              </button>
              <span className="text-xs text-white/40">
                Write your Work Drop in Descript — scripts, notes, and production docs.
              </span>
            </div>

            {thoughtMediaPreview ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3">
                <button
                  type="button"
                  onClick={clearThoughtMedia}
                  aria-label="Remove capture"
                  className="absolute right-3 top-3 z-10 rounded-full border border-pink-300/40 bg-pink-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-pink-50 transition hover:bg-pink-500/30"
                >
                  ✕ Remove
                </button>
                {isAudioThoughtFile(thoughtFile) ? (
                  <audio src={thoughtMediaPreview} controls preload="metadata" className="w-full" />
                ) : thoughtFile?.type.startsWith("video/") ? (
                  <video
                    src={thoughtMediaPreview}
                    controls
                    playsInline
                    className="mx-auto max-h-64 w-auto rounded-xl"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thoughtMediaPreview}
                    alt="Work Drop capture"
                    className="mx-auto max-h-64 w-auto rounded-xl object-contain"
                  />
                )}
                <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-white/45">
                  {isAudioThoughtFile(thoughtFile)
                    ? "Voice memo"
                    : thoughtFile?.type.startsWith("video/")
                      ? "Video"
                      : "Photo / art"}
                  {thoughtMediaSource === "capture" ? " · Captured on Board" : ""}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white/45">
                Public Work Drops can enter the Feed. Private Work Drops stay in your Activity Channel.
              </div>
              <button
                type="button"
                onClick={createWorkThoughtDrop}
                className="rounded-2xl border border-cyan-200/20 bg-cyan-400/15 px-4 py-3 text-sm text-cyan-50/90 transition hover:bg-cyan-400/22"
              >
                Save Work Drop
              </button>
            </div>
            {thoughtMessage ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/72">
                {thoughtMessage}
              </div>
            ) : null}
          </div>
        </TileFrame>

        <TileFrame>
          <SectionHeader
            eyebrow="PROJECTS"
            title="Project Notebook"
            subtitle="Create host-ready project drops, then open each tile to manage collaborators and project room activity."
            action={
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-2xl border border-lime-300/20 bg-lime-400/15 px-4 py-2 text-sm text-lime-100/90 hover:bg-lime-400/20 transition"
              >
                + New Project Drop
              </button>
            }
          />

          <div className="p-5">
            <div className="mb-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/45">
              Sources: {projectTiles.length} notebook projects · {dropPadProjectDrops.length} Drop Pad project drops · {universalProjectDropCount} legacy project drops
            </div>

            {allProjectDropCount === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/65">
                No projects yet. Start with a Project Drop and it will become a live project tile here.
              </div>
            ) : (
              <div className="grid gap-5">
                {dropPadProjectDrops.length > 0 ? (
                  <div className="rounded-3xl border border-lime-300/15 bg-lime-400/[0.06] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-lime-100/90">
                          Drop Pad Project Drops
                        </div>
                        <div className="mt-1 text-xs text-white/48">
                          Drops placed into the Projects destination from Drop Pad OS.
                        </div>
                      </div>
                      <div className="text-xs text-white/42">
                        {dropPadProjectDrops.length} drops
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4">
                      {dropPadProjectDrops.map((drop) => (
                        <DropPadProjectDropCard key={drop.id} drop={drop} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {projectTiles.map((project) => (
                  <div
                    key={project.id}
                    className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.04] text-left shadow-[0_16px_44px_rgba(0,0,0,0.28)] transition hover:bg-white/[0.08]"
                  >
                    <div className="relative h-56 bg-black/30 md:h-64">
                      <div className="absolute right-4 top-4 z-10 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCommentsProject(project)}
                          className="rounded-full border border-cyan-200/25 bg-cyan-400/15 px-3 py-1 text-[11px] tracking-[0.16em] text-cyan-50/90 transition hover:bg-cyan-400/22"
                        >
                          Comment
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProject(project.id)}
                          className="rounded-full border border-red-300/25 bg-red-500/20 px-3 py-1 text-[11px] tracking-[0.16em] text-red-50/90 hover:bg-red-500/28 transition"
                        >
                          Delete
                        </button>
                      </div>
                      {project.media ? (
                        project.media.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={project.media.src}
                            alt={project.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <video
                            src={project.media.src}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                          />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.16),transparent_48%),linear-gradient(180deg,rgba(12,12,20,0.92),rgba(4,4,8,0.98))]">
                          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] tracking-[0.28em] text-white/55">
                            PROJECT TILE
                          </div>
                        </div>
                      )}

                      <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] tracking-[0.24em] text-white/80">
                        {statusLabel(project.status)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveProjectId(project.id)}
                      className="block w-full p-5 text-left"
                    >
                      <div className="text-lg font-semibold text-white/92">
                        {project.title}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/45">
                        {project.projectType}
                      </div>
                      <div className="mt-3 line-clamp-3 text-sm leading-6 text-white/65">
                        {project.logline || "Add a logline to pitch the project."}
                      </div>

                      {project.goal || project.milestone ? (
                        <div className="mt-4 grid gap-2 rounded-2xl border border-lime-200/10 bg-lime-300/[0.06] p-3 text-xs text-lime-50/72">
                          {project.goal ? (
                            <div>
                              <span className="font-semibold uppercase tracking-[0.18em] text-lime-100/55">
                                Goal
                              </span>{" "}
                              {project.goal}
                            </div>
                          ) : null}
                          {project.milestone ? (
                            <div>
                              <span className="font-semibold uppercase tracking-[0.18em] text-lime-100/55">
                                Milestone
                              </span>{" "}
                              {project.milestone}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-5 grid grid-cols-2 gap-4 text-xs text-white/52 md:grid-cols-4">
                        <div>
                          <div className="tracking-[0.22em] text-white/35">Location</div>
                          <div className="mt-1 text-white/75">{project.location || "TBD"}</div>
                        </div>
                        <div>
                          <div className="tracking-[0.22em] text-white/35">Dates</div>
                          <div className="mt-1 text-white/75">
                            {project.startDate || "TBD"}
                            {project.endDate ? ` - ${project.endDate}` : ""}
                          </div>
                        </div>
                        <div>
                          <div className="tracking-[0.22em] text-white/35">Invites</div>
                          <div className="mt-1 text-white/75">{project.invites.length}</div>
                        </div>
                        <div>
                          <div className="tracking-[0.22em] text-white/35">Room Posts</div>
                          <div className="mt-1 text-white/75">{project.roomPosts.length}</div>
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TileFrame>

        <ProjectDropMenu
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreate={createProjectFromDrop}
        />
        <DropCommentsDrawer
          open={Boolean(commentsProject)}
          onClose={() => setCommentsProject(null)}
          dropId={commentsProject ? projectCommentDropId(commentsProject.id) : ""}
          dropTitle={commentsProject?.title}
        />
        <LazyDropStudioStage
          open={thoughtStudioMode !== null}
          initialFile={null}
          initialMode={thoughtStudioMode ?? "photo"}
          allowedModes={["photo", "video", "audio", "art", "descript"]}
          descriptDestination="work"
          value={thoughtCustomizations}
          onChange={setThoughtCustomizations}
          onClose={() => setThoughtStudioMode(null)}
          onComplete={(file, source) => {
            setThoughtFile(file);
            setThoughtMediaSource(source);
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <TileFrame>
        <SectionHeader
          eyebrow="PROJECT ROOM"
          title={activeProject.title}
          subtitle={`${activeProject.projectType} • ${statusLabel(
            activeProject.status
          )}`}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCommentsProject(activeProject)}
                className="rounded-2xl border border-cyan-200/15 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-50/75 transition hover:bg-cyan-400/15"
              >
                Comment
              </button>
              <button
                type="button"
                onClick={() => setActiveProjectId(null)}
                className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70 hover:bg-black/40 transition"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => deleteProject(activeProject.id)}
                className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/60 hover:bg-black/40 transition"
              >
                Delete
              </button>
            </div>
          }
        />

        <div className="p-5 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs tracking-[0.30em] text-white/45">PROJECT DROP</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-white/42">Location</div>
                  <div className="mt-1 text-sm text-white/82">
                    {activeProject.location || "TBD"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/42">Dates</div>
                  <div className="mt-1 text-sm text-white/82">
                    {activeProject.startDate || "TBD"}
                    {activeProject.endDate ? ` - ${activeProject.endDate}` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/42">Union</div>
                  <div className="mt-1 text-sm text-white/82">
                    {activeProject.unionStatus || "TBD"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/42">Compensation</div>
                  <div className="mt-1 text-sm text-white/82">
                    {activeProject.compensationType}
                    {activeProject.rate ? ` • ${activeProject.rate}` : ""}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-sm text-white/72">{activeProject.logline}</div>

              {activeProject.goal || activeProject.milestone ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-lime-200/10 bg-lime-300/[0.06] p-4">
                  {activeProject.goal ? (
                    <div>
                      <div className="text-xs tracking-[0.26em] text-lime-100/45">
                        GOAL
                      </div>
                      <div className="mt-2 text-sm text-lime-50/78">
                        {activeProject.goal}
                      </div>
                    </div>
                  ) : null}
                  {activeProject.milestone ? (
                    <div>
                      <div className="text-xs tracking-[0.26em] text-lime-100/45">
                        NEXT MILESTONE
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-lime-50/72">
                        {activeProject.milestone}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs tracking-[0.26em] text-white/40">ROLES NEEDED</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-white/76">
                  {activeProject.rolesNeeded || "No roles added yet."}
                </div>
              </div>

              {activeProject.notes ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-xs tracking-[0.26em] text-white/40">HOST NOTES</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-white/70">
                    {activeProject.notes}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs tracking-[0.30em] text-white/45">HOST PANEL</div>
              <div className="mt-3 space-y-3 text-sm text-white/72">
                <div>
                  <div className="text-xs text-white/42">Host</div>
                  <div className="mt-1 text-white/86">{activeProject.contactName}</div>
                </div>
                <div>
                  <div className="text-xs text-white/42">Contact Email</div>
                  <div className="mt-1 break-all text-white/86">
                    {activeProject.contactEmail}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/42">Updated</div>
                  <div className="mt-1 text-white/86">
                    {formatDate(activeProject.updatedAt)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs tracking-[0.30em] text-white/45">
                    PROJECT INVITES
                  </div>
                  <div className="mt-1 text-sm text-white/62">
                    Invite collaborators into this project room.
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/70">
                  {activeProject.invites.length} invited
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <input
                  value={inviteDraft.name}
                  onChange={(event) =>
                    setInviteDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Invite name"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
                <input
                  value={inviteDraft.handle}
                  onChange={(event) =>
                    setInviteDraft((prev) => ({ ...prev, handle: event.target.value }))
                  }
                  placeholder="@handle (optional)"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
                <input
                  value={inviteDraft.email}
                  onChange={(event) =>
                    setInviteDraft((prev) => ({ ...prev, email: event.target.value }))
                  }
                  placeholder="Email (optional)"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
                <input
                  value={inviteDraft.role}
                  onChange={(event) =>
                    setInviteDraft((prev) => ({ ...prev, role: event.target.value }))
                  }
                  placeholder="Invited for role / department"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />

                {inviteError ? (
                  <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200/90">
                    {inviteError}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={addInvite}
                  className="rounded-2xl border border-lime-300/18 bg-lime-400/15 px-4 py-3 text-sm text-lime-100/90 hover:bg-lime-400/20 transition"
                >
                  Invite to Project Room
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {activeProject.invites.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/55">
                    No invites yet. Add names here and they’ll appear as project collaborators.
                  </div>
                ) : (
                  activeProject.invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="rounded-2xl border border-white/10 bg-black/25 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white/86">
                            {invite.name}
                          </div>
                          <div className="mt-1 text-xs text-white/52">
                            {[invite.handle, invite.role, invite.email]
                              .filter(Boolean)
                              .join(" • ") || "Project collaborator"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleInviteStatus(invite)}
                          className={clsx(
                            "rounded-full border px-3 py-1 text-[11px] tracking-[0.18em] transition",
                            invite.status === "joined"
                              ? "border-cyan-300/25 bg-cyan-400/15 text-cyan-100/90"
                              : "border-pink-300/20 bg-pink-400/15 text-pink-100/90"
                          )}
                        >
                          {invite.status === "joined" ? "JOINED" : "INVITED"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs tracking-[0.30em] text-white/45">
                    PROJECT ROOM
                  </div>
                  <div className="mt-1 text-sm text-white/62">
                    A forum-style room for invites, updates, and project planning.
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/70">
                  {activeProject.roomPosts.length} posts
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <textarea
                  value={roomDraft}
                  onChange={(event) => setRoomDraft(event.target.value)}
                  rows={3}
                  placeholder="Post an update to your project room..."
                  className="min-h-[92px] flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/85 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/10"
                />
                <button
                  type="button"
                  onClick={postRoomMessage}
                  className="self-end rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/85 hover:bg-white/15 transition"
                >
                  Post
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {activeProject.roomPosts.map((post) => (
                  <div
                    key={post.id}
                    className="rounded-2xl border border-white/10 bg-black/25 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white/86">
                        {post.authorName}
                      </div>
                      <div className="text-xs text-white/42">
                        {formatDate(post.createdAt)}
                      </div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-white/68">
                      {post.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TileFrame>

      <ProjectDropMenu
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createProjectFromDrop}
      />
      <DropCommentsDrawer
        open={Boolean(commentsProject)}
        onClose={() => setCommentsProject(null)}
        dropId={commentsProject ? projectCommentDropId(commentsProject.id) : ""}
        dropTitle={commentsProject?.title}
      />
    </div>
  );
}
