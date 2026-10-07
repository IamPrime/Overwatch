// Wolfram's image comes back 800px wide and often very tall (see server.js). It's shown at the
// card's full width - shrinking it to fit made the text unreadable - inside a fixed-height window
// that scrolls, so a long result doesn't stretch the page. Clicking it opens the full-screen view
// (Lightbox). The image has its own light background, so it's shown as-is in light and dark mode.
export function NutritionResult({ tag, blobUrl, onEnlarge }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 text-lg font-extrabold first-letter:uppercase lg:text-xl">{tag}</h3>
        {blobUrl && (
          <span className="text-xs whitespace-nowrap text-sub">
            <span className="lg:hidden">Tap</span>
            <span className="hidden lg:inline">Click</span> to enlarge
          </span>
        )}
      </div>
      {blobUrl && (
        <div className="h-[min(55dvh,26rem)] overflow-y-auto overscroll-contain rounded-md bg-white">
          <button
            type="button"
            className="block w-full cursor-zoom-in"
            onClick={() => onEnlarge(blobUrl)}
            aria-label="Enlarge nutrition facts"
          >
            <img src={blobUrl} alt={`Nutrition facts for ${tag}`} className="block w-full" />
          </button>
        </div>
      )}
    </div>
  );
}
