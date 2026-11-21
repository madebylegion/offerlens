// Inline SVG icons (stroke = currentColor). Decorative by default.
const svg = (d: string) =>
  `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icon = {
  bolt: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>'),
  cloud: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7Z"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  wifiOff: svg('<path d="m2 2 20 20"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M10.7 5.1A15 15 0 0 1 22 8.8"/><path d="M5 12.9a10 10 0 0 1 3.2-2"/><path d="M12 20h.01"/>'),
  wifi: svg('<path d="M5 12.9a10 10 0 0 1 14 0"/><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  send: svg('<path d="m22 2-7 20-4-9-9-4 20-7Z"/>'),
  download: svg('<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  alert: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>'),
};

/** The OfferLens mark: a lens ring with one on-device chip inside. */
export const logo = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="15" cy="15" r="10" fill="none" stroke="#121a17" stroke-width="3"/><path d="m23 23 6 6" stroke="#121a17" stroke-width="3" stroke-linecap="round"/><path d="M16.5 8.5 11 16h4l-1 5.5L19.5 14h-4l1-5.5Z" fill="#0a6b47"/></svg>`;
