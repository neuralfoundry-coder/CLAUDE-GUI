'use client';

export function openPrintPdf(): void {
  const url = '/reveal-host.html?print-pdf';
  window.open(url, '_blank', 'noopener');
}
