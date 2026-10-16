import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Server-only Supabase admin client. The secret key is never imported by a
 * client component; it is used for owner-controlled Auth work and signed
 * product-media uploads.
 */
export function createAdminClient() {
  const { SUPABASE_SECRET_KEY } = serverEnv();
  if (!SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY is required for this server-only operation.');
  }

  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
