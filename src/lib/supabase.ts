import { createClient } from '@supabase/supabase-js';

// Fallback to placeholder values during build to prevent build-time crashes (like on Cloudflare Pages)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-id.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

console.log('[Supabase Client] Initializing client... URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'FOUND' : 'MISSING', '| Anon Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'FOUND' : 'MISSING');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn(
    'Warning: Supabase environment variables are missing. Falling back to placeholders for compilation/build.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

