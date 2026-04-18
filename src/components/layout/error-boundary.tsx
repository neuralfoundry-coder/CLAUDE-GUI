'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorReport {
  error: Error;
  errorInfo: ErrorInfo;
  scope: string;
  timestamp: number;
}

type ErrorSink = (report: ErrorReport) => void;

const sinks = new Set<ErrorSink>();

export function registerErrorSink(sink: ErrorSink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

function emit(report: ErrorReport): void {
  for (const sink of sinks) {
    try { sink(report); } catch { /* sink must not throw back */ }
  }
  if (typeof console !== 'undefined') {
    console.error(`[ErrorBoundary:${report.scope}]`, report.error, report.errorInfo.componentStack);
  }
}

interface ErrorBoundaryProps {
  scope: string;
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    emit({ error, errorInfo, scope: this.props.scope, timestamp: Date.now() });
  }

  reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return <DefaultFallback scope={this.props.scope} error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

interface PanelErrorBoundaryProps {
  panelType: string;
  children: ReactNode;
  onReset?: () => void;
}

export function PanelErrorBoundary({ panelType, children, onReset }: PanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      scope={`panel:${panelType}`}
      onReset={onReset}
      fallback={(error, reset) => <PanelFallback panelType={panelType} error={error} onReset={reset} />}
    >
      {children}
    </ErrorBoundary>
  );
}

function DefaultFallback({ scope, error, onReset }: { scope: string; error: Error; onReset: () => void }) {
  return (
    <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-sm">
      <div className="font-medium">Something went wrong in {scope}</div>
      <pre className="max-w-full overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">{error.message}</pre>
      <button
        type="button"
        onClick={onReset}
        className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
      >
        Retry
      </button>
    </div>
  );
}

function PanelFallback({ panelType, error, onReset }: { panelType: string; error: Error; onReset: () => void }) {
  return (
    <div
      role="alert"
      data-testid={`panel-error-${panelType}`}
      className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-4 text-sm"
    >
      <div className="font-medium text-destructive">Panel crashed: {panelType}</div>
      <pre className="max-h-40 max-w-full overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
        {error.message}
      </pre>
      <button
        type="button"
        onClick={onReset}
        className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
      >
        Retry panel
      </button>
    </div>
  );
}
