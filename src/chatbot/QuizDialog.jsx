import { useEffect, useRef } from 'react';

export default function QuizDialog({ children, onCancel, returnFocusRef, labelledBy, label, active = false }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus = returnFocusRef.current;
    dialog.showModal();
    dialog.querySelector('input[type="text"]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocusRef]);

  return (
    <dialog ref={dialogRef} className="pedro-quiz-dialog" aria-labelledby={labelledBy} aria-label={label}
      style={{ '--pedro-quiz-backdrop': active ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.7)' }}
      onCancel={event => { event.preventDefault(); onCancel(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll('button, input, select, textarea, [tabindex]')]
          .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}>
      {children}
    </dialog>
  );
}
