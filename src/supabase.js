import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://kkvyfreqglyrjgrrpvtj.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hMaj4qBGG8ishEp33_sifw_rg4zaoe5'

export const supabase = createClient(url, key)
