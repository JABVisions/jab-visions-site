"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
  resetLabel?: string;
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
    const retry = this.props.resetLabel ? (
      <button
        type="button"
        onClick={() => this.setState({ error: null })}
        style={{
          marginTop: 12,
          borderRadius: 999,
          border: "1px solid rgba(126, 226, 255, 0.45)",
          background: "rgba(126, 226, 255, 0.14)",
          color: "inherit",
          fontWeight: 800,
          padding: "8px 14px",
          cursor: "pointer",
        }}
      >
        {this.props.resetLabel}
      </button>
    ) : null;
    if (this.props.fallback) {
      return (
        <>
          {this.props.fallback}
          {retry}
        </>
      );
    }
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
        {retry}
      </div>
    );
  }
}
