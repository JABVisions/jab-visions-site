"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
};

type State = {
  error: Error | null;
};

/**
 * Keeps a single throwing card/widget from replacing the whole Board route
 * with Next.js's "Application error: a client-side exception has occurred".
 */
export default class BoardClientErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[Board] ${this.props.name || "client"} crashed`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div
        style={{
          margin: "12px 0",
          padding: "16px 18px",
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.72)",
          color: "rgba(0,0,0,0.62)",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        This piece of the Board could not be shown. Everything else is still live.
      </div>
    );
  }
}
