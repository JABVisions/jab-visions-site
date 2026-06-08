"use client";

import React, { useMemo, useState } from "react";
import type {
  WorkState,
  AssetType,
  Visibility,
  WorkCallType,
  ProjectStatus,
} from "./types";
import { Modal } from "@/app/components/board/ui/Modal";
import type { TabKey } from "@/app/components/board/ui/TabPills";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function CreateButtons({
  tab,
  state,
  onChange,
}: {
  tab: TabKey;
  state: WorkState;
  onChange: (next: WorkState) => void;
}) {
  const [open, setOpen] = useState<null | "asset" | "call" | "project">(null);

  const buttonLabel =
    tab === "assets"
      ? "+ Add Asset"
      : tab === "calls"
        ? "+ Post Work Call"
        : "+ Create Project";

  const openKey =
    tab === "assets" ? "asset" : tab === "calls" ? "call" : "project";

  return (
    <div className="flex justify-end">
      <button
        onClick={() => setOpen(openKey)}
        className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:opacity-90"
      >
        {buttonLabel}
      </button>

      <CreateAssetModal
        open={open === "asset"}
        onClose={() => setOpen(null)}
        state={state}
        onChange={onChange}
      />
      <CreateCallModal
        open={open === "call"}
        onClose={() => setOpen(null)}
        state={state}
        onChange={onChange}
      />
      <CreateProjectModal
        open={open === "project"}
        onClose={() => setOpen(null)}
        state={state}
        onChange={onChange}
      />
    </div>
  );
}

function CreateAssetModal({
  open,
  onClose,
  state,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  state: WorkState;
  onChange: (next: WorkState) => void;
}) {
  const [type, setType] = useState<AssetType>("Headshot");
  const [visibility, setVisibility] = useState<Visibility>("Public");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");

  const canSave = useMemo(() => !!title.trim() && !!url.trim(), [title, url]);

  const save = () => {
    if (!canSave) return;

    onChange({
      ...state,
      assets: [
        {
          id: newId("asset"),
          type,
          title: title.trim(),
          url: url.trim(),
          visibility,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          createdAt: Date.now(),
        },
        ...(state.assets ?? []),
      ],
    });

    setTitle("");
    setUrl("");
    setTags("");
    onClose();
  };

  return (
    <Modal open={open} title="Add Asset" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-white/70">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AssetType)}
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            >
              <option>Headshot</option>
              <option>Resume</option>
              <option>Demo Reel</option>
              <option>Photo</option>
              <option>Video</option>
              <option>Music</option>
              <option>Link</option>
              <option>Document</option>
            </select>
          </label>

          <label className="text-xs text-white/70">
            Visibility
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            >
              <option>Public</option>
              <option>Friends</option>
              <option>Private</option>
            </select>
          </label>
        </div>

        <label className="block text-xs text-white/70">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="e.g., Headshot: Commercial"
          />
        </label>

        <label className="block text-xs text-white/70">
          Link / URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="YouTube / Drive / SoundCloud / portfolio..."
          />
        </label>

        <label className="block text-xs text-white/70">
          Tags (comma-separated)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="Actor, Model, NYC"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/70 ring-1 ring-white/10 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={save}
            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CreateCallModal({
  open,
  onClose,
  state,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  state: WorkState;
  onChange: (next: WorkState) => void;
}) {
  const [type, setType] = useState<WorkCallType>("Audition");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [paid, setPaid] = useState(false);
  const [remote, setRemote] = useState(true);
  const [link, setLink] = useState("");
  const [tags, setTags] = useState("");

  const canSave = useMemo(
    () => !!title.trim() && !!description.trim(),
    [title, description]
  );

  const save = () => {
    if (!canSave) return;

    onChange({
      ...state,
      calls: [
        {
          id: newId("call"),
          type,
          title: title.trim(),
          description: description.trim(),
          deadline: deadline || undefined,
          paid,
          remote,
          link: link.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          createdAt: Date.now(),
        },
        ...(state.calls ?? []),
      ],
    });

    setTitle("");
    setDescription("");
    setDeadline("");
    setPaid(false);
    setRemote(true);
    setLink("");
    setTags("");
    onClose();
  };

  return (
    <Modal open={open} title="Post Work Call" onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs text-white/70">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WorkCallType)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
          >
            <option>Audition</option>
            <option>Casting Call</option>
            <option>Crew Call</option>
            <option>Gig</option>
            <option>Collaboration</option>
          </select>
        </label>

        <label className="block text-xs text-white/70">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="e.g., Casting: Music Video Lead"
          />
        </label>

        <label className="block text-xs text-white/70">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 min-h-[110px] w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="What are you looking for? What should people submit?"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-white/70">
            Deadline (optional)
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            />
          </label>

          <label className="text-xs text-white/70">
            Response Link (optional)
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
              placeholder="Application / contact link"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
            />
            Paid
          </label>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
            />
            Remote
          </label>
        </div>

        <label className="block text-xs text-white/70">
          Tags (comma-separated)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="Film, NYC, Producer"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/70 ring-1 ring-white/10 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={save}
            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CreateProjectModal({
  open,
  onClose,
  state,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  state: WorkState;
  onChange: (next: WorkState) => void;
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("Idea");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const canSave = useMemo(() => title.trim().length > 2, [title]);

  const save = () => {
    if (!canSave) return;

    onChange({
      ...state,
      projects: [
        {
          id: newId("proj"),
          title: title.trim(),
          status,
          description: description.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          createdAt: Date.now(),
        },
        ...(state.projects ?? []),
      ],
    });

    setTitle("");
    setStatus("Idea");
    setDescription("");
    setTags("");
    onClose();
  };

  return (
    <Modal open={open} title="Create Project" onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs text-white/70">
          Project Name
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="e.g., Short Film Crew"
          />
        </label>

        <label className="block text-xs text-white/70">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
          >
            <option>Idea</option>
            <option>Planning</option>
            <option>In Progress</option>
            <option>Paused</option>
            <option>Complete</option>
          </select>
        </label>

        <label className="block text-xs text-white/70">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 min-h-[110px] w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="What is this project? Who should join?"
          />
        </label>

        <label className="block text-xs text-white/70">
          Tags (comma-separated)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 outline-none"
            placeholder="Film, Music, NYC"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/70 ring-1 ring-white/10 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={save}
            className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}