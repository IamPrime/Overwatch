import { useEffect, useRef, useState } from 'react';
import { detectFood, detectFoodFromText, fetchNutritionImage } from '../lib/api';
import { FriendlyError, friendlyMessage } from '../lib/errors';
import { isMobileDevice } from '../hooks/useDeviceType';
import { NutritionResult } from './NutritionResult';
import { Lightbox } from './Lightbox';
import { DescribeFood } from './DescribeFood';

// Shown when identifying fails in a way the server or this app didn't describe itself.
const IDENTIFY_FAILED = 'Something went wrong identifying your food - please try again.';

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
    // The error event has no message of its own (an unreadable file, or a format this browser
    // can't open, like HEIC on some desktops).
    reader.onerror = () => reject(new FriendlyError("Couldn't read that photo - try a different one, or save it as a JPEG or PNG."));
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
  // A photo detection waiting for the user to confirm or edit it before it's sent to Wolfram -
  // detection itself is free, so a wrong guess never uses up a daily lookup. '' means detection
  // failed and the user is asked to describe the food instead. confirmId re-mounts the confirm box
  // (resetting its text) for each new detection.
  const [pendingTag, setPendingTag] = useState(null);
  // The server's signature for pendingTag - confirming it unchanged reuses this, since the
  // nutrition lookup only accepts tags the detect routes signed.
  const pendingTagToken = useRef(null);
  const [confirmId, setConfirmId] = useState(0);

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

  // Shared second half of every lookup (confirmed photo or description): turn a food tag into
  // the Wolfram nutrition image.
  async function lookupNutrition(detectedTag, tagToken) {
    setTag(detectedTag);

    try {
      const { blobUrl: nextBlobUrl, usage } = await fetchNutritionImage(detectedTag, tagToken, token);
      if (previousBlobUrl.current) URL.revokeObjectURL(previousBlobUrl.current);
      previousBlobUrl.current = nextBlobUrl;
      setBlobUrl(nextBlobUrl);
      if (usage) onUsageChange(usage);
    } catch (nutritionError) {
      const message = friendlyMessage(nutritionError, 'Something went wrong looking up the nutrition facts - please try again.');
      setError(nutritionError.status === 429 ? `${message} See Settings below.` : message);
      if (nutritionError.usage) onUsageChange(nutritionError.usage);
    }
  }

  function resetResult() {
    setTag(null);
    setBlobUrl(null);
    setError(null);
    setPendingTag(null);
  }

  async function runLookup(detect) {
    setLoading(true);
    resetResult();

    try {
      const { tag: detectedTag, tagToken } = await detect();
      await lookupNutrition(detectedTag, tagToken);
    } catch (detectError) {
      setError(friendlyMessage(detectError, IDENTIFY_FAILED));
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyse() {
    const file = selectedFile;
    if (!file) {
      alert('No file selected!');
      return;
    }

    setLoading(true);
    resetResult();
    setConfirmId((id) => id + 1);

    try {
      const { tag: detectedTag, tagToken } = await detectFood(await fileToBase64(file), token);
      pendingTagToken.current = tagToken;
      setPendingTag(detectedTag);
    } catch (detectError) {
      setError(friendlyMessage(detectError, IDENTIFY_FAILED));
      setPendingTag('');
    } finally {
      setLoading(false);
    }
  }

  // Confirming the photo detection as-is goes straight to Wolfram; an edited or added-to name
  // ("actually it's shawarma", "2 slices of pizza") is normalized by the text path first.
  function handleConfirm(text) {
    const detectedTag = pendingTag;
    const tagToken = pendingTagToken.current;
    runLookup(
      text === detectedTag
        ? async () => ({ tag: detectedTag, tagToken })
        : () => detectFoodFromText(text, token),
    );
  }

  // Describing food from scratch - drop any previous photo so the left panel doesn't show a
  // picture of something else next to the result.
  function handleDescribe(text) {
    setSelectedFile(null);
    setPreviewUrl(null);
    runLookup(() => detectFoodFromText(text, token));
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

      <p className="describe-food-divider">or describe what you're eating</p>
      <DescribeFood
        token={token}
        onSubmit={handleDescribe}
        disabled={loading}
        placeholder='e.g. "chicken caesar salad"'
      />

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
            {!loading && pendingTag !== null && (
              <div className="confirm-food">
                <p>{error ? `${error} Describe it instead:` : 'Looks like:'}</p>
                <DescribeFood
                  token={token}
                  key={confirmId}
                  initialValue={pendingTag}
                  onSubmit={handleConfirm}
                  placeholder="Describe the food in the photo"
                  submitLabel="Look up nutrition"
                />
                <p className="confirm-food-hint">Not right? Edit it first, or add an amount like "2 slices".</p>
              </div>
            )}
            {!loading && pendingTag === null && (
              <NutritionResult tag={tag} blobUrl={blobUrl} error={error} onEnlarge={setLightboxSrc} />
            )}
          </div>
        </div>
      </div>

      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
}
