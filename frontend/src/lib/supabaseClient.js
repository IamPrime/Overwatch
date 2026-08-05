import { createClient } from '@supabase/supabase-js';

// The anon key is meant to be public - Supabase's security boundary is RLS + auth,
// not key secrecy - so it's safe to ship in the client bundle via Vite's build-time
// env vars, unlike the server-only Purdue/Gemini/Wolfram/service-role keys.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY - copy frontend/.env.example to frontend/.env and fill them in.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
