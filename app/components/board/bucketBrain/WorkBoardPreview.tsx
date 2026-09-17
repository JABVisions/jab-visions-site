"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./workBoardPreview.module.css";
import type { WorkBoardEntity } from "@/lib/board/brain/response";
import {
  creatorFromWorkBoardEntity,
  defaultWorkBoardSection,
  fetchWorkBoardPreview,
  type WorkBoardLibraryDrop,
  type WorkBoardPreviewCreator,
  type WorkBoardPreviewParams,
  type WorkBoardSection,
} from "@/lib/board/brain/workBoardPreview";
import WorkBoardDropGrid from "./WorkBoardDropGrid";
import WorkBoardDropViewer from "./WorkBoardDropViewer";
import WorkBoardPreviewHeader from "./WorkBoardPreviewHeader";
import WorkBoardPreviewNavigation from "./WorkBoardPreviewNavigation";

export default function WorkBoardPreview({
  board,
  params,
  onClose,
}: {
  board: WorkBoardEntity;
  params?: Omit<WorkBoardPreviewParams, "username" | "creatorId">;
  onClose: () => void;
}) {
  const seedCreator = useMemo(() => creatorFromWorkBoardEntity(board), [board]);
  const [creator, setCreator] = useState<WorkBoardPreviewCreator>(seedCreator);
  const [assets, setAssets] = useState<WorkBoardLibraryDrop[]>([]);
  const [portfolio, setPortfolio] = useState<WorkBoardLibraryDrop[]>([]);
  const [section, setSection] = useState<WorkBoardSection>(params?.initialSection || "portfolio");
  const [status, setStatus] = useState("Opening Work Board…");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<WorkBoardLibraryDrop | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("Opening Work Board…");
    setError("");
    setSelected(null);

    void fetchWorkBoardPreview(board.username, {
      creatorId: board.id,
      initialSection: params?.initialSection,
      selectedDropId: params?.selectedDropId,
      filters: params?.filters,
    }, controller.signal)
      .then((data) => {
        setCreator(data.creator);
        setAssets(data.assets);
        setPortfolio(data.portfolio);
        const nextSection = defaultWorkBoardSection(
          data.portfolio,
          data.assets,
          params?.initialSection || data.defaultSection
        );
        setSection(nextSection);
        setStatus(nextSection === "assets" ? "Loading Assets…" : "Loading Portfolio…");
        const wantedId = params?.selectedDropId;
        const match = wantedId
          ? [...data.portfolio, ...data.assets].find((drop) => drop.id === wantedId)
          : null;
        if (match) {
          setSection(match.section);
          setSelected(match);
        }
        window.setTimeout(() => {
          if (!controller.signal.aborted) setStatus("");
        }, 220);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "That Work Board could not be opened.");
        setStatus("");
      });

    return () => controller.abort();
  }, [board.id, board.username, params?.filters, params?.initialSection, params?.selectedDropId]);

  const drops = section === "assets" ? assets : portfolio;
  const emptyCopy =
    section === "assets" ? "No public assets available." : "No portfolio work has been added yet.";

  return (
    <div className={styles.preview}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.back} onClick={onClose}>
          Back
        </button>
        <Link className={styles.full} href={creator.href || board.href}>
          View Full Work Board
        </Link>
      </div>

      <WorkBoardPreviewHeader creator={creator} />
      <div className={styles.status} aria-live="polite">
        {error || status}
      </div>
      <WorkBoardPreviewNavigation section={section} onChange={setSection} />
      <WorkBoardDropGrid
        drops={drops}
        section={section}
        emptyCopy={status ? "Opening Work Board…" : emptyCopy}
        onOpen={setSelected}
      />
      {selected ? <WorkBoardDropViewer drop={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
