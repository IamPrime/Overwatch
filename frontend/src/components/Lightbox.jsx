import { Dialog } from './Dialog';
import { CloseIcon } from './icons';

// Enlarged nutrition-facts image. Escape, the close button or a click anywhere closes it.
export function Lightbox({ src, onClose }) {
  return (
    <Dialog
      open={Boolean(src)}
      onClose={onClose}
      aria-label="Nutrition facts, enlarged"
      className="m-auto max-h-[95dvh] max-w-[95vw] cursor-zoom-out overflow-auto rounded-md bg-white p-0"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-10 cursor-pointer place-items-center rounded-full bg-black/70 text-white"
      >
        <CloseIcon className="size-5" />
      </button>
      <img src={src} alt="Nutrition facts, enlarged" onClick={onClose} className="block max-w-[95vw]" />
    </Dialog>
  );
}
