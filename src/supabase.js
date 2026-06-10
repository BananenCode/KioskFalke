import { createClient } from '@supabase/supabase-js'

const url = 'https://kkvyfreqglyrjgrrpvtj.supabase.co'
const key = 'sb_publishable_hMaj4qBGG8ishEp33_sifw_rg4zaoe5'

console.log('SUPABASE URL AKTUELL:', url)

export const supabase = createClient(url, key)
