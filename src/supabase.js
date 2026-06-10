import { createClient } from '@supabase/supabase-js'

const url = 'https://kkvyfreqglyrjgrrpvtj.supabase.co/rest/v1/'
const key = 'sb_publishable_cGn4hNURfnVzjzxffGrvIw_z09RPf9b'

export const supabase = createClient(url, key)
