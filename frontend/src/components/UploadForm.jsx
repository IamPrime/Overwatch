import { useEffect, useRef, useState } from 'react';
import { detectFood, detectFoodFromText, fetchNutritionImage } from '../lib/api';
import { FriendlyError, friendlyMessage } from '../lib/errors';
import { isMobileDevice } from '../hooks/useDeviceType';
import { NutritionResult } from './NutritionResult';
import { Lightbox } from './Lightbox';
import { DescribeFood } from './DescribeFood';
import { Button, Card, LinkButton, OrDivider, Spinner } from './ui';
import { CameraIcon, ImageIcon, PlusIcon, UploadIcon } from './icons';

// Shown when identifying fails in a way the server or this app didn't describe itself.
const IDENTIFY_FAILED = 'Something went wrong identifying your food - please try again.';

const LOADING_LABELS = {
  identify: 'Identifying your food…',
  lookup: 'Looking up the nutrition facts…',
};

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

export function UploadForm({ token, onUsageChange, onOpenSettings }) {
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);
  const previousBlobUrl = useRef(null);

  // Lazy-initialized once - whether this is a mobile/touch device doesn't change mid-session,
  // so there's no need to re-run the check on every render.
  const [showTakePhoto] = useState(isMobileDevice);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  // null, or which half of a lookup is running: 'identify' (detect routes) or 'lookup' (Wolfram).
  const [loading, setLoading] = useState(null);
  const [tag, setTag] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(null);
  // 429 = today's free lookups are used up, which gets a shortcut to Settings.
  const [errorStatus, setErrorStatus] = useState(null);
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

  // Picking a new photo starts a new lookup, replacing any result still on screen.
  function pickFile(file) {
    if (!file) return;
    resetResult();
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  // Shared handler for both the "Take photo" (capture) and library inputs below - either one
  // lands here with the chosen file. Resetting event.target.value afterwards means picking the
  // same file twice in a row (e.g. retaking an identical shot) still fires this handler again.
  function handleFileChange(event) {
    pickFile(event.target.files[0]);
    event.target.value = '';
  }

  // Desktop drag-and-drop onto the photo area.
  function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) pickFile(file);
  }

  function clearPhoto() {
    setSelectedFile(null);
    setPreviewUrl(null);
  }

  // Shared second half of every lookup (confirmed photo or description): turn a food tag into
  // the Wolfram nutrition image.
  async function lookupNutrition(detectedTag, tagToken) {
    setTag(detectedTag);
    setLoading('lookup');

    try {
      const { blobUrl: nextBlobUrl, usage } = await fetchNutritionImage(detectedTag, tagToken, token);
      if (previousBlobUrl.current) URL.revokeObjectURL(previousBlobUrl.current);
      previousBlobUrl.current = nextBlobUrl;
      setBlobUrl(nextBlobUrl);
      if (usage) onUsageChange(usage);
    } catch (nutritionError) {
      setError(friendlyMessage(nutritionError, 'Something went wrong looking up the nutrition facts - please try again.'));
      setErrorStatus(nutritionError.status ?? null);
      if (nutritionError.usage) onUsageChange(nutritionError.usage);
    }
  }

  function resetResult() {
    setTag(null);
    setBlobUrl(null);
    setError(null);
    setErrorStatus(null);
    setPendingTag(null);
  }

  // "New lookup" (phones): back to the start screen with nothing picked.
  function startOver() {
    resetResult();
    clearPhoto();
  }

  async function runLookup(detect) {
    setLoading('identify');
    resetResult();

    try {
      const { tag: detectedTag, tagToken } = await detect();
      await lookupNutrition(detectedTag, tagToken);
    } catch (detectError) {
      setError(friendlyMessage(detectError, IDENTIFY_FAILED));
    } finally {
      setLoading(null);
    }
  }

  async function handleAnalyse() {
    const file = selectedFile;
    if (!file) return;

    setLoading('identify');
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
      setLoading(null);
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

  // Describing food from scratch - drop any previous photo so it isn't shown next to a result
  // for something else.
  function handleDescribe(text) {
    clearPhoto();
    runLookup(() => detectFoodFromText(text, token));
  }

  // Which step the right-hand card (desktop) / the whole screen (phones) is on. null = nothing
  // started yet, so phones show the start card and desktop shows a placeholder.
  const step = loading ? 'loading' : pendingTag !== null ? 'confirm' : tag || error ? 'result' : null;
  const busy = loading !== null;
  // Wolfram sent back a nutrition image - the cue to point at "Change photo" for the next one.
  const resultReady = step === 'result' && Boolean(blobUrl);

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      {/* Start card: pick a photo or describe the food. Phones hide it while a step is showing. */}
      <Card className={step ? 'hidden lg:flex' : ''}>
        {showTakePhoto && (
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
        )}
        <input type="file" accept="image/*" ref={libraryInputRef} onChange={handleFileChange} className="hidden" />

        {/* The photo stays here through the whole lookup (desktop); the step card beside it shows
            the progress. Change photo / Remove start the next one. */}
        {previewUrl ? (
          <>
            <div className="relative aspect-4/3 max-w-full overflow-hidden rounded-[10px] bg-field">
              <img src={previewUrl} alt="Your food photo" className="size-full object-cover" />
              {/* These sit on the photo, so they use fixed see-through plum / red with white text rather
                  than the theme colours. */}
              <div className="absolute right-2 bottom-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={busy}
                  className={`cursor-pointer rounded-full bg-[#5b1a74]/75 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm hover:bg-[#5b1a74]/90 ${
                    resultReady ? 'animate-nudge motion-reduce:animate-none' : ''
                  }`}
                >
                  Change photo
                </button>
                {/* Back to the start card, where the describe box is. */}
                <button
                  type="button"
                  onClick={clearPhoto}
                  disabled={busy}
                  className="cursor-pointer rounded-full bg-[#c8283f]/75 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm hover:bg-[#c8283f]/90"
                >
                  Remove
                </button>
              </div>
            </div>
            {/* Only before it's been analysed - afterwards the step card has the next action. */}
            {step === null && (
              <>
                <Button onClick={handleAnalyse} disabled={busy} className="w-full">
                  Analyse photo
                </Button>
                <p className="flex items-center gap-2 text-xs text-sub before:size-2 before:shrink-0 before:rounded-full before:bg-ok">
                  Identifying the photo doesn't use a lookup
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-sub px-3 py-5 text-center text-sub lg:py-9"
            >
              {showTakePhoto ? <CameraIcon className="size-8 text-brand" /> : <UploadIcon className="size-8 text-brand" />}
              <span className="font-bold text-ink">
                {showTakePhoto ? 'Snap or pick a photo of your food' : 'Drag a photo of your food here'}
              </span>
              <div className="flex w-full justify-center gap-2">
                {showTakePhoto && (
                  <Button className="flex-1" onClick={() => cameraInputRef.current?.click()} disabled={busy}>
                    <CameraIcon /> Take photo
                  </Button>
                )}
                <Button
                  variant={showTakePhoto ? 'ghost' : 'primary'}
                  className={showTakePhoto ? 'flex-1' : ''}
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={busy}
                >
                  <ImageIcon /> {showTakePhoto ? 'Library' : 'Choose a photo'}
                </Button>
              </div>
            </div>
            <OrDivider>or describe it</OrDivider>
            <DescribeFood
              token={token}
              onSubmit={handleDescribe}
              disabled={busy}
              placeholder='e.g. "chicken caesar salad"'
            />
          </>
        )}
      </Card>

      {/* Current step: identifying/looking up, confirming a photo guess, or the result. */}
      <Card className={step ? '' : 'hidden lg:flex'} aria-live="polite">
        {step === null && (
          <p className="py-10 text-center text-sm text-sub">Your nutrition facts will show up here.</p>
        )}

        {step === 'loading' && <Spinner label={LOADING_LABELS[loading]} />}

        {step === 'confirm' && (
          <>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Your food photo"
                className="aspect-4/3 w-full rounded-[10px] object-cover lg:hidden"
              />
            )}
            <p className={error ? 'text-sm text-danger' : 'text-xs font-bold tracking-wider text-sub uppercase'}>
              {error ? `${error} Describe it instead:` : 'Looks like:'}
            </p>
            <DescribeFood
              token={token}
              key={confirmId}
              initialValue={pendingTag}
              onSubmit={handleConfirm}
              placeholder="Describe the food in the photo"
              ariaLabel="Food in the photo"
              submitLabel="Look up nutrition"
            />
            <p className="text-xs text-sub">Not right? Edit it first, or add an amount like "2 slices".</p>
          </>
        )}

        {step === 'result' &&
          (error ? (
            <div className="flex flex-col gap-2 py-4">
              <p role="alert" className="text-danger">
                {error}
              </p>
              {errorStatus === 429 && (
                <p className="text-sm text-sub">
                  <LinkButton onClick={onOpenSettings}>Open Settings</LinkButton> to add your own Wolfram Alpha App
                  ID.
                </p>
              )}
            </div>
          ) : (
            <NutritionResult tag={tag} blobUrl={blobUrl} onEnlarge={setLightboxSrc} />
          ))}

        {(step === 'result' || step === 'confirm') && (
          <Button variant="ghost" className="w-full lg:hidden" onClick={startOver}>
            <PlusIcon /> New lookup
          </Button>
        )}
      </Card>

      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
