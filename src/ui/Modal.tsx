import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Shared dismissible dialog: visible close button, tap outside, Escape. Escape is captured so it
 * closes only the top-most modal and never also toggles the pause menu underneath.
 */
export function Modal({
  onClose,
  onConfirm,
  label,
  className = '',
  children,
}: {
  onClose: () => void;
  /** Enter key (desktop): confirm / continue. Text fields and focused buttons keep their own Enter. */
  onConfirm?: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Keep the latest close handler in a ref so the effect below runs once per mount. (It used to
  // re-run on every render — callers pass inline closures — and its focus() call stole focus from
  // text fields after each keystroke.)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  useEffect(() => {
    // Focus the dialog once on open, unless something inside it already has focus.
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
  }, []);
  useEffect(() => {
    const opened = performance.now();
    const onKey = (e: KeyboardEvent) => {
      const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
      if (e.code !== 'Escape' && !enter) return;
      // Only the last-opened modal reacts.
      const all = document.querySelectorAll('.modal-backdrop');
      if (all[all.length - 1] !== box.current?.parentElement) return;
      if (enter) {
        const t = e.target as HTMLElement | null;
        // Let forms and focused buttons handle Enter natively (no double firing); ignore key
        // repeat and the keypress that opened this dialog.
        if (!confirmRef.current || e.repeat || performance.now() - opened < 250) return;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SELECT')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmRef.current();
        return;
      }
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
