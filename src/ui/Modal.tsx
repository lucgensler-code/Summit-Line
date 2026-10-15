import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Shared dismissible dialog: visible close button, tap outside, Escape. Escape is captured so it
 * closes only the top-most modal and never also toggles the pause menu underneath.
 */
export function Modal({ onClose, label, className = '', children }: { onClose: () => void; label: string; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      // Only the last-opened modal reacts.
      const all = document.querySelectorAll('.modal-backdrop');
      if (all[all.length - 1] !== box.current?.parentElement) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    box.current?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
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
