import { createClient } from '@supabase/supabase-js'

// Wichtig: Die URL darf NICHT mit /rest/v1/ enden.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://kkvyfregqlyrjgrrpvtj.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hMaj4qBGG8ishEp33_sifw_rg4zaoe5'

export const supabase = createClient(url, key)
