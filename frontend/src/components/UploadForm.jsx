import { useEffect, useRef, useState } from 'react';
import { detectFood, fetchNutritionImage } from '../lib/api';
import { isMobileDevice } from '../hooks/useDeviceType';
import { NutritionResult } from './NutritionResult';
import { Lightbox } from './Lightbox';

const LOADER_SRC = 'https://s3.amazonaws.com/static.mlh.io/icons/loading.svg';

// Inline SVG (same approach as AuthPanel's Eye/EyeOff icons) rather than an icon font/library
// dependency for a two-icon need.
function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split('base64,')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function UploadForm({ token, onUsageChange }) {
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);
  const previousBlobUrl = useRef(null);

  // Lazy-initialized once - whether this is a mobile/touch device doesn't change mid-session,
  // so there's no need to re-run the check on every render.
  const [showTakePhoto] = useState(isMobileDevice);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tag, setTag] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Revoke the nutrition-image blob URL whenever it's replaced or the component unmounts,
  // so repeated lookups in one session don't leak blob URLs.
  useEffect(() => {
    return () => {
      if (previousBlobUrl.current) URL.revokeObjectURL(previousBlobUrl.current);
    };
  }, []);

  // Shared handler for both the "Take Photo" (capture) and "Choose from Library" (plain)
  // inputs below - either one lands here with the chosen file. Resetting event.target.value
  // afterwards means picking the same file twice in a row (e.g. retaking an identical shot)
  // still fires this handler the second time.
  function handleFileChange(event) {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
    event.target.value = '';
  }

  async function handleAnalyse() {
    const file = selectedFile;
    if (!file) {
      alert('No file selected!');
      return;
    }

    setLoading(true);
    setTag(null);
    setBlobUrl(null);
    setError(null);

    try {
      const base64 = await fileToBase64(file);
      const { tag: detectedTag } = await detectFood(base64, token);
      setTag(detectedTag);

      try {
        const { blobUrl: nextBlobUrl, usage } = await fetchNutritionImage(detectedTag, token);
        if (previousBlobUrl.current) URL.revokeObjectURL(previousBlobUrl.current);
        previousBlobUrl.current = nextBlobUrl;
        setBlobUrl(nextBlobUrl);
        if (usage) onUsageChange(usage);
      } catch (nutritionError) {
        setError(
          nutritionError.status === 429
            ? `${nutritionError.message} See Settings below.`
            : nutritionError.message,
        );
        if (nutritionError.usage) onUsageChange(nutritionError.usage);
      }
    } catch (detectError) {
      setError(detectError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={(event) => event.preventDefault()}>
        {showTakePhoto && (
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            onChange={handleFileChange}
            className="file-input-hidden"
          />
        )}
        <input
          type="file"
          accept="image/*"
          ref={libraryInputRef}
          onChange={handleFileChange}
          className="file-input-hidden"
        />
        <div className="photo-source-buttons">
          {showTakePhoto && (
            <button type="button" className="photo-source-button" onClick={() => cameraInputRef.current?.click()}>
              <CameraIcon /> Take Photo
            </button>
          )}
          <button type="button" className="photo-source-button" onClick={() => libraryInputRef.current?.click()}>
            <LibraryIcon /> Choose from Library
          </button>
        </div>
        <button type="button" onClick={handleAnalyse} disabled={loading}>
          Analyse My Nutrition!!
        </button>
      </form>

      <div id="predictions">
        <div className="food-photo" style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}>
          {!previewUrl && (
            <div className="step">
              <span>1</span> Upload a Photo
            </div>
          )}
        </div>
        <div className="nutrition">
          <div className="step">
            <span>2</span> Nutrition Analysis
          </div>
          <div id="concepts">
            {loading && <img src={LOADER_SRC} className="loading" alt="Loading" />}
            {!loading && <NutritionResult tag={tag} blobUrl={blobUrl} error={error} onEnlarge={setLightboxSrc} />}
          </div>
        </div>
      </div>

      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
}
