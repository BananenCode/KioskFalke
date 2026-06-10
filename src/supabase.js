import { createClient } from '@supabase/supabase-js'

const url = 'https://kkvyfregqlyrjgrrpvtj.supabase.co'
const key = 'sb_publishable_cGn4hNURfnVzjzxffGrvIw_z09RPf9b'

console.log('SUPABASE URL AKTUELL:', url)

export const supabase = createClient(url, key)
