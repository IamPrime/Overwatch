import { useEffect, useState } from 'react';

// Settings > Appearance: 'system' follows the device's light/dark setting (the CSS media query in
// index.css), while 'light' or 'dark' pins it via data-theme on <html>. Remembered per device in
// localStorage; index.html applies the saved value before the first paint, using the same key.
const STORAGE_KEY = 'angalia-appearance';
const CHOICES = ['system', 'light', 'dark'];

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return CHOICES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function useAppearance() {
  const [appearance, setAppearance] = useState(readSaved);

  useEffect(() => {
    const root = document.documentElement;
    if (appearance === 'system') delete root.dataset.theme;
    else root.dataset.theme = appearance;
    try {
      localStorage.setItem(STORAGE_KEY, appearance);
    } catch {
      // Private mode or blocked storage - the choice still applies until the app is closed.
    }
  }, [appearance]);

  return [appearance, setAppearance];
}
