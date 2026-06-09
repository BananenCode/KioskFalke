import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.warn('Supabase ENV fehlt. Lege VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY an.')
}

export const supabase = createClient(url || 'https://example.supabase.co', key || 'missing')
