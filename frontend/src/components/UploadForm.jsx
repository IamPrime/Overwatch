import { useEffect, useRef, useState } from 'react';
import { detectFood, fetchNutritionImage } from '../lib/api';
import { NutritionResult } from './NutritionResult';
import { Lightbox } from './Lightbox';

const LOADER_SRC = 'https://s3.amazonaws.com/static.mlh.io/icons/loading.svg';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split('base64,')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function UploadForm({ token, onUsageChange }) {
  const fileInputRef = useRef(null);
  const previousBlobUrl = useRef(null);

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

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (file) setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleAnalyse() {
    const file = fileInputRef.current?.files?.[0];
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
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} />
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
