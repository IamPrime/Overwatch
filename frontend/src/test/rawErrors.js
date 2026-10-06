import { expect } from 'vitest';

// What a raw technical message looks like - the same rule as the "user-facing error messages" tests in test/server.test.js.
// A message shown to users must match none of these.
const RAW_PATTERNS = [
  /<\/?[a-z][^>]*>/i, // HTML
  /\bat \S+ \(|\bat \S+:\d+:\d+|\.jsx?:\d+/, // stack trace lines
  /\b(Type|Syntax|Range|Reference|Encoding|NotSupported|Abort|Auth\w*)Error\b|\bDOMException\b|\bError:/,
  /Failed to fetch|NetworkError|Load failed|fetch failed/i, // browsers' own network errors
  /Unexpected token|JSON\.parse|in JSON at position|Unable to decode/i,
  /\[object Object\]|\bundefined\b|\bnull\b/,
  /https?:\/\//,
  /supabase|postgres|provider|_disabled|status code/i,
];

export function expectFriendly(message) {
  expect(typeof message, `not a message: ${message}`).toBe('string');
  expect(message.length, `too terse to help: ${JSON.stringify(message)}`).toBeGreaterThan(10);
  for (const pattern of RAW_PATTERNS) {
    expect(message, `raw detail shown to the user: ${JSON.stringify(message)}`).not.toMatch(pattern);
  }
}
