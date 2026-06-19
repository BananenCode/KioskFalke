import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, BarChart3, Camera, CheckCircle2, CreditCard, Download, Edit3, FolderTree, Heart, ImagePlus, Link2, LogOut, MessageCircle, MessageSquarePlus, Newspaper, Package, Pin, Plus, Save, Send, ShoppingBasket, Trash2, UserRoundCog, Users, WalletCards, X, SlidersHorizontal, Moon, Sun } from 'lucide-react'
import { supabase } from './supabase'
import './styles.css'

const STORE_KEY = 'kioskfalke_session_v3'
const THEME_KEY = 'kioskfalke_theme_v1'
const money = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))
const dateTime = (d) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
const imgHint = 'Icon optional: PNG, JPG, WebP oder SVG. Am besten quadratisch, max. 300 KB.'
const blank = { icon_data_url: '' }


function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])
  return [theme, () => setTheme(t => t === 'dark' ? 'light' : 'dark')]
}

function useSession() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY) || 'null') } catch { return null } })
  const save = (next, remember = true) => {
    setSession(next)
    localStorage.removeItem(STORE_KEY); sessionStorage.removeItem(STORE_KEY)
    if (next) (remember ? localStorage : sessionStorage).setItem(STORE_KEY, JSON.stringify(next))
  }
  return [session, save]
}
async function rpc(name, args = {}) { const { data, error } = await supabase.rpc(name, args); if (error) throw new Error(error.message); return data }
function actor(session) { return { p_actor_id: session.id, p_actor_code: session.code } }
function fileToDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file) }) }
async function newsImageToDataUrl(file) {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Bitte PNG, JPG oder WebP verwenden.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Das Foto darf vor der Optimierung maximal 5 MB groß sein.')
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Das Foto konnte nicht verarbeitet werden.'))
      img.src = objectUrl
    })
    const maxSide = 1600
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84))
    if (!blob) throw new Error('Das Foto konnte nicht optimiert werden.')
    if (blob.size > 1.6 * 1024 * 1024) throw new Error('Das optimierte Foto ist noch zu groß. Bitte ein kleineres Bild verwenden.')
    return await fileToDataUrl(blob)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
function IconImg({ src, label, size='md' }) { return src ? <img className={`icon-img ${size}`} src={src} alt={label || 'Icon'} /> : <div className={`icon-placeholder ${size}`}>{(label || 'K').slice(0,1).toUpperCase()}</div> }
function Empty({ text }) { return <div className="empty">{text}</div> }
function Stat({title,value, tone=''}) { return <div className="stat"><span>{title}</span><b className={tone}>{value}</b></div> }

