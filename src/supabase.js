import { createClient } from '@supabase/supabase-js'

// Wichtig: Die URL darf NICHT mit /rest/v1/ enden.
// Du kannst die Werte später wieder über Vercel Environment Variables setzen.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://kkvyfregqlyrjgrrpvtj.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cGn4hNURfnVzjzxffGrvIw_z09RPf9b'

export const supabase = createClient(url, key)
