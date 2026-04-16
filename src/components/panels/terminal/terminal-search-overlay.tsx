'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { terminalManager } from '@/lib/terminal/terminal-registry';

interface TerminalSearchOverlayProps {
  sessionId: string;
  onClose: () => void;
}

export function TerminalSearchOverlay({ sessionId, onClose }: TerminalSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!query) {
      terminalManager.clearSearchHighlight(sessionId);
      return;
    }
    const handle = window.setTimeout(() => {
      terminalManager.findNext(sessionId, query, {
        caseSensitive,
        wholeWord,
        regex,
        incremental: true,
      });
    }, 100);
    return () => window.clearTimeout(handle);
  }, [sessionId, query, caseSensitive, wholeWord, regex]);

  const handleClose = () => {
    terminalManager.clearSearchHighlight(sessionId);
    onClose();
    terminalManager.activate(sessionId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }
    // Skip while IME composition is active — the first Enter commits the
    // composition; acting on it would drop/duplicate the last CJK character.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        terminalManager.findPrevious(sessionId, query, {
          caseSensitive,
          wholeWord,
          regex,
        });
      } else {
        terminalManager.findNext(sessionId, query, {
          caseSensitive,
          wholeWord,
          regex,
        });
      }
    }
  };

  return (
    <div
      className="pointer-events-auto absolute right-2 top-2 flex items-center gap-1 rounded-md border bg-popover/95 px-2 py-1 shadow-lg backdrop-blur"
      role="search"
      aria-label="Terminal search"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in terminal"
        className="h-6 w-48 bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
        aria-label="Search query"
      />
      <button
        type="button"
        onClick={() => setCaseSensitive((v) => !v)}
        aria-pressed={caseSensitive}
        title="Match case (Aa)"
        className={cn(
          'rounded px-1 text-[10px] font-semibold hover:bg-muted-foreground/10',
          caseSensitive && 'bg-muted-foreground/20 text-foreground',
        )}
      >
        Aa
      </button>
      <button
        type="button"
        onClick={() => setWholeWord((v) => !v)}
        aria-pressed={wholeWord}
        title="Whole word (W)"
        className={cn(
          'rounded px-1 text-[10px] font-semibold hover:bg-muted-foreground/10',
          wholeWord && 'bg-muted-foreground/20 text-foreground',
        )}
      >
        W
      </button>
      <button
        type="button"
        onClick={() => setRegex((v) => !v)}
        aria-pressed={regex}
        title="Regex (.*)"
        className={cn(
          'rounded px-1 text-[10px] font-semibold hover:bg-muted-foreground/10',
          regex && 'bg-muted-foreground/20 text-foreground',
        )}
      >
        .*
      </button>
      <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        onClick={() =>
          terminalManager.findPrevious(sessionId, query, { caseSensitive, wholeWord, regex })
        }
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        className="rounded p-0.5 hover:bg-muted-foreground/10"
      >
        <ChevronUp className="h-3 w-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() =>
          terminalManager.findNext(sessionId, query, { caseSensitive, wholeWord, regex })
        }
        title="Next match (Enter)"
        aria-label="Next match"
        className="rounded p-0.5 hover:bg-muted-foreground/10"
      >
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={handleClose}
        title="Close (Esc)"
        aria-label="Close search"
        className="rounded p-0.5 hover:bg-muted-foreground/10"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
