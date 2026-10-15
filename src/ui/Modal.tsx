import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Shared dismissible dialog: visible close button, tap outside, Escape. Escape is captured so it
 * closes only the top-most modal and never also toggles the pause menu underneath.
 */
export function Modal({ onClose, label, className = '', children }: { onClose: () => void; label: string; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // Keep the latest close handler in a ref so the effect below runs once per mount. (It used to
  // re-run on every render — callers pass inline closures — and its focus() call stole focus from
  // text fields after each keystroke.)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Focus the dialog once on open, unless something inside it already has focus.
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      // Only the last-opened modal reacts.
      const all = document.querySelectorAll('.modal-backdrop');
      if (all[all.length - 1] !== box.current?.parentElement) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className="icon-btn close modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
