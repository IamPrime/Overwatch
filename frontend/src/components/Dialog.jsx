import { useEffect, useRef } from 'react';

// A native <dialog> opened with showModal(), which gives focus trapping, Escape to close and
// aria-modal for free. `open` is controlled by the parent; Escape, a click on the backdrop and
// the browser's own close all report back through onClose.
export function Dialog({ open, onClose, className = '', children, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // jsdom (tests) doesn't implement showModal.
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (dialog.close) dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click whose target is the <dialog> itself landed on the backdrop, outside the content.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`bg-surface text-ink backdrop:bg-[rgb(10_0_20/0.6)] ${className}`}
      {...props}
    >
      {open && children}
    </dialog>
  );
}
