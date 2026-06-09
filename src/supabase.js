import { createClient } from '@supabase/supabase-js'

const url = 'https://kkvyfreglyrjgrrpvtj.supabase.co'
const key = 'HIER_DEINEN_SB_PUBLISHABLE_KEY_EINFÜGEN'

export const supabase = createClient(url, key)
