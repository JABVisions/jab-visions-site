"use client";

import {
  Component,
  lazy,
  Suspense,
  useEffect,
  type ComponentProps,
  type ReactNode,
} from "react";
import type DropStudioStage from "./DropStudioStage";

const DropStudioStageLazy = lazy(() => import("./DropStudioStage"));

type DropStudioStageProps = ComponentProps<typeof DropStudioStage>;

class DropStudioChunkErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100060,
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "rgba(6, 10, 16, 0.82)",
            color: "#eef9ff",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              maxWidth: 360,
              borderRadius: 18,
              border: "1px solid rgba(255, 255, 255, 0.18)",
              background: "rgba(9, 13, 19, 0.92)",
              padding: "18px 20px",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Drop Studio couldn&apos;t load</div>
            <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 14 }}>
              Try again — no full rebuild needed.
            </div>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(126, 226, 255, 0.45)",
                background: "rgba(126, 226, 255, 0.14)",
                color: "#eef9ff",
                fontWeight: 800,
                padding: "9px 16px",
                cursor: "pointer",
              }}
            >
              Retry Drop Studio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DropStudioLoading() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100050,
        display: "grid",
        placeItems: "center",
        background: "rgba(6, 10, 16, 0.55)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          padding: "12px 18px",
          borderRadius: 999,
          border: "1px solid rgba(126, 226, 255, 0.35)",
          background: "rgba(9, 13, 19, 0.88)",
          color: "rgba(236, 255, 251, 0.9)",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Opening Drop Studio…
      </div>
    </div>
  );
}

/** Mount Drop Studio only while open — lazy chunk avoids loading the stage on every Board page. */
export default function LazyDropStudioStage({ open, onClose, ...rest }: DropStudioStageProps) {
  // Always release the page scroll when the studio closes or unmounts abruptly
  // (e.g. save + close without running DropStudioStage's close handler).
  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow || "";
    };
  }, [open]);

  if (!open) return null;
  return (
    <DropStudioChunkErrorBoundary onReset={onClose}>
      <Suspense fallback={<DropStudioLoading />}>
        <DropStudioStageLazy open onClose={onClose} {...rest} />
      </Suspense>
    </DropStudioChunkErrorBoundary>
  );
}
