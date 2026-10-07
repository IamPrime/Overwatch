export const APP_NAME = 'Angalia';

// Pass a text colour in className to override the default brand colour.
export function Wordmark({ className = 'text-brand' }) {
  return <span className={`font-word font-extrabold tracking-tight ${className}`}>{APP_NAME}</span>;
}
