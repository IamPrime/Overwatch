// Detects whether the page is running on a mobile/touch device rather than a desktop
// browser, to decide whether "Take Photo" (which hands off to the OS camera app via the
// file input's capture attribute) is worth showing alongside "Choose from Library" - see
// UploadForm.jsx. On desktop, capture is ignored and both buttons would just open the same
// file dialog, so there "Take Photo" is redundant rather than useful.
//
// Two independent signals ORed together, same defensive style as isStandalone() in
// useStandalone.js: a user-agent check alone would misclassify iPads, since iPadOS Safari
// deliberately reports "Macintosh" in its UA string (to get desktop sites by default) even
// though it's a touchscreen device with a camera - matchMedia('(pointer: coarse)') catches
// that case since it reflects the actual input hardware, not the UA string.
export function isMobileDevice() {
  const uaMobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return uaMobile || coarsePointer;
}
