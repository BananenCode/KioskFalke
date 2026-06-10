console.log('SUPABASE BUILD TEST 999')
import { createClient } from '@supabase/supabase-js'

const url = 'https://kkvyfregqlyrjgrrpvtj.supabase.co'
const key = 'sb_publishable_cGn4hNURfnVzjzxffGrvIw_z09RPf9b'

export const supabase = createClient(url, key)
