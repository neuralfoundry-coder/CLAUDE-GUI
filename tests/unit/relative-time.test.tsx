import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RelativeTime } from '@/components/ui/relative-time';

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders fallback when timestamp is null', () => {
    render(<RelativeTime timestamp={null} />);
    expect(screen.getByText('never')).toBeInTheDocument();
  });

  it('renders custom fallback', () => {
    render(<RelativeTime timestamp={null} fallback="no data" />);
    expect(screen.getByText('no data')).toBeInTheDocument();
  });

  it('renders "just now" for very recent timestamps', () => {
    const now = Date.now();
    render(<RelativeTime timestamp={now - 500} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('renders seconds ago for sub-minute deltas', () => {
    const now = Date.now();
    render(<RelativeTime timestamp={now - 15_000} />);
    expect(screen.getByText('15s ago')).toBeInTheDocument();
  });

  it('renders minutes ago for sub-hour deltas', () => {
    const now = Date.now();
    render(<RelativeTime timestamp={now - 125_000} />);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });

  it('renders hours ago past the hour mark', () => {
    const now = Date.now();
    render(<RelativeTime timestamp={now - 2 * 3600_000} />);
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('ticks forward as real time advances', () => {
    const now = Date.now();
    render(<RelativeTime timestamp={now - 5000} />);
    expect(screen.getByText('5s ago')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('8s ago')).toBeInTheDocument();
  });
});