function paypalMeLink(raw, amount) {
  const v = String(raw || '').trim()
  if (!v) return ''
  const clean = v.replace(/^https?:\/\/(www\.)?paypal\.me\//i, '').replace(/^paypal\.me\//i, '').replace(/^@/, '').split(/[/?#]/)[0]
  if (!clean) return ''
  const due = Math.max(0, -Number(amount || 0)).toFixed(2)
  return `https://paypal.me/${encodeURIComponent(clean)}${due > 0 ? '/' + due : ''}`
}
function pdfEscape(v){
  return String(v ?? '')
    .replace(/[\()]/g, '\\$&')
    .replace(/[ä]/g,'ae').replace(/[Ä]/g,'Ae')
    .replace(/[ö]/g,'oe').replace(/[Ö]/g,'Oe')
    .replace(/[ü]/g,'ue').replace(/[Ü]/g,'Ue')
    .replace(/[ß]/g,'ss')
    .replace(/\r?\n/g, ' ')
}
function monthKey(d){ return new Date(d).toLocaleString('de-DE', { month:'2-digit', year:'numeric' }) }
function buildStatementLines(data) {
  const u = data.user || {}
  const lines = [
    'KioskFalke Kontoauszug',
    `${u.name || ''} (${u.user_key || ''})`,
    `Erstellt am ${dateTime(new Date())}`,
    `Aktueller Kontostand: ${money(u.balance)}`,
    '',
    'Produktbuchungen nach Monat.Jahr'
  ]
  const entries = [...(data.entries || [])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
  if (!entries.length) lines.push('Keine Produktbuchungen vorhanden.')
  let current = ''
  entries.forEach(e => {
    const key = monthKey(e.created_at)
    if (key !== current) { current = key; lines.push('', key) }
    lines.push(`${dateTime(e.created_at)} | ${e.product_name} | ${e.category_title || 'Ohne Kategorie'} | ${e.quantity}x | ${money(e.total)}${e.deleted_at ? ' | geloescht' : ''}`)
  })
  const other = [...(data.movements || [])].filter(m=>m.kind!=='entry').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
  lines.push('', 'Zahlungen & Korrekturen nach Monat.Jahr')
  if (!other.length) lines.push('Keine Zahlungen oder Korrekturen vorhanden.')
  current = ''
  other.forEach(m => {
    const key = monthKey(m.created_at)
    if (key !== current) { current = key; lines.push('', key) }
    lines.push(`${dateTime(m.created_at)} | ${m.type_label} | ${m.note || ''} | ${money(m.amount)}`)
  })
  return lines
}
function downloadStatementPdf(data) {
  const u = data.user || {}
  const lines = buildStatementLines(data)
  const pages = []
  const first = lines.slice(0, 42)
  pages.push(first)
  for (let i=42; i<lines.length; i+=48) pages.push(lines.slice(i, i+48))
  const objs = ['1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj']
  const pageObjNums = []
  let nextObj = 3
  const fontObj = nextObj++
  const contentObjs = []
  pages.forEach((pageLines, idx) => {
    const pageObj = nextObj++, contentObj = nextObj++
    pageObjNums.push(pageObj); contentObjs.push([contentObj, pageLines])
    objs.push(`${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >> endobj`)
  })
  objs.splice(1, 0, `2 0 obj << /Type /Pages /Kids [${pageObjNums.map(n=>n+' 0 R').join(' ')}] /Count ${pageObjNums.length} >> endobj`)
  objs.push(`${fontObj} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`)
  contentObjs.forEach(([num, pageLines], pageIndex) => {
    const content = ['BT','/F1 16 Tf',`1 0 0 1 50 800 Tm`,`(${pdfEscape(pageLines[0] || '')}) Tj`,'/F1 9 Tf']
    let y = 772
    pageLines.slice(1).forEach(line => { content.push(`1 0 0 1 50 ${y} Tm`, `(${pdfEscape(line).slice(0,122)}) Tj`); y -= 15 })
    content.push('/F1 8 Tf', `1 0 0 1 50 28 Tm`, `(Seite ${pageIndex+1} von ${pages.length}) Tj`, 'ET')
    const stream = content.join('\n')
    objs.push(`${num} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`)
  })
  let body = '%PDF-1.4\n', offsets=[0]
  objs.forEach(o => { offsets.push(body.length); body += o + '\n' })
  const xref = body.length
  body += `xref\n0 ${objs.length+1}\n0000000000 65535 f \n` + offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n') + `\ntrailer << /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const blob = new Blob([body], {type:'application/pdf'})
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Kontoauszug_${(u.user_key||'user').replace(/[^a-z0-9_-]/gi,'_')}.pdf`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000)
}

function ImageInput({ value, onChange }) {
  async function pick(e) {
    const f = e.target.files?.[0]; if (!f) return
    if (!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(f.type)) return alert('Bitte PNG, JPG, WebP oder SVG hochladen.')
    if (f.size > 300 * 1024) return alert('Icon ist zu groß. Bitte maximal 300 KB.')
    onChange(await fileToDataUrl(f))
  }
  return <div className="image-input"><div className="preview"><IconImg src={value} label="Icon" /></div><label className="upload"><Camera size={16}/> Icon hochladen<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pick}/></label>{value && <button type="button" className="secondary smallbtn" onClick={()=>onChange('')}>Icon entfernen</button>}<small>{imgHint}</small></div>
}

function NewsImageInput({ value, onChange }) {
  const [busy, setBusy] = useState(false)
  async function pick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      onChange(await newsImageToDataUrl(file))
    } catch (error) {
      alert(error.message)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }
  return <div className="news-image-input">{value && <img className="news-image-preview" src={value} alt="Vorschau des News-Fotos"/>}<div className="actions"><label className="upload news-upload"><ImagePlus size={17}/>{busy ? 'Foto wird optimiert…' : value ? 'Foto ersetzen' : 'Foto hinzufügen'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} disabled={busy}/></label>{value && <button type="button" className="secondary smallbtn" onClick={()=>onChange('')}><X size={16}/> Entfernen</button>}</div><small className="muted">Optional · wird automatisch für die App optimiert.</small></div>
}

function App() { const [session, setSession] = useSession(); const [theme, toggleTheme] = useTheme(); const [tab, setTab] = useState('kiosk'); if (!session) return <Login onLogin={setSession} theme={theme} toggleTheme={toggleTheme} />; return <Shell session={session} setSession={setSession} tab={tab} setTab={setTab} theme={theme} toggleTheme={toggleTheme} /> }
function Login({ onLogin, theme, toggleTheme }) {
  const [userKey, setUserKey] = useState(''), [code, setCode] = useState(''), [remember, setRemember] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(e) { e.preventDefault(); setError(''); setBusy(true); try { const user = await rpc('kiosk_login', { p_user_key: userKey.trim(), p_code: code.trim() }); if (!user?.id) throw new Error('User_ID oder Zugangscode falsch'); onLogin({ ...user, code: code.trim() }, remember) } catch (e) { setError(e.message || 'Anmeldung fehlgeschlagen') } finally { setBusy(false) } }
  return <main className="login-screen"><button className="ghost theme-toggle" type="button" onClick={toggleTheme} aria-label="Darkmode umschalten">{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><section className="login-card"><div className="brand-logo"><img src="/icons/icon-192.png" alt="KioskFalke" /></div><h1>KioskFalke</h1><p>Privater Kiosk. Mit User_ID und Code anmelden.</p><form onSubmit={submit} className="stack"><input autoFocus placeholder="User_ID" value={userKey} onChange={e=>setUserKey(e.target.value)} autoCapitalize="none"/><input placeholder="Zugangscode" type="password" value={code} onChange={e=>setCode(e.target.value)}/><label className="check"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Eingeloggt bleiben</label>{error && <div className="error">{error}</div>}<button disabled={!userKey.trim() || !code.trim() || busy}>{busy ? 'Prüfe…' : 'Einloggen'}</button></form><p className="small">Hinweis: Offene Beträge bitte immer zum 1. eines Monats bezahlen.</p></section></main>
}
function Shell({ session, setSession, tab, setTab, theme, toggleTheme }) {
  const isAdmin = session.role === 'admin'
  const [newsUnread, setNewsUnread] = useState(false)
  const tabs = [['kiosk', ShoppingBasket, 'Kiosk'], ['dashboard', WalletCards, 'Konto'], ['community', MessageSquarePlus, 'Community'], ...(isAdmin ? [['admin', UserRoundCog, 'Admin']] : [])]

  useEffect(() => {
    let active = true
    async function checkNews() {
      try {
        const unread = await rpc('kiosk_news_has_unread', actor(session))
        if (!active) return
        if (tab === 'community') {
          setNewsUnread(false)
          if (unread) await rpc('kiosk_news_mark_seen', actor(session))
        } else {
          setNewsUnread(Boolean(unread))
        }
      } catch {
        if (active) setNewsUnread(false)
      }
    }
    checkNews()
    const timer = window.setInterval(checkNews, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [session.id, session.code, tab])

  function openTab(key) {
    setTab(key)
    if (key === 'community') {
      setNewsUnread(false)
      rpc('kiosk_news_mark_seen', actor(session)).catch(() => {})
    }
  }

  return <div className="app"><header className="topbar"><div className="top-title"><img src="/icons/icon-192.png" alt="KioskFalke"/><div><strong>KioskFalke</strong><span>{session.name} · {session.user_key} · {isAdmin ? 'Admin' : 'User'}</span></div></div><div className="top-actions"><button className="ghost icon-button" onClick={toggleTheme} aria-label="Darkmode umschalten">{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="ghost icon-button" onClick={() => setSession(null)} aria-label="Abmelden"><LogOut size={18}/></button></div></header><main className="content">{tab === 'kiosk' && <Kiosk session={session}/>} {tab === 'dashboard' && <Dashboard session={session}/>} {tab === 'community' && <Community session={session} onSeen={()=>setNewsUnread(false)}/>} {tab === 'admin' && isAdmin && <Admin session={session}/>}</main><nav className="bottom-nav">{tabs.map(([key, Icon, label]) => <button key={key} className={tab===key?'active':''} onClick={()=>openTab(key)}><span className="nav-icon"><Icon size={21}/>{key === 'community' && newsUnread && <span className="news-pin" title="Neue News"><Pin size={13} fill="currentColor"/></span>}</span><span>{label}</span></button>)}</nav></div>
}

function TileImage({ src, label }) {
  return <div className="tile-bg">{src ? <img src={src} alt={label || 'Icon'} /> : <div className="tile-fallback">{(label || 'K').slice(0,1).toUpperCase()}</div>}<div className="tile-shade" /></div>
}
function Kiosk({ session }) {
  const [products, setProducts] = useState([]), [selected, setSelected] = useState(null), [busyId, setBusyId] = useState(null), [msg, setMsg] = useState(''), [error, setError] = useState('')
  const categories = useMemo(() => { const map = new Map(); products.forEach(p => { const id = p.category_id || 'none'; if (!map.has(id)) map.set(id, { id, title: p.category_title || 'Ohne Kategorie', icon_data_url: p.category_icon_data_url || '', count: 0 }); map.get(id).count++ }); return [...map.values()].sort((a,b)=>a.title.localeCompare(b.title)) }, [products])
  const shown = products.filter(p => (p.category_id || 'none') === selected?.id)
  const load = async () => setProducts(await rpc('kiosk_products', actor(session)))
  useEffect(()=>{ load().catch(e=>setError(e.message)) }, [])
  async function take(product) { setBusyId(product.id); setMsg(''); setError(''); try { const res = await rpc('kiosk_take_product', { ...actor(session), p_product_id: product.id, p_quantity: 1 }); setMsg(`${product.name} gebucht. Kontostand: ${money(res.balance)}${res.warning ? ' — ' + res.warning : ''}`) } catch(e){ setError(e.message) } finally { setBusyId(null) } }
  return <section><h2>{selected ? selected.title : 'Kategorien'}</h2>{selected && <button className="secondary back" onClick={()=>setSelected(null)}><ArrowLeft size={18}/> Kategorien</button>}{msg && <div className={msg.includes('50') ? 'warning' : 'notice'}>{msg}</div>}{error && <div className="error">{error}</div>}{!products.length && <Empty text="Noch keine aktiven Produkte."/>}{!selected && <div className="tile-grid">{categories.map(c => <button key={c.id} className="image-tile category-tile" onClick={()=>setSelected(c)}><TileImage src={c.icon_data_url} label={c.title}/><div className="tile-text"><span>{c.title}</span><small>{c.count} Produkte</small></div></button>)}</div>}{selected && <div className="tile-grid">{shown.map(p => <article className="image-tile product-tile" key={p.id}><TileImage src={p.icon_data_url} label={p.name}/><div className="tile-text"><span>{p.name}</span><small>{money(p.price)}{p.excluded_from_revenue ? ' · nicht im Umsatz' : ''}</small></div><button className="tile-action" disabled={busyId===p.id} onClick={()=>take(p)}><Plus size={18}/> Nehmen</button></article>)}</div>}</section>
}


function Community({ session, onSeen }) {
  const [view, setView] = useState('news')
  const [news, setNews] = useState([])
  const [items, setItems] = useState([])
  const [suggestionForm, setSuggestionForm] = useState({title:'',description:''})
  const [newsForm, setNewsForm] = useState({title:'',body:'',image_data_url:''})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const isAdmin = session.role === 'admin'

  const loadNews = async () => {
    const data = await rpc('kiosk_news_feed', actor(session))
    setNews(Array.isArray(data) ? data : [])
  }
  const loadSuggestions = async () => setItems(await rpc('kiosk_community', actor(session)))

  useEffect(() => {
    Promise.all([loadNews(), loadSuggestions()]).catch(e=>setMsg(e.message))
    rpc('kiosk_news_mark_seen', actor(session)).catch(()=>{})
    onSeen?.()
  }, [])

  async function publishNews(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    try {
      await rpc('kiosk_admin_create_news', {...actor(session), p_title:newsForm.title, p_body:newsForm.body, p_image_data_url:newsForm.image_data_url})
      setNewsForm({title:'',body:'',image_data_url:''})
      await loadNews()
      await rpc('kiosk_news_mark_seen', actor(session))
      setMsg('News wurde veröffentlicht.')
    } catch (error) { setMsg(error.message) } finally { setBusy(false) }
  }

  async function deleteNews(id) {
    if (!confirm('Diesen News-Beitrag wirklich löschen?')) return
    try { await rpc('kiosk_admin_delete_news', {...actor(session), p_news_id:id}); await loadNews() } catch (error) { setMsg(error.message) }
  }

  async function toggleLike(id) {
    try { await rpc('kiosk_toggle_news_like', {...actor(session), p_news_id:id}); await loadNews() } catch (error) { setMsg(error.message) }
  }

  async function addComment(e, newsId) {
    e.preventDefault()
    const body = String(commentDrafts[newsId] || '').trim()
    if (!body) return
    try {
      await rpc('kiosk_add_news_comment', {...actor(session), p_news_id:newsId, p_body:body})
      setCommentDrafts(current => ({...current, [newsId]:''}))
      await loadNews()
    } catch (error) { setMsg(error.message) }
  }

  async function deleteComment(commentId) {
    if (!confirm('Kommentar löschen?')) return
    try { await rpc('kiosk_delete_news_comment', {...actor(session), p_comment_id:commentId}); await loadNews() } catch (error) { setMsg(error.message) }
  }

  async function submitSuggestion(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      await rpc('kiosk_create_suggestion',{...actor(session),p_title:suggestionForm.title,p_description:suggestionForm.description})
      setSuggestionForm({title:'',description:''}); await loadSuggestions()
    } catch (error) { setMsg(error.message) } finally { setBusy(false) }
  }
  async function vote(id) { try { await rpc('kiosk_toggle_suggestion_vote',{...actor(session),p_suggestion_id:id}); await loadSuggestions() } catch (error) { setMsg(error.message) } }
  async function setStatus(id,status) { try { await rpc('kiosk_admin_set_suggestion_status',{...actor(session),p_suggestion_id:id,p_status:status}); await loadSuggestions() } catch (error) { setMsg(error.message) } }

  const open = items.filter(i=>i.status==='open')
  const decided = items.filter(i=>i.status!=='open')
  const renderSuggestion = i => <article className={`card suggestion ${i.status}`} key={i.id}><div><div className="suggestion-head"><b>{i.title}</b><span>{i.status==='added'?'Hinzugefügt':i.status==='rejected'?'Abgelehnt':'Offen'}</span></div>{i.description && <p>{i.description}</p>}<small>von {i.created_by_name || 'Unbekannt'} · {dateTime(i.created_at)}</small></div><div className="suggestion-actions"><button className={i.user_voted?'vote active':'vote'} onClick={()=>vote(i.id)} title="Falken-Vote"><span className="falcon">🦅</span> {i.upvotes}</button>{isAdmin && <><button className="secondary smallbtn" onClick={()=>setStatus(i.id,'added')}>Hinzugefügt</button><button className="danger smallbtn" onClick={()=>setStatus(i.id,'rejected')}>Ablehnen</button><button className="secondary smallbtn" onClick={()=>setStatus(i.id,'open')}>Offen</button></>}</div></article>

  return <section className="community-page"><div className="section-heading"><div><span className="eyebrow">KioskFalke Social</span><h2>Community</h2></div></div><div className="segmented community-switch"><button className={view==='news'?'active':''} onClick={()=>setView('news')}><Newspaper size={18}/> News</button><button className={view==='suggestions'?'active':''} onClick={()=>setView('suggestions')}><MessageSquarePlus size={18}/> Produktvorschläge</button></div>{msg && <div className={msg.includes('veröffentlicht') ? 'notice' : 'error'}>{msg}</div>}{view === 'news' && <div className="news-layout">{isAdmin && <form className="card news-composer" onSubmit={publishNews}><div className="composer-heading"><div className="admin-avatar"><img src="/icons/icon-192.png" alt="KioskFalke"/></div><div><h3>News veröffentlichen</h3><p>Erstelle einen Beitrag für alle KioskFalke-User.</p></div></div><input maxLength={120} placeholder="Titel der News" value={newsForm.title} onChange={e=>setNewsForm({...newsForm,title:e.target.value})}/><textarea maxLength={3000} rows={5} placeholder="Was gibt es Neues?" value={newsForm.body} onChange={e=>setNewsForm({...newsForm,body:e.target.value})}/><NewsImageInput value={newsForm.image_data_url} onChange={value=>setNewsForm({...newsForm,image_data_url:value})}/><div className="composer-footer"><small>{newsForm.body.length}/3000 Zeichen</small><button disabled={busy || !newsForm.title.trim() || !newsForm.body.trim()}><Send size={18}/>{busy ? 'Wird veröffentlicht…' : 'Veröffentlichen'}</button></div></form>}<div className="news-feed">{news.length ? news.map(post => <article className="news-post" key={post.id}><header className="news-post-header"><div className="news-author"><div className="admin-avatar"><img src="/icons/icon-192.png" alt="KioskFalke Admin"/></div><div><b>{post.author_name}</b><span>Admin · {dateTime(post.created_at)}</span></div></div>{isAdmin && <button className="ghost icon-button delete-post" onClick={()=>deleteNews(post.id)} aria-label="News löschen"><Trash2 size={17}/></button>}</header><div className="news-copy"><h3>{post.title}</h3><p>{post.body}</p></div>{post.image_data_url && <img className="news-photo" src={post.image_data_url} alt={post.title}/>}<div className="news-actions"><button className={`news-action ${post.user_liked ? 'liked' : ''}`} onClick={()=>toggleLike(post.id)}><Heart size={19} fill={post.user_liked ? 'currentColor' : 'none'}/><span>{post.likes_count || 0}</span></button><span className="news-action static"><MessageCircle size={19}/><span>{post.comments_count || 0}</span></span></div><div className="comments"><div className="comments-list">{(post.comments || []).map(comment => <div className="comment" key={comment.id}><div className="comment-avatar">{(comment.author_name || 'U').slice(0,1).toUpperCase()}</div><div className="comment-bubble"><div className="comment-meta"><b>{comment.author_name}</b><span>{dateTime(comment.created_at)}</span></div><p>{comment.body}</p></div>{(isAdmin || comment.user_id === session.id) && <button className="ghost comment-delete" onClick={()=>deleteComment(comment.id)} aria-label="Kommentar löschen"><Trash2 size={14}/></button>}</div>)}</div><form className="comment-form" onSubmit={e=>addComment(e,post.id)}><input maxLength={500} placeholder="Kommentar schreiben …" value={commentDrafts[post.id] || ''} onChange={e=>setCommentDrafts({...commentDrafts,[post.id]:e.target.value})}/><button className="comment-send" disabled={!String(commentDrafts[post.id] || '').trim()} aria-label="Kommentar senden"><Send size={17}/></button></form></div></article>) : <Empty text="Noch keine News. Der erste Beitrag erscheint hier ganz oben."/>}</div></div>}{view === 'suggestions' && <div className="suggestions-view"><form className="card form" onSubmit={submitSuggestion}><h3>Produkt vorschlagen</h3><p className="muted">Was soll als Nächstes in den Kiosk?</p><input placeholder="Produktname, z.B. Spezi Zero" value={suggestionForm.title} onChange={e=>setSuggestionForm({...suggestionForm,title:e.target.value})}/><input placeholder="Optional: Warum soll es rein?" value={suggestionForm.description} onChange={e=>setSuggestionForm({...suggestionForm,description:e.target.value})}/><button disabled={!suggestionForm.title.trim() || busy}><MessageSquarePlus size={18}/> Vorschlag senden</button></form><h3 className="mt">Offene Vorschläge</h3><div className="stack">{open.length ? open.map(renderSuggestion) : <Empty text="Noch keine offenen Vorschläge."/>}</div>{decided.length>0 && <><h3 className="mt">Bearbeitet</h3><div className="stack">{decided.map(renderSuggestion)}</div></>}</div>}</section>
}

function Dashboard({ session }) {
  const [data, setData] = useState(null), [error, setError] = useState('')
  useEffect(()=>{ rpc('kiosk_my_dashboard', actor(session)).then(setData).catch(e=>setError(e.message)) }, [])
  if (error) return <div className="error">{error}</div>; if (!data) return <Empty text="Lade Konto…" />
  const bal = Number(data.balance || 0), payUrl = paypalMeLink(data.paypal_me, bal)
  return <section><h2>Mein Konto</h2><div className="card hero"><span>Aktueller Kontostand</span><strong className={bal < 0 ? 'bad' : bal > 0 ? 'good' : ''}>{money(bal)}</strong><p>{data.pay_info}</p>{bal < 0 && payUrl && <a className="pay-link" href={payUrl} target="_blank" rel="noreferrer"><CreditCard size={19}/> Mit PayPal.Me bezahlen</a>}{bal < 0 && !payUrl && <small className="muted">PayPal.Me wurde vom Admin noch nicht hinterlegt.</small>}</div>{bal <= -50 && <div className="warning">Dein Konto ist über 50 € im Minus. Bitte zeitnah bezahlen.</div>}<div className="stats"><Stat title="Monat" value={data.month_label}/><Stat title="Entnahmen" value={money(data.month_spent)}/><Stat title="Zahlungen/Korrekturen" value={money(Number(data.month_payments||0)+Number(data.month_adjustments||0))}/></div><h3>Journal aktueller Monat</h3><div className="list">{(data.month_items || []).length ? data.month_items.map(r => <article className="card listitem" key={r.id}><div className="product-info"><IconImg src={r.icon_data_url} label={r.product_name} size="sm"/><div><b>{r.product_name}</b><span>{r.category_title || 'Ohne Kategorie'} · {r.quantity}× · {money(r.total)} · {dateTime(r.created_at)}</span></div></div></article>) : <Empty text="Keine Einträge im aktuellen Monat."/>}</div></section>
}

function Admin({ session }) { const [view, setView] = useState('overview'); const views = [['overview','Übersicht'],['settings','Einstellungen'],['categories','Kategorien'],['products','Produkte'],['users','User'],['analysis','Analyse']]; return <section><h2>Admin</h2><div className="segmented wrap">{views.map(([k,l]) => <button key={k} className={view===k?'active':''} onClick={()=>setView(k)}>{l}</button>)}</div>{view==='overview' && <AdminOverview session={session}/>} {view==='settings' && <AdminSettings session={session}/>} {view==='categories' && <AdminCategories session={session}/>} {view==='products' && <AdminProducts session={session}/>} {view==='users' && <AdminUsers session={session}/>} {view==='analysis' && <AdminAnalysis session={session}/>}</section> }

function AdminSettings({ session }) {
  const [paypal,setPaypal]=useState(''), [msg,setMsg]=useState('')
  useEffect(()=>{ rpc('kiosk_admin_get_settings', actor(session)).then(d=>setPaypal(d.paypal_me || '')).catch(e=>setMsg(e.message)) }, [])
  async function save(e){ e.preventDefault(); setMsg(''); try{ await rpc('kiosk_admin_set_paypal_me',{...actor(session),p_paypal_me:paypal}); setMsg('PayPal.Me-Adresse gespeichert.') }catch(e){ setMsg(e.message) } }
  return <div className="stack"><form className="card form" onSubmit={save}><h3>PayPal.Me für alle User</h3><p className="muted">Hinterlege nur deinen PayPal.Me-Namen oder die komplette paypal.me-Adresse. Im Konto-Tab wird automatisch der offene Betrag angehängt.</p><input placeholder="z.B. kioskfalke oder https://paypal.me/kioskfalke" value={paypal} onChange={e=>setPaypal(e.target.value)} autoCapitalize="none"/><button><Save size={18}/> Speichern</button>{msg&&<div className={msg.includes('gespeichert')?'notice':'error'}>{msg}</div>}</form></div>
}

function AdminOverview({ session }) { const [rows,setRows]=useState([]), [msg,setMsg]=useState(''); const load=async()=>setRows(await rpc('kiosk_admin_overview',actor(session))); useEffect(()=>{load().catch(e=>setMsg(e.message))},[]); return <div className="stack">{msg&&<div className="error">{msg}</div>}{rows.map(r=><article className="card row" key={r.user_id}><div><h3>{r.name}</h3><p>{r.user_key} · {r.role}</p><b className={Number(r.balance)<0?'bad':Number(r.balance)>0?'good':''}>{money(r.balance)}</b></div><p>Dieser Monat: {money(r.month_spent)} · {r.entries_count} Buchungen</p></article>)}</div> }

function AdminCategories({ session }) {
  const [rows,setRows]=useState([]), [form,setForm]=useState({ title:'', icon_data_url:'', active:true }), [edit,setEdit]=useState(null), [msg,setMsg]=useState('')
  const load=async()=>setRows(await rpc('kiosk_admin_categories',actor(session))); useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  function startEdit(c){ setEdit(c.id); setForm({ title:c.title, icon_data_url:c.icon_data_url||'', active:c.active }) }
  async function save(e){ e.preventDefault(); setMsg(''); await rpc('kiosk_admin_upsert_category',{...actor(session),p_category_id:edit,p_title:form.title,p_icon_data_url:form.icon_data_url,p_active:form.active}); setForm({title:'',icon_data_url:'',active:true}); setEdit(null); await load() }
  async function del(c){ if(confirm(`Kategorie "${c.title}" löschen/deaktivieren? Produkte bleiben erhalten.`)){ await rpc('kiosk_admin_delete_category',{...actor(session),p_category_id:c.id}); await load()} }
  return <div className="stack"><form className="card form" onSubmit={save}><h3>{edit?'Kategorie bearbeiten':'Kategorie anlegen'}</h3><input placeholder="Titel, z.B. Softgetränke" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><ImageInput value={form.icon_data_url} onChange={v=>setForm({...form,icon_data_url:v})}/><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Aktiv</label><div className="actions"><button><FolderTree size={18}/> Speichern</button>{edit&&<button type="button" className="secondary" onClick={()=>{setEdit(null);setForm({title:'',icon_data_url:'',active:true})}}>Abbrechen</button>}</div></form>{msg&&<div className="error">{msg}</div>}{rows.map(c=><article className="card row" key={c.id}><div className="product-info"><IconImg src={c.icon_data_url} label={c.title}/><div><h3>{c.title}</h3><p>{c.active?'aktiv':'inaktiv'}</p></div></div><div className="actions"><button className="secondary" onClick={()=>startEdit(c)}><Edit3 size={16}/> Edit</button><button className="danger" onClick={()=>del(c)}><Trash2 size={16}/> Löschen</button></div></article>)}</div>
}
function AdminProducts({ session }) {
  const empty={name:'',description:'',price:'',category_id:'',active:true,icon_data_url:'',excluded_from_revenue:false}; const [rows,setRows]=useState([]), [cats,setCats]=useState([]), [form,setForm]=useState(empty), [edit,setEdit]=useState(null), [msg,setMsg]=useState('')
  const load=async()=>{ setRows(await rpc('kiosk_admin_products',actor(session))); setCats(await rpc('kiosk_admin_categories',actor(session))) }; useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  function startEdit(p){ setEdit(p.id); setForm({name:p.name,description:p.description||'',price:p.price,category_id:p.category_id||'',active:p.active,icon_data_url:p.icon_data_url||'',excluded_from_revenue:!!p.excluded_from_revenue}) }
  async function save(e){ e.preventDefault(); await rpc('kiosk_admin_upsert_product',{...actor(session),p_product_id:edit,p_name:form.name,p_description:form.description,p_price:Number(form.price),p_category_id:form.category_id||null,p_active:form.active,p_icon_data_url:form.icon_data_url,p_excluded_from_revenue:form.excluded_from_revenue}); setForm(empty); setEdit(null); await load() }
  async function del(p){ if(confirm(`Produkt "${p.name}" löschen/deaktivieren?`)){ await rpc('kiosk_admin_delete_product',{...actor(session),p_product_id:p.id}); await load()} }
  return <div className="stack"><form className="card form" onSubmit={save}><h3>{edit?'Produkt bearbeiten':'Produkt anlegen'}</h3><input placeholder="Titel, z.B. Cola" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="Beschreibung, z.B. Cola, Sprite, Fanta" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><input placeholder="Preis z.B. 1.00" type="number" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/><select value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">Kategorie wählen</option>{cats.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><ImageInput value={form.icon_data_url} onChange={v=>setForm({...form,icon_data_url:v})}/><label className="check"><input type="checkbox" checked={form.excluded_from_revenue} onChange={e=>setForm({...form,excluded_from_revenue:e.target.checked})}/> Nicht dem Gesamtumsatz zurechnen</label><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Aktiv</label><div className="actions"><button><Package size={18}/> Speichern</button>{edit&&<button type="button" className="secondary" onClick={()=>{setEdit(null);setForm(empty)}}>Abbrechen</button>}</div></form>{msg&&<div className="error">{msg}</div>}{rows.map(p=><article className="card row" key={p.id}><div className="product-info"><IconImg src={p.icon_data_url} label={p.name}/><div><h3>{p.name}</h3><p>{p.description} · {p.category_title} · {money(p.price)} · {p.active?'aktiv':'inaktiv'}</p>{p.excluded_from_revenue&&<small className="pill">nicht im Umsatz</small>}</div></div><div className="actions"><button className="secondary" onClick={()=>startEdit(p)}><Edit3 size={16}/> Edit</button><button className="danger" onClick={()=>del(p)}><Trash2 size={16}/> Löschen</button></div></article>)}</div>
}

function AdminUsers({ session }) {
  const empty={user_key:'',name:'',role:'user',code:'',active:true}; const [rows,setRows]=useState([]), [form,setForm]=useState(empty), [edit,setEdit]=useState(null), [selected,setSelected]=useState(null), [msg,setMsg]=useState('')
  const load=async()=>setRows(await rpc('kiosk_admin_users',actor(session))); useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  function startEdit(u){ setEdit(u.id); setForm({user_key:u.user_key,name:u.name,role:u.role,code:'',active:u.active}) }
  async function save(e){ e.preventDefault(); setMsg(''); await rpc('kiosk_admin_upsert_user',{...actor(session),p_user_id:edit,p_user_key:form.user_key,p_name:form.name,p_role:form.role,p_code:form.code,p_active:form.active}); setForm(empty); setEdit(null); await load() }
  async function del(u){ const code = u.role==='admin' ? prompt('Admin löschen: Sicherheitscode eingeben') : ''; if(u.role==='admin' && code===null) return; if(confirm(`${u.name} löschen/deaktivieren? Nur bei Kontostand 0 möglich.`)){ try{ await rpc('kiosk_admin_delete_user',{...actor(session),p_user_id:u.id,p_drop_code:code||''}); await load() }catch(e){alert(e.message)} } }
  return <div className="stack"><form className="card form" onSubmit={save}><h3>{edit?'User bearbeiten':'User anlegen'}</h3><input placeholder="User_ID, z.B. max01" value={form.user_key} onChange={e=>setForm({...form,user_key:e.target.value})}/><input placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="user">User</option><option value="admin">Admin</option></select><input placeholder={edit?'Neuer Zugangscode optional':'Zugangscode'} value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Aktiv</label><div className="actions"><button><Users size={18}/> Speichern</button>{edit&&<button type="button" className="secondary" onClick={()=>{setEdit(null);setForm(empty)}}>Abbrechen</button>}</div></form>{msg&&<div className="error">{msg}</div>}{rows.map(u=><article className="card row" key={u.id}><div><h3>{u.name}</h3><p>{u.user_key} · {u.role} · {u.active?'aktiv':'inaktiv'}</p><b className={Number(u.balance)<0?'bad':Number(u.balance)>0?'good':''}>{money(u.balance)}</b></div><div className="actions"><button className="secondary" onClick={()=>setSelected(u.id)}><SlidersHorizontal size={16}/> Profil</button><button className="secondary" onClick={()=>startEdit(u)}><Edit3 size={16}/> Edit</button><button className="danger" onClick={()=>del(u)}><Trash2 size={16}/> Löschen</button></div></article>)}{selected&&<UserProfile session={session} userId={selected} onClose={()=>{setSelected(null);load()}}/>}</div>
}
function UserProfile({ session, userId, onClose }) {
  const [data,setData]=useState(null), [pay,setPay]=useState({amount:'',note:''}), [adj,setAdj]=useState({amount:'',note:''}), [msg,setMsg]=useState('')
  const load=async()=>setData(await rpc('kiosk_admin_user_profile',{...actor(session),p_user_id:userId})); useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  async function addPayment(e){ e.preventDefault(); await rpc('kiosk_admin_add_payment',{...actor(session),p_user_id:userId,p_amount:Number(pay.amount),p_note:pay.note}); setPay({amount:'',note:''}); await load() }
  async function addAdjustment(e){ e.preventDefault(); await rpc('kiosk_admin_add_adjustment',{...actor(session),p_user_id:userId,p_amount:Number(adj.amount),p_note:adj.note}); setAdj({amount:'',note:''}); await load() }
  async function delEntry(id){ const reason=prompt('Grund für Korrektur','Fehlbuchung'); if(reason!==null){ await rpc('kiosk_admin_delete_entry',{...actor(session),p_entry_id:id,p_reason:reason}); await load() } }
  if(!data) return <div className="modal"><div className="panel"><button className="ghost close" onClick={onClose}><X/></button><Empty text="Lade Profil…"/></div></div>
  const u=data.user
  return <div className="modal"><div className="panel"><button className="ghost close" onClick={onClose}><X/></button><h2>{u.name}</h2><div className="card hero"><span>{u.user_key} · {u.role}</span><strong className={Number(u.balance)<0?'bad':Number(u.balance)>0?'good':''}>{money(u.balance)}</strong></div>{msg&&<div className="error">{msg}</div>}<form className="card form" onSubmit={addPayment}><h3>Zahlung verbuchen</h3><input type="number" step="0.01" placeholder="Betrag, z.B. 20" value={pay.amount} onChange={e=>setPay({...pay,amount:e.target.value})}/><input placeholder="Notiz" value={pay.note} onChange={e=>setPay({...pay,note:e.target.value})}/><button><CreditCard size={18}/> Zahlung speichern</button></form><form className="card form" onSubmit={addAdjustment}><h3>Konto-Korrektur (+/-)</h3><input type="number" step="0.01" placeholder="z.B. -5 oder 5" value={adj.amount} onChange={e=>setAdj({...adj,amount:e.target.value})}/><input placeholder="Grund" value={adj.note} onChange={e=>setAdj({...adj,note:e.target.value})}/><button><CheckCircle2 size={18}/> Korrektur speichern</button></form><div className="actions"><button className="secondary" onClick={()=>downloadStatementPdf(data)}><Download size={18}/> Kontoauszug PDF</button></div><h3>Produktbuchungen nach Monat.Jahr</h3><div className="list grouped-list">{data.entries.map(e=><article className="card row" key={e.id}><div><b>{e.product_name}</b><p><span className="month-badge">{monthKey(e.created_at)}</span> {e.category_title} · {money(e.total)} · {dateTime(e.created_at)} {e.deleted_at?'· gelöscht':''}</p></div>{!e.deleted_at&&<button className="danger" onClick={()=>delEntry(e.id)}>Fehlbuchung löschen</button>}</article>)}</div><h3>Zahlungen & Korrekturen</h3><div className="list">{(data.movements||[]).filter(m=>m.kind!=='entry').map(m=><article className="card row" key={m.kind+m.id}><div><b>{m.type_label}</b><p>{money(m.amount)} · {dateTime(m.created_at)} {m.note?'· '+m.note:''}</p></div></article>)}</div></div></div>
}
function AdminAnalysis({ session }) { const [data,setData]=useState(null), [msg,setMsg]=useState(''); useEffect(()=>{rpc('kiosk_admin_analysis',actor(session)).then(setData).catch(e=>setMsg(e.message))},[]); if(msg) return <div className="error">{msg}</div>; if(!data) return <Empty text="Lade Analyse…"/>; const max=Math.max(1,...(data.products||[]).map(p=>Number(p.month_revenue||0))); return <div className="stack"><div className="stats"><Stat title="Umsatz Monat" value={money(data.summary.month_revenue)}/><Stat title="Einheiten Monat" value={data.summary.month_units}/><Stat title="Umsatz gesamt" value={money(data.summary.all_revenue)}/></div><h3>Produkte</h3>{data.products.map(p=><article className="card analysis" key={p.name}><b>{p.name}</b><p>{p.category} · Monat: {p.month_units} Stk. · {money(p.month_revenue)} {p.excluded_from_revenue?'· nicht im Umsatz':''}</p><div className="bar"><span style={{width:`${Math.max(3,Number(p.month_revenue||0)/max*100)}%`}}/></div></article>)}<h3>Kategorien</h3>{data.categories.map(c=><article className="card analysis" key={c.title}><b>{c.title}</b><p>Monat: {c.month_units} Stk. · {money(c.month_revenue)} · Gesamt: {money(c.all_revenue)}</p></article>)}</div> }

createRoot(document.getElementById('root')).render(<App />)
