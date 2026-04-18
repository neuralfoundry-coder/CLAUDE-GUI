import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, PanelErrorBoundary, registerErrorSink } from '@/components/layout/error-boundary';

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary scope="test">
        <div>ok</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('renders default fallback when child throws', () => {
    render(
      <ErrorBoundary scope="test">
        <Boom message="boom-default" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/boom-default/)).toBeInTheDocument();
  });

  it('renders custom fallback and resets on click', () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('flaky');
      return <div>recovered</div>;
    }
    render(
      <ErrorBoundary
        scope="test"
        fallback={(err, reset) => (
          <button onClick={() => { shouldThrow = false; reset(); }}>{`retry:${err.message}`}</button>
        )}
      >
        <Flaky />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText('retry:flaky'));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('reports to registered sinks with scope', () => {
    const sink = vi.fn();
    const unregister = registerErrorSink(sink);
    render(
      <ErrorBoundary scope="scope-xyz">
        <Boom message="reported" />
      </ErrorBoundary>,
    );
    expect(sink).toHaveBeenCalledTimes(1);
    const report = sink.mock.calls[0]![0];
    expect(report.scope).toBe('scope-xyz');
    expect(report.error.message).toBe('reported');
    expect(typeof report.timestamp).toBe('number');
    unregister();
  });

  it('continues reporting to other sinks even if one throws', () => {
    const bad = vi.fn(() => { throw new Error('sink-fail'); });
    const good = vi.fn();
    const u1 = registerErrorSink(bad);
    const u2 = registerErrorSink(good);
    render(
      <ErrorBoundary scope="test">
        <Boom />
      </ErrorBoundary>,
    );
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    u1(); u2();
  });
});

describe('PanelErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows panel-scoped fallback with testid', () => {
    render(
      <PanelErrorBoundary panelType="editor">
        <Boom message="panel-boom" />
      </PanelErrorBoundary>,
    );
    expect(screen.getByTestId('panel-error-editor')).toBeInTheDocument();
    expect(screen.getByText(/Panel crashed: editor/)).toBeInTheDocument();
    expect(screen.getByText(/panel-boom/)).toBeInTheDocument();
  });

  it('retry button resets the boundary', () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('flaky-panel');
      return <div>panel-ok</div>;
    }
    render(
      <PanelErrorBoundary panelType="terminal">
        <Flaky />
      </PanelErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /retry panel/i }));
    expect(screen.getByText('panel-ok')).toBeInTheDocument();
  });
});
