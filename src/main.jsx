import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, BarChart3, CalendarDays, Camera, CheckCircle2, CreditCard, Download, Edit3, FileText, FolderTree, Heart, ImagePlus, LayoutDashboard, Link2, LogOut, MessageCircle, MessageSquarePlus, Newspaper, Package, Pin, Plus, RefreshCw, Save, Search, Send, ShoppingBasket, Trash2, UserRoundCog, Users, WalletCards, X, SlidersHorizontal, Moon, Sun } from 'lucide-react'
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
    if (typeof window === 'undefined') return 'light'
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
  const [session, setSession] = useState(() => { if(typeof window==='undefined') return null; try { return JSON.parse(localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY) || 'null') } catch { return null } })
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
function paypalMeAmountLink(raw, amount) {
  return paypalMeLink(raw, -Math.abs(Number(amount || 0)))
}
function pdfAscii(v){
  return String(v ?? '')
    .replace(/[\u00a0\u202f]/g,' ')
    .replace(/€/g,'EUR')
    .replace(/[ä]/g,'ae').replace(/[Ä]/g,'Ae')
    .replace(/[ö]/g,'oe').replace(/[Ö]/g,'Oe')
    .replace(/[ü]/g,'ue').replace(/[Ü]/g,'Ue')
    .replace(/[ß]/g,'ss')
    .replace(/[éèê]/g,'e').replace(/[ÉÈÊ]/g,'E')
    .replace(/[áàâ]/g,'a').replace(/[ÁÀÂ]/g,'A')
    .replace(/[–—]/g,'-').replace(/[„“”]/g,'"').replace(/[’]/g,"'")
    .replace(/[^\x20-\x7E\n]/g,'?')
}
function pdfEscape(v){ return pdfAscii(v).replace(/\\/g,'\\\\').replace(/[()]/g,'\\$&').replace(/\r?\n/g,' ') }
function monthKey(d){ return new Date(d).toLocaleString('de-DE', { month:'2-digit', year:'numeric' }) }
function monthValue(d=new Date()){ const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}` }
function monthLabel(value){ const [y,m]=String(value).split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString('de-DE',{month:'long',year:'numeric'}) }
function wrapPdfText(value, max=88){
  const words=pdfAscii(value).replace(/\s+/g,' ').trim().split(' ').filter(Boolean), lines=[]
  let line=''
  words.forEach(word=>{ const next=line ? `${line} ${word}` : word; if(next.length>max && line){ lines.push(line); line=word } else line=next })
  if(line || !lines.length) lines.push(line)
  return lines
}
function pdfText(commands,text,x,y,size=10,bold=false){ commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj ET`) }
function pdfRule(commands,x1,y1,x2,y2,width=.5){ commands.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`) }
function makePdfBlob(pageStreams){
  const pageCount=pageStreams.length, objects=[]
  const pageNums=pageStreams.map((_,i)=>5+i*2), contentNums=pageStreams.map((_,i)=>6+i*2)
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>'
  objects[2]=`<< /Type /Pages /Kids [${pageNums.map(n=>`${n} 0 R`).join(' ')}] /Count ${pageCount} >>`
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  pageStreams.forEach((stream,i)=>{
    objects[pageNums[i]]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNums[i]} 0 R >>`
    objects[contentNums[i]]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  let body='%PDF-1.4\n%KioskFalke\n', offsets=[0]
  for(let i=1;i<objects.length;i++){ offsets[i]=body.length; body+=`${i} 0 obj\n${objects[i]}\nendobj\n` }
  const xref=body.length
  body+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for(let i=1;i<objects.length;i++) body+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`
  body+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([body],{type:'application/pdf'})
}
function savePdf(blob, filename){
  const url=URL.createObjectURL(blob), a=document.createElement('a')
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(()=>URL.revokeObjectURL(url),1200)
}
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
  const u=data.user || {}, raw=buildStatementLines(data), lines=raw.flatMap(line=>wrapPdfText(line,105))
  const chunks=[]; for(let i=0;i<lines.length;i+=45) chunks.push(lines.slice(i,i+45))
  const pages=chunks.map((page,index)=>{
    const commands=[]; let y=800
    pdfText(commands,index===0?'KioskFalke Kontoauszug':'KioskFalke Kontoauszug - Fortsetzung',50,y,16,true); y-=30
    page.forEach(line=>{ pdfText(commands,line,50,y,9,false); y-=15 })
    pdfText(commands,`Seite ${index+1} von ${chunks.length}`,485,25,8,false)
    return commands.join('\n')
  })
  savePdf(makePdfBlob(pages),`Kontoauszug_${(u.user_key||'user').replace(/[^a-z0-9_-]/gi,'_')}.pdf`)
}
function invoiceNumber(userKey){
  const stamp=new Date().toISOString().slice(0,10).replaceAll('-','')
  return `KF-GESAMT-${String(userKey||'USER').toUpperCase().replace(/[^A-Z0-9_-]/g,'')}-${stamp}`
}
function periodLabel(start,end){
  if(!start) return 'Gesamter Nutzungszeitraum'
  return `${new Date(start).toLocaleDateString('de-DE')} bis ${new Date(end||new Date()).toLocaleDateString('de-DE')}`
}
function downloadInvoicePdf(user, sales, settings={}){
  const grouped=new Map()
  sales.filter(s=>s.user_id===user.user_id).forEach(s=>{
    const key=`${s.product_name}|${Number(s.unit_price).toFixed(2)}`
    const row=grouped.get(key)||{product_name:s.product_name,category_title:s.category_title,quantity:0,unit_price:Number(s.unit_price),total:0}
    row.quantity+=Number(s.quantity||0); row.total+=Number(s.total||0); grouped.set(key,row)
  })
  const rows=[...grouped.values()].sort((a,b)=>a.product_name.localeCompare(b.product_name,'de'))
  const purchases=rows.reduce((sum,r)=>sum+r.total,0), payments=Number(user.total_payments||0), adjustments=Number(user.total_adjustments||0)
  const due=Math.max(0,-Number(user.balance||0)), number=invoiceNumber(user.user_key)
  const capacities=[16], rest=Math.max(0,rows.length-16); for(let i=0;i<Math.ceil(rest/23);i++) capacities.push(23)
  const chunks=[]; let cursor=0; capacities.forEach(cap=>{ chunks.push(rows.slice(cursor,cursor+cap)); cursor+=cap })
  if(!chunks.length) chunks.push([])
  const pages=chunks.map((chunk,pageIndex)=>{
    const c=[], issuer=settings.invoice_issuer||'KioskFalke', performancePeriod=periodLabel(user.first_purchase_at,user.last_purchase_at)
    pdfText(c,issuer,45,800,16,true)
    let iy=782
    String(settings.invoice_address||'').split(/\r?\n/).filter(Boolean).slice(0,4).forEach(line=>{pdfText(c,line,45,iy,8); iy-=11})
    if(settings.invoice_email) pdfText(c,settings.invoice_email,45,iy,8)
    if(pageIndex===0){
      pdfText(c,'GESAMTABRECHNUNG',356,800,18,true)
      pdfText(c,`Rechnungsnummer: ${number}`,382,778,9)
      pdfText(c,`Rechnungsdatum: ${new Date().toLocaleDateString('de-DE')}`,382,764,9)
      pdfText(c,`Zeitraum: ${performancePeriod}`,356,750,8)
      pdfText(c,'Abrechnung fuer',45,700,9,true)
      pdfText(c,user.name||'',45,684,11,true)
      pdfText(c,`User-ID: ${user.user_key||''}`,45,668,9)
      if(user.email) pdfText(c,user.email,45,652,9)
    } else {
      pdfText(c,`Gesamtabrechnung ${number} - Fortsetzung`,45,724,12,true)
    }
    const top=pageIndex===0?605:690
    pdfRule(c,45,top+16,550,top+16,1)
    pdfText(c,'Produkt / Kategorie',48,top+3,9,true)
    pdfText(c,'Menge',345,top+3,9,true)
    pdfText(c,'Einzel',410,top+3,9,true)
    pdfText(c,'Summe',498,top+3,9,true)
    pdfRule(c,45,top-5,550,top-5,.6)
    let y=top-23
    chunk.forEach(row=>{
      const title=pdfAscii(`${row.product_name} (${row.category_title||'Ohne Kategorie'})`).slice(0,50)
      pdfText(c,title,48,y,8.5)
      pdfText(c,String(row.quantity),358,y,8.5)
      pdfText(c,money(row.unit_price),410,y,8.5)
      pdfText(c,money(row.total),498,y,8.5)
      y-=22; pdfRule(c,45,y+7,550,y+7,.25)
    })
    if(pageIndex===chunks.length-1){
      y=Math.max(y-15,115)
      pdfText(c,'Kaeufe gesamt',390,y,9); pdfText(c,money(purchases),498,y,9)
      y-=17; pdfText(c,'Bestaetigte Zahlungen',390,y,9); pdfText(c,`- ${money(payments)}`,498,y,9)
      if(adjustments!==0){ y-=17; pdfText(c,'Korrekturen',390,y,9); pdfText(c,money(adjustments),498,y,9) }
      y-=22; pdfRule(c,385,y+12,550,y+12,.7); pdfText(c,'Offener Betrag',390,y,11,true); pdfText(c,money(due),498,y,11,true)
      y-=28
      if(settings.invoice_tax_id) pdfText(c,`Steuerangabe: ${settings.invoice_tax_id}`,45,y,8)
      wrapPdfText(settings.invoice_payment_text||'Bitte den offenen Betrag zeitnah ausgleichen.',92).slice(0,3).forEach(line=>{y-=13;pdfText(c,line,45,y,8)})
      wrapPdfText(settings.invoice_footer||'Vielen Dank.',92).slice(0,2).forEach(line=>{y-=13;pdfText(c,line,45,y,8)})
    }
    pdfText(c,`Seite ${pageIndex+1} von ${chunks.length}`,485,25,8)
    return c.join('\n')
  })
  savePdf(makePdfBlob(pages),`Gesamtabrechnung_${number}.pdf`)
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

  return <div className="app"><header className="topbar"><div className="top-title"><img src="/icons/icon-192.png" alt="KioskFalke"/><div><strong>KioskFalke</strong><span>{session.name} · {session.user_key} · {isAdmin ? 'Admin' : 'User'}</span></div></div><div className="top-actions"><button className="ghost icon-button" onClick={toggleTheme} aria-label="Darkmode umschalten">{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="ghost icon-button" onClick={() => setSession(null)} aria-label="Abmelden"><LogOut size={18}/></button></div></header><main className={`content ${tab === 'admin' ? 'admin-content' : ''}`}>{tab === 'kiosk' && <Kiosk session={session}/>} {tab === 'dashboard' && <Dashboard session={session}/>} {tab === 'community' && <Community session={session} onSeen={()=>setNewsUnread(false)}/>} {tab === 'admin' && isAdmin && <Admin session={session}/>}</main><nav className="bottom-nav">{tabs.map(([key, Icon, label]) => <button key={key} className={tab===key?'active':''} onClick={()=>openTab(key)}><span className="nav-icon"><Icon size={21}/>{key === 'community' && newsUnread && <span className="news-pin" title="Neue News"><Pin size={13} fill="currentColor"/></span>}</span><span>{label}</span></button>)}</nav></div>
}

function TileImage({ src, label }) {
  return <div className="tile-bg">{src ? <img src={src} alt={label || 'Icon'} /> : <div className="tile-fallback">{(label || 'K').slice(0,1).toUpperCase()}</div>}<div className="tile-shade" /></div>
}
function Kiosk({ session }) {
  const [products, setProducts] = useState([]), [account, setAccount] = useState(null), [selected, setSelected] = useState(null), [busyId, setBusyId] = useState(null), [msg, setMsg] = useState(''), [error, setError] = useState('')
  const categories = useMemo(() => { const map = new Map(); products.forEach(p => { const id = p.category_id || 'none'; if (!map.has(id)) map.set(id, { id, title: p.category_title || 'Ohne Kategorie', icon_data_url: p.category_icon_data_url || '', count: 0 }); map.get(id).count++ }); return [...map.values()].sort((a,b)=>a.title.localeCompare(b.title)) }, [products])
  const shown = products.filter(p => (p.category_id || 'none') === selected?.id)
  const load = async () => {
    const [productRows, accountData] = await Promise.all([
      rpc('kiosk_products', actor(session)),
      rpc('kiosk_my_dashboard', {...actor(session), p_month:`${monthValue()}-01`}).catch(()=>rpc('kiosk_my_dashboard', actor(session)))
    ])
    setProducts(productRows); setAccount(accountData)
  }
  useEffect(()=>{ load().catch(e=>setError(e.message)) }, [])
  async function take(product) { setBusyId(product.id); setMsg(''); setError(''); try { const res = await rpc('kiosk_take_product', { ...actor(session), p_product_id: product.id, p_quantity: 1 }); setMsg(`${product.name} gebucht. Kontostand: ${money(res.balance)}${res.warning ? ' — ' + res.warning : ''}`) } catch(e){ setError(e.message) } finally { setBusyId(null) } }
  const blocked=Boolean(account?.purchase_blocked), request=account?.payment_request
  return <section><h2>{selected ? selected.title : 'Kategorien'}</h2>{selected && !blocked && <button className="secondary back" onClick={()=>setSelected(null)}><ArrowLeft size={18}/> Kategorien</button>}{blocked&&<div className="purchase-blocked"><CreditCard size={24}/><div><b>Einkauf vorübergehend gesperrt</b><p>Die offene Rechnung über {money(request?.amount)} muss zuerst per PayPal bezahlt und anschließend vom Admin bestätigt werden.</p></div></div>}{msg && <div className={msg.includes('50') ? 'warning' : 'notice'}>{msg}</div>}{error && <div className="error">{error}</div>}{!blocked&& !products.length && <Empty text="Noch keine aktiven Produkte."/>}{!blocked&&!selected && <div className="tile-grid">{categories.map(c => <button key={c.id} className="image-tile category-tile" onClick={()=>setSelected(c)}><TileImage src={c.icon_data_url} label={c.title}/><div className="tile-text"><span>{c.title}</span><small>{c.count} Produkte</small></div></button>)}</div>}{!blocked&&selected && <div className="tile-grid">{shown.map(p => <article className="image-tile product-tile" key={p.id}><TileImage src={p.icon_data_url} label={p.name}/><div className="tile-text"><span>{p.name}</span><small>{money(p.price)}{p.excluded_from_revenue ? ' · nicht im Umsatz' : ''}</small></div><button className="tile-action" disabled={busyId===p.id} onClick={()=>take(p)}><Plus size={18}/> Nehmen</button></article>)}</div>}</section>
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
  const [data, setData] = useState(null), [month,setMonth]=useState(monthValue()), [error, setError] = useState('')
  const load=async()=>{ setError(''); try{ setData(await rpc('kiosk_my_dashboard',{...actor(session),p_month:`${month}-01`})) }catch(e){ try{setData(await rpc('kiosk_my_dashboard',actor(session)))}catch{setError(e.message)} } }
  useEffect(()=>{ load() }, [month])
  async function dismissNotification(id){
    try{ await rpc('kiosk_mark_notification_read',{...actor(session),p_notification_id:id}); setData(current=>({...current,notifications:(current.notifications||[]).filter(n=>n.id!==id)})) }
    catch(e){ setError(e.message) }
  }
  if (error) return <div className="error">{error}</div>; if (!data) return <Empty text="Lade Konto…" />
  const bal = Number(data.balance || 0), request=data.payment_request, requested=Number(request?.amount||0), payUrl=request ? paypalMeAmountLink(data.paypal_me,requested) : paypalMeLink(data.paypal_me,bal)
  return <section><div className="account-heading"><div><span className="eyebrow">Kontoverlauf</span><h2>Mein Konto</h2></div><label className="month-picker"><CalendarDays size={17}/><input type="month" value={month} onChange={e=>setMonth(e.target.value||monthValue())} aria-label="Journal-Monat"/></label></div>{request&&<div className="invoice-demand"><div className="invoice-demand-copy"><FileText size={25}/><div><span className="eyebrow">Offene Rechnung</span><b>Rechnung über {money(requested)} bezahlen</b><p>{request.note||'Bitte begleiche den angeforderten Betrag per PayPal.'} Bis der Admin den Eingang bestätigt, bleibt der Kiosk gesperrt.</p><small>Gesendet am {dateTime(request.created_at)}</small></div></div>{payUrl?<a className="pay-link" href={payUrl} target="_blank" rel="noreferrer"><CreditCard size={19}/> {money(requested)} mit PayPal bezahlen</a>:<small className="muted">PayPal.Me wurde vom Admin noch nicht hinterlegt.</small>}</div>}{(data.notifications||[]).map(n=><div className="payment-notice" key={n.id}><div><CheckCircle2 size={22}/><div><b>{n.title}</b><p>{n.message}</p><small>{dateTime(n.created_at)}</small></div></div><button className="secondary smallbtn" onClick={()=>dismissNotification(n.id)}>Gelesen</button></div>)}<div className="card hero"><span>Aktueller Kontostand</span><strong className={bal < 0 ? 'bad' : bal > 0 ? 'good' : ''}>{money(bal)}</strong><p>{data.pay_info}</p>{!request&&bal < 0 && payUrl && <a className="pay-link" href={payUrl} target="_blank" rel="noreferrer"><CreditCard size={19}/> Mit PayPal.Me bezahlen</a>}{!request&&bal < 0 && !payUrl && <small className="muted">PayPal.Me wurde vom Admin noch nicht hinterlegt.</small>}</div>{bal <= -50 && !request && <div className="warning">Dein Konto ist über 50 € im Minus. Bitte zeitnah bezahlen.</div>}<div className="stats"><Stat title="Monat" value={data.month_label||monthLabel(month)}/><Stat title="Entnahmen" value={money(data.month_spent)}/><Stat title="Zahlungen/Korrekturen" value={money(Number(data.month_payments||0)+Number(data.month_adjustments||0))}/></div><h3>Journal {data.month_label||monthLabel(month)}</h3><div className="list">{(data.month_items || []).length ? data.month_items.map(r => <article className="card listitem" key={r.id}><div className="product-info"><IconImg src={r.icon_data_url} label={r.product_name} size="sm"/><div><b>{r.product_name}</b><span>{r.category_title || 'Ohne Kategorie'} · {r.quantity}× · {money(r.total)} · {dateTime(r.created_at)}</span></div></div></article>) : <Empty text={`Keine Einträge im ${data.month_label||monthLabel(month)}.`}/>}</div></section>
}

function Admin({ session }) {
  const [view,setView]=useState('overview'), [month,setMonth]=useState(monthValue()), [commerce,setCommerce]=useState(null), [commerceError,setCommerceError]=useState(''), [commerceBusy,setCommerceBusy]=useState(false)
  const views=[
    ['overview',LayoutDashboard,'Dashboard'],
    ['sales',ShoppingBasket,'Verkäufe'],
    ['invoices',FileText,'Rechnungen'],
    ['users',Users,'User'],
    ['products',Package,'Produkte'],
    ['categories',FolderTree,'Kategorien'],
    ['analysis',BarChart3,'Analyse'],
    ['settings',SlidersHorizontal,'Einstellungen']
  ]
  async function loadCommerce(){
    setCommerceBusy(true); setCommerceError('')
    try{ setCommerce(await rpc('kiosk_admin_desktop_dashboard',{...actor(session),p_month:`${month}-01`})) }
    catch(e){ setCommerceError(e.message.includes('kiosk_admin_desktop_dashboard') ? 'Die Desktop-Admin-Migration V9 muss zuerst in Supabase ausgeführt werden.' : e.message) }
    finally{ setCommerceBusy(false) }
  }
  useEffect(()=>{ if(['overview','sales','invoices'].includes(view)) loadCommerce() },[month,view])
  return <section className="admin-workspace">
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand"><span>Administration</span><strong>KioskFalke</strong></div>
      <nav>{views.map(([key,Icon,label])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}><Icon size={18}/><span>{label}</span></button>)}</nav>
    </aside>
    <div className="admin-main">
      <div className="admin-mobile-nav segmented wrap">{views.map(([key,Icon,label])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}><Icon size={17}/>{label}</button>)}</div>
      {['overview','sales'].includes(view) && <AdminMonthToolbar month={month} setMonth={setMonth} busy={commerceBusy} onRefresh={loadCommerce}/>} 
      {view==='invoices' && <AdminInvoiceToolbar busy={commerceBusy} onRefresh={loadCommerce}/>} 
      {commerceError && ['overview','sales','invoices'].includes(view) && <div className="error">{commerceError}</div>}
      {view==='overview' && <AdminDashboardView data={commerce} busy={commerceBusy} onNavigate={setView}/>} 
      {view==='sales' && <AdminSales data={commerce} busy={commerceBusy}/>} 
      {view==='invoices' && <AdminInvoices data={commerce} busy={commerceBusy} session={session} onRefresh={loadCommerce}/>} 
      {view==='settings' && <AdminSettings session={session}/>} 
      {view==='categories' && <AdminCategories session={session}/>} 
      {view==='products' && <AdminProducts session={session}/>} 
      {view==='users' && <AdminUsers session={session}/>} 
      {view==='analysis' && <AdminAnalysis session={session}/>} 
    </div>
  </section>
}

function AdminMonthToolbar({month,setMonth,busy,onRefresh}){
  return <div className="admin-page-head"><div><span className="eyebrow">Desktop-Verwaltung</span><h2>{monthLabel(month)}</h2></div><div className="admin-toolbar"><label className="month-picker"><CalendarDays size={17}/><input type="month" value={month} onChange={e=>setMonth(e.target.value || monthValue())} aria-label="Abrechnungsmonat"/></label><button className="secondary icon-button" onClick={onRefresh} disabled={busy} aria-label="Daten aktualisieren"><RefreshCw size={18}/></button></div></div>
}

function AdminInvoiceToolbar({busy,onRefresh}){
  return <div className="admin-page-head"><div><span className="eyebrow">Rechnungsverwaltung</span><h2>Gesamter Zeitraum</h2></div><div className="admin-toolbar"><span className="status-pill ready">Vollständige Historie</span><button className="secondary icon-button" onClick={onRefresh} disabled={busy} aria-label="Daten aktualisieren"><RefreshCw size={18}/></button></div></div>
}

function AdminDashboardView({data,busy,onNavigate}){
  if(!data && busy) return <Empty text="Lade Desktop-Dashboard…"/>
  if(!data) return null
  const s=data.summary||{}, debtors=[...(data.invoices||[])].filter(u=>Number(u.balance)<0).sort((a,b)=>Number(a.balance)-Number(b.balance)).slice(0,6)
  return <div className="admin-dashboard stack">
    <div className="admin-kpis">
      <Stat title="Monatsumsatz" value={money(s.revenue)}/>
      <Stat title="Verkäufe" value={s.sales_count||0}/>
      <Stat title="Verkaufte Einheiten" value={s.units||0}/>
      <Stat title="Offene User-Salden" value={money(s.open_balance)} tone={Number(s.open_balance)>0?'bad':''}/>
    </div>
    <div className="dashboard-grid">
      <section className="card dashboard-panel"><div className="panel-heading"><div><h3>Top-Produkte</h3><p>Nach Umsatz im ausgewählten Monat</p></div><button className="ghost smallbtn" onClick={()=>onNavigate('sales')}>Alle Verkäufe</button></div><div className="rank-list">{(data.top_products||[]).length ? data.top_products.map((p,index)=><div className="rank-row" key={p.id}><span className="rank-number">{index+1}</span><div><b>{p.name}</b><small>{p.category_title} · {p.units} Stück</small></div><strong>{money(p.revenue)}</strong></div>) : <Empty text="Keine Verkäufe in diesem Monat."/>}</div></section>
      <section className="card dashboard-panel"><div className="panel-heading"><div><h3>Offene Konten</h3><p>{s.debtors||0} User mit negativem Saldo</p></div><button className="ghost smallbtn" onClick={()=>onNavigate('users')}>User verwalten</button></div><div className="rank-list">{debtors.length ? debtors.map(u=><div className="rank-row" key={u.user_id}><div className="user-avatar">{(u.name||'U').slice(0,1).toUpperCase()}</div><div><b>{u.name}</b><small>{u.user_key} · Käufe gesamt {money(u.total_sales)}</small></div><strong className="bad">{money(u.balance)}</strong></div>) : <Empty text="Keine offenen Konten."/>}</div></section>
    </div>
    <section className="card dashboard-panel"><div className="panel-heading"><div><h3>Letzte Verkäufe</h3><p>Die neuesten Buchungen des Monats</p></div><button className="ghost smallbtn" onClick={()=>onNavigate('invoices')}>Rechnungslauf</button></div><SalesTable rows={(data.sales||[]).slice(0,8)} compact/></section>
  </div>
}

function SalesTable({rows,compact=false}){
  if(!rows.length) return <Empty text="Keine Verkäufe gefunden."/>
  return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Zeitpunkt</th><th>User</th><th>Produkt</th><th>Kategorie</th><th className="num">Menge</th><th className="num">Betrag</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{compact ? new Date(row.created_at).toLocaleDateString('de-DE') : dateTime(row.created_at)}</td><td><b>{row.user_name}</b><small>{row.user_key}</small></td><td>{row.product_name}</td><td>{row.category_title}</td><td className="num">{row.quantity}</td><td className="num"><strong>{money(row.total)}</strong>{row.excluded_from_revenue&&<small>nicht im Umsatz</small>}</td></tr>)}</tbody></table></div>
}

function AdminSales({data,busy}){
  const [query,setQuery]=useState(''), [user,setUser]=useState('all')
  if(!data && busy) return <Empty text="Lade Verkäufe…"/>
  if(!data) return null
  const users=[...new Map((data.sales||[]).map(s=>[s.user_id,{id:s.user_id,name:s.user_name}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'de'))
  const needle=query.trim().toLowerCase()
  const rows=(data.sales||[]).filter(s=>(user==='all'||s.user_id===user)&&(!needle||`${s.user_name} ${s.user_key} ${s.product_name} ${s.category_title}`.toLowerCase().includes(needle)))
  const total=rows.reduce((sum,r)=>sum+Number(r.total||0),0), units=rows.reduce((sum,r)=>sum+Number(r.quantity||0),0)
  return <div className="stack"><div className="card filter-bar"><label className="search-field"><Search size={18}/><input placeholder="User, Produkt oder Kategorie suchen" value={query} onChange={e=>setQuery(e.target.value)}/></label><select value={user} onChange={e=>setUser(e.target.value)}><option value="all">Alle User</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div><div className="admin-kpis compact-kpis"><Stat title="Gefundene Verkäufe" value={rows.length}/><Stat title="Einheiten" value={units}/><Stat title="Summe" value={money(total)}/></div><section className="card dashboard-panel"><SalesTable rows={rows}/></section></div>
}

function AdminInvoices({data,busy,session,onRefresh}){
  const [query,setQuery]=useState(''), [onlyOpen,setOnlyOpen]=useState(true), [draft,setDraft]=useState(null), [message,setMessage]=useState(''), [actionBusy,setActionBusy]=useState(false)
  if(!data && busy) return <Empty text="Lade Rechnungen…"/>
  if(!data) return null
  const needle=query.trim().toLowerCase(), settings=data.settings||{}
  const rows=(data.invoices||[]).filter(u=>(!onlyOpen||Number(u.balance)<0||u.payment_request_id)&&(!needle||`${u.name} ${u.user_key} ${u.email}`.toLowerCase().includes(needle)))
  const openTotal=rows.reduce((sum,u)=>sum+(u.payment_request_id?Number(u.requested_amount||0):Math.max(0,-Number(u.balance||0))),0)
  const settingsReady=Boolean(settings.invoice_issuer)
  function startRequest(user){ setMessage(''); setDraft({userId:user.user_id,name:user.name,amount:Math.max(0,-Number(user.balance||0)).toFixed(2),note:`Bitte Rechnung über ${money(Math.max(0,-Number(user.balance||0)))} per PayPal bezahlen.`}) }
  async function sendRequest(e){ e.preventDefault(); setActionBusy(true); setMessage(''); try{ await rpc('kiosk_admin_create_payment_request',{...actor(session),p_user_id:draft.userId,p_amount:Number(draft.amount),p_note:draft.note}); setDraft(null); setMessage(`Forderung über ${money(draft.amount)} gesendet. Der Kiosk dieses Users ist jetzt gesperrt.`); await onRefresh() }catch(error){setMessage(error.message)}finally{setActionBusy(false)} }
  async function confirmPayment(user){ if(!confirm(`PayPal-Zahlung über ${money(user.requested_amount)} geprüft, gutschreiben und Kiosk freigeben?`))return; setActionBusy(true); setMessage(''); try{const result=await rpc('kiosk_admin_confirm_payment_request',{...actor(session),p_request_id:user.payment_request_id,p_note:'PayPal-Zahlung geprüft'}); setMessage(`${money(result.amount)} bestätigt und gutgeschrieben. ${user.name} kann wieder einkaufen.`); await onRefresh()}catch(error){setMessage(error.message)}finally{setActionBusy(false)} }
  async function cancelRequest(user){ if(!confirm(`Forderung für ${user.name} wirklich zurücknehmen und Kiosk ohne Gutschrift freigeben?`))return; setActionBusy(true); setMessage(''); try{await rpc('kiosk_admin_cancel_payment_request',{...actor(session),p_request_id:user.payment_request_id}); setMessage(`Forderung zurückgenommen. ${user.name} kann wieder einkaufen.`); await onRefresh()}catch(error){setMessage(error.message)}finally{setActionBusy(false)} }
  return <div className="stack">
    {!settingsReady&&<div className="warning">Bitte unter Einstellungen mindestens den Rechnungsabsender hinterlegen.</div>}
    <div className="info-banner"><FileText size={20}/><div><b>Gesamtabrechnung und verbindliche Forderung</b><p>Die PDF zeigt die vollständige Historie. Mit „Forderung senden“ erhält der User eine Zahlungsmitteilung und wird bis zur bestätigten PayPal-Zahlung für weitere Einkäufe gesperrt.</p></div></div>
    {message&&<div className={message.includes('gesendet')||message.includes('bestätigt')||message.includes('zurückgenommen')?'notice':'error'}>{message}</div>}
    {draft&&<form className="card invoice-request-form" onSubmit={sendRequest}><div><span className="eyebrow">Forderung an {draft.name}</span><h3>Rechnung mit Zahlungsaufforderung senden</h3><p>Nach dem Senden bleibt der Kiosk für diesen User gesperrt, bis du die PayPal-Zahlung bestätigst.</p></div><label><span>Geforderter Betrag</span><input autoFocus type="number" min="0.01" step="0.01" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})}/></label><label><span>Mitteilung</span><textarea rows={3} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label><div className="actions"><button disabled={actionBusy||Number(draft.amount)<=0}><Send size={17}/> Forderung senden</button><button type="button" className="secondary" onClick={()=>setDraft(null)}>Abbrechen</button></div></form>}
    <div className="card filter-bar"><label className="search-field"><Search size={18}/><input placeholder="User oder User_ID suchen" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="invoice-run-summary"><label className="check"><input type="checkbox" checked={onlyOpen} onChange={e=>setOnlyOpen(e.target.checked)}/> Nur offene Konten</label><span>{rows.length} User</span><strong>{money(openTotal)}</strong></div></div>
    <section className="card dashboard-panel"><div className="data-table-wrap"><table className="data-table invoice-table"><thead><tr><th>Abrechnung</th><th>User</th><th>Zeitraum</th><th className="num">Käufe</th><th className="num">Kaufsumme</th><th className="num">Zahlungen</th><th>Status / offen</th><th></th></tr></thead><tbody>{rows.map(u=>{const hasSales=Number(u.total_sales)>0,hasRequest=Boolean(u.payment_request_id); return <tr key={u.user_id}><td><b>{invoiceNumber(u.user_key)}</b><small>Gesamtabrechnung</small></td><td><b>{u.name}</b><small>{u.user_key}{u.email?` · ${u.email}`:''}</small></td><td>{periodLabel(u.first_purchase_at,u.last_purchase_at)}</td><td className="num">{u.sales_count} / {u.units} Stk.</td><td className="num"><strong>{money(u.total_sales)}</strong></td><td className="num">{money(u.total_payments)}</td><td>{hasRequest?<><span className="status-pill blocked">Kiosk gesperrt</span><small>Forderung {money(u.requested_amount)} · {dateTime(u.requested_at)}</small></>:<><strong className={Number(u.balance)<0?'bad':Number(u.balance)>0?'good':''}>{money(Math.max(0,-Number(u.balance||0)))}</strong><small>{Number(u.balance)<0?'noch keine Forderung':'ausgeglichen'}</small></>}</td><td><div className="table-actions invoice-actions"><button className="secondary smallbtn" disabled={!hasSales} onClick={()=>downloadInvoicePdf(u,data.invoice_sales||[],settings)}><Download size={16}/> PDF</button>{hasRequest?<><button className="smallbtn" disabled={actionBusy} onClick={()=>confirmPayment(u)}><CheckCircle2 size={16}/> Zahlung bestätigen</button><button className="danger smallbtn" disabled={actionBusy} onClick={()=>cancelRequest(u)}>Zurücknehmen</button></>:<button className="smallbtn" disabled={Number(u.balance)>=0||actionBusy} onClick={()=>startRequest(u)}><Send size={16}/> Forderung senden</button>}</div></td></tr>})}</tbody></table></div></section>
  </div>
}

function AdminSettings({ session }) {
  const emptyInvoice={invoice_issuer:'KioskFalke',invoice_address:'',invoice_email:'',invoice_tax_id:'',invoice_payment_text:'Bitte den offenen Betrag zeitnah ausgleichen.',invoice_footer:'Vielen Dank.'}
  const [paypal,setPaypal]=useState(''), [invoice,setInvoice]=useState(emptyInvoice), [msg,setMsg]=useState(''), [busy,setBusy]=useState(false)
  useEffect(()=>{ rpc('kiosk_admin_get_settings', actor(session)).then(d=>{setPaypal(d.paypal_me||'');setInvoice({...emptyInvoice,...d})}).catch(e=>setMsg(e.message)) }, [])
  async function savePaypal(e){ e.preventDefault(); setMsg(''); setBusy(true); try{ await rpc('kiosk_admin_set_paypal_me',{...actor(session),p_paypal_me:paypal}); setMsg('PayPal.Me-Adresse gespeichert.') }catch(e){ setMsg(e.message) }finally{setBusy(false)} }
  async function saveInvoice(e){ e.preventDefault(); setMsg(''); setBusy(true); try{ const d=await rpc('kiosk_admin_set_invoice_settings',{...actor(session),p_invoice_issuer:invoice.invoice_issuer,p_invoice_address:invoice.invoice_address,p_invoice_email:invoice.invoice_email,p_invoice_tax_id:invoice.invoice_tax_id,p_invoice_payment_text:invoice.invoice_payment_text,p_invoice_footer:invoice.invoice_footer}); setInvoice({...emptyInvoice,...d}); setMsg('Rechnungseinstellungen gespeichert.') }catch(e){ setMsg(e.message) }finally{setBusy(false)} }
  return <div className="settings-grid"><form className="card form" onSubmit={saveInvoice}><div><span className="eyebrow">PDF-Rechnungen</span><h2>Rechnungsabsender</h2></div><label><span>Absender / Organisation</span><input value={invoice.invoice_issuer} onChange={e=>setInvoice({...invoice,invoice_issuer:e.target.value})}/></label><label><span>Anschrift</span><textarea rows={4} placeholder={'Straße 1\n12345 Ort'} value={invoice.invoice_address} onChange={e=>setInvoice({...invoice,invoice_address:e.target.value})}/></label><div className="form-columns"><label><span>E-Mail</span><input type="email" value={invoice.invoice_email} onChange={e=>setInvoice({...invoice,invoice_email:e.target.value})}/></label><label><span>Steuerangabe optional</span><input placeholder="z. B. USt-IdNr." value={invoice.invoice_tax_id} onChange={e=>setInvoice({...invoice,invoice_tax_id:e.target.value})}/></label></div><label><span>Zahlungshinweis</span><textarea rows={3} value={invoice.invoice_payment_text} onChange={e=>setInvoice({...invoice,invoice_payment_text:e.target.value})}/></label><label><span>Fußzeile</span><input value={invoice.invoice_footer} onChange={e=>setInvoice({...invoice,invoice_footer:e.target.value})}/></label><button disabled={busy}><Save size={18}/> Rechnungseinstellungen speichern</button></form><form className="card form" onSubmit={savePaypal}><div><span className="eyebrow">Zahlungen</span><h2>PayPal.Me</h2></div><p className="muted">Der offene Betrag wird im Konto des Users automatisch an den PayPal.Me-Link angehängt.</p><input placeholder="z.B. kioskfalke oder https://paypal.me/kioskfalke" value={paypal} onChange={e=>setPaypal(e.target.value)} autoCapitalize="none"/><button disabled={busy}><Save size={18}/> PayPal.Me speichern</button>{msg&&<div className={msg.includes('gespeichert')?'notice':'error'}>{msg}</div>}</form></div>
}

function AdminCategories({ session }) {
  const [rows,setRows]=useState([]), [form,setForm]=useState({ title:'', icon_data_url:'', active:true }), [edit,setEdit]=useState(null), [msg,setMsg]=useState(''), [query,setQuery]=useState('')
  const load=async()=>setRows(await rpc('kiosk_admin_categories',actor(session))); useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  function startEdit(c){ setEdit(c.id); setForm({ title:c.title, icon_data_url:c.icon_data_url||'', active:c.active }); window.scrollTo({top:0,behavior:'smooth'}) }
  async function save(e){ e.preventDefault(); setMsg(''); try{await rpc('kiosk_admin_upsert_category',{...actor(session),p_category_id:edit,p_title:form.title,p_icon_data_url:form.icon_data_url,p_active:form.active}); setForm({title:'',icon_data_url:'',active:true}); setEdit(null); await load(); setMsg('Kategorie gespeichert.')}catch(error){setMsg(error.message)} }
  async function del(c){ if(confirm(`Kategorie "${c.title}" löschen/deaktivieren? Produkte bleiben erhalten.`)){ await rpc('kiosk_admin_delete_category',{...actor(session),p_category_id:c.id}); await load()} }
  const needle=query.trim().toLowerCase(), shown=rows.filter(c=>!needle||c.title.toLowerCase().includes(needle))
  return <div className="stack"><form className="card form admin-editor compact-editor" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">Sortiment strukturieren</span><h2>{edit?'Kategorie bearbeiten':'Kategorie schnell anlegen'}</h2></div>{edit&&<button type="button" className="secondary smallbtn" onClick={()=>{setEdit(null);setForm({title:'',icon_data_url:'',active:true})}}>Abbrechen</button>}</div><div className="quick-create-row"><input autoFocus placeholder="Titel, z. B. Softgetränke" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><label className="check editor-check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Aktiv</label><button disabled={!form.title.trim()}><FolderTree size={18}/> {edit?'Speichern':'Anlegen'}</button></div><details className="optional-settings"><summary>Optionales Kategorie-Icon</summary><ImageInput value={form.icon_data_url} onChange={v=>setForm({...form,icon_data_url:v})}/></details>{msg&&<div className={msg.includes('gespeichert')?'notice':'error'}>{msg}</div>}</form><div className="card filter-bar"><label className="search-field"><Search size={18}/><input placeholder="Kategorie suchen" value={query} onChange={e=>setQuery(e.target.value)}/></label><span className="muted">{shown.length} von {rows.length} Kategorien</span></div><section className="card dashboard-panel"><div className="data-table-wrap"><table className="data-table category-table"><thead><tr><th>Kategorie</th><th>Status</th><th></th></tr></thead><tbody>{shown.map(c=><tr key={c.id}><td><div className="table-product"><IconImg src={c.icon_data_url} label={c.title} size="sm"/><b>{c.title}</b></div></td><td><span className={`status-pill ${c.active?'ready':'missing'}`}>{c.active?'Aktiv':'Inaktiv'}</span></td><td><div className="table-actions"><button className="secondary smallbtn" onClick={()=>startEdit(c)}><Edit3 size={15}/> Edit</button><button className="danger smallbtn" onClick={()=>del(c)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div></section></div>
}
function AdminProducts({ session }) {
  const empty={name:'',description:'',price:'',category_id:'',active:true,icon_data_url:'',excluded_from_revenue:false}
  const [rows,setRows]=useState([]), [cats,setCats]=useState([]), [form,setForm]=useState(empty), [edit,setEdit]=useState(null), [msg,setMsg]=useState(''), [query,setQuery]=useState(''), [categoryFilter,setCategoryFilter]=useState('all'), [quickCategory,setQuickCategory]=useState('')
  const load=async()=>{ setRows(await rpc('kiosk_admin_products',actor(session))); setCats(await rpc('kiosk_admin_categories',actor(session))) }; useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  function startEdit(p){ setEdit(p.id); setForm({name:p.name,description:p.description||'',price:p.price,category_id:p.category_id||'',active:p.active,icon_data_url:p.icon_data_url||'',excluded_from_revenue:!!p.excluded_from_revenue}); window.scrollTo({top:0,behavior:'smooth'}) }
  function duplicate(p){ setEdit(null); setForm({name:`${p.name} Kopie`,description:p.description||'',price:p.price,category_id:p.category_id||'',active:true,icon_data_url:p.icon_data_url||'',excluded_from_revenue:!!p.excluded_from_revenue}); window.scrollTo({top:0,behavior:'smooth'}) }
  async function addQuickCategory(){ const title=quickCategory.trim(); if(!title)return; try{const id=await rpc('kiosk_admin_upsert_category',{...actor(session),p_category_id:null,p_title:title,p_icon_data_url:'',p_active:true}); setQuickCategory(''); await load(); setForm(current=>({...current,category_id:id})); setMsg(`Kategorie „${title}“ angelegt und ausgewählt.`)}catch(error){setMsg(error.message)} }
  async function save(e){ e.preventDefault(); setMsg(''); try{ await rpc('kiosk_admin_upsert_product',{...actor(session),p_product_id:edit,p_name:form.name,p_description:form.description,p_price:Number(form.price),p_category_id:form.category_id||null,p_active:form.active,p_icon_data_url:form.icon_data_url,p_excluded_from_revenue:form.excluded_from_revenue}); setForm(empty); setEdit(null); await load(); setMsg('Produkt gespeichert.') }catch(error){setMsg(error.message)} }
  async function del(p){ if(confirm(`Produkt "${p.name}" löschen/deaktivieren?`)){ try{await rpc('kiosk_admin_delete_product',{...actor(session),p_product_id:p.id}); await load()}catch(error){setMsg(error.message)} } }
  const needle=query.trim().toLowerCase(), shown=rows.filter(p=>(categoryFilter==='all'||p.category_id===categoryFilter)&&(!needle||`${p.name} ${p.description} ${p.category_title}`.toLowerCase().includes(needle)))
  return <div className="stack"><form className="card form admin-editor" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">Sortiment</span><h2>{edit?'Produkt bearbeiten':'Produkt schnell anlegen'}</h2></div>{(edit||form.name)&&<button type="button" className="secondary smallbtn" onClick={()=>{setEdit(null);setForm(empty)}}>Zurücksetzen</button>}</div><div className="product-core-grid"><label><span>Produktname</span><input autoFocus placeholder="z. B. Cola" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label><span>Preis</span><input placeholder="1,00" type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label><span>Kategorie</span><select value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">Kategorie wählen</option>{cats.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><button disabled={!form.name.trim()||form.price===''||!form.category_id}><Package size={18}/> {edit?'Speichern':'Produkt anlegen'}</button></div><div className="quick-category-row"><input placeholder="Neue Kategorie direkt anlegen" value={quickCategory} onChange={e=>setQuickCategory(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addQuickCategory()}}}/><button type="button" className="secondary" disabled={!quickCategory.trim()} onClick={addQuickCategory}><Plus size={17}/> Kategorie anlegen</button></div><details className="optional-settings"><summary>Weitere Produktdetails</summary><div className="optional-settings-body"><label><span>Beschreibung</span><input placeholder="Optional" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><div className="editor-options"><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Aktiv</label><label className="check"><input type="checkbox" checked={form.excluded_from_revenue} onChange={e=>setForm({...form,excluded_from_revenue:e.target.checked})}/> Nicht im Umsatz</label></div><ImageInput value={form.icon_data_url} onChange={v=>setForm({...form,icon_data_url:v})}/></div></details>{msg&&<div className={msg.includes('gespeichert')||msg.includes('angelegt')?'notice':'error'}>{msg}</div>}</form><div className="card product-filter-bar"><label className="search-field"><Search size={18}/><input placeholder="Produkt oder Kategorie suchen" value={query} onChange={e=>setQuery(e.target.value)}/></label><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">Alle Kategorien</option>{cats.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><span className="muted">{shown.length} von {rows.length}</span></div><section className="card dashboard-panel"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Produkt</th><th>Kategorie</th><th className="num">Preis</th><th>Status</th><th>Umsatz</th><th></th></tr></thead><tbody>{shown.map(p=><tr key={p.id}><td><div className="table-product"><IconImg src={p.icon_data_url} label={p.name} size="sm"/><div><b>{p.name}</b><small>{p.description||'Keine Beschreibung'}</small></div></div></td><td>{p.category_title||'Ohne Kategorie'}</td><td className="num"><strong>{money(p.price)}</strong></td><td><span className={`status-pill ${p.active?'ready':'missing'}`}>{p.active?'Aktiv':'Inaktiv'}</span></td><td>{p.excluded_from_revenue?<span className="status-pill missing">Ausgeschlossen</span>:<span className="status-pill ready">Enthalten</span>}</td><td><div className="table-actions"><button className="secondary smallbtn" onClick={()=>duplicate(p)}><Plus size={15}/> Kopie</button><button className="secondary smallbtn" onClick={()=>startEdit(p)}><Edit3 size={15}/> Edit</button><button className="danger smallbtn" onClick={()=>del(p)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div></section></div>
}

function AdminUsers({ session }) {
  const empty={user_key:'',name:'',role:'user',code:'',active:true,email:''}
  const [rows,setRows]=useState([]), [form,setForm]=useState(empty), [edit,setEdit]=useState(null), [selected,setSelected]=useState(null), [msg,setMsg]=useState(''), [query,setQuery]=useState('')
  const load=async()=>setRows(await rpc('kiosk_admin_users',actor(session))); useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  function startEdit(u){ setEdit(u.id); setForm({user_key:u.user_key,name:u.name,role:u.role,code:'',active:u.active,email:u.email||''}); window.scrollTo({top:0,behavior:'smooth'}) }
  async function save(e){ e.preventDefault(); setMsg(''); try{ await rpc('kiosk_admin_upsert_user',{...actor(session),p_user_id:edit,p_user_key:form.user_key,p_name:form.name,p_role:form.role,p_code:form.code,p_active:form.active,p_email:form.email}); setForm(empty); setEdit(null); await load(); setMsg('User gespeichert.') }catch(error){setMsg(error.message)} }
  async function del(u){ const code = u.role==='admin' ? prompt('Admin löschen: Sicherheitscode eingeben') : ''; if(u.role==='admin' && code===null) return; if(confirm(`${u.name} löschen/deaktivieren? Nur bei Kontostand 0 möglich.`)){ try{ await rpc('kiosk_admin_delete_user',{...actor(session),p_user_id:u.id,p_drop_code:code||''}); await load() }catch(e){alert(e.message)} } }
  const needle=query.trim().toLowerCase(), shown=rows.filter(u=>!needle||`${u.name} ${u.user_key} ${u.email}`.toLowerCase().includes(needle))
  return <div className="stack"><form className="card form admin-editor" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">Benutzerverwaltung</span><h2>{edit?'User bearbeiten':'User anlegen'}</h2><p>Name, User-ID und Zugangscode reichen für die digitale Strichliste aus.</p></div>{edit&&<button type="button" className="secondary smallbtn" onClick={()=>{setEdit(null);setForm(empty)}}>Abbrechen</button>}</div><div className="form-columns"><label><span>User_ID</span><input placeholder="z. B. max01" value={form.user_key} onChange={e=>setForm({...form,user_key:e.target.value})}/></label><label><span>Name</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label><span>Rolle</span><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="user">User</option><option value="admin">Admin</option></select></label><label><span>{edit?'Neuer Zugangscode optional':'Zugangscode'}</span><input type="password" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></label><label><span>E-Mail optional</span><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label className="check editor-check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> User ist aktiv</label></div><button><Users size={18}/> {edit?'Änderungen speichern':'User anlegen'}</button>{msg&&<div className={msg.includes('gespeichert')?'notice':'error'}>{msg}</div>}</form><div className="card filter-bar"><label className="search-field"><Search size={18}/><input placeholder="User suchen" value={query} onChange={e=>setQuery(e.target.value)}/></label><span className="muted">{shown.length} von {rows.length} Usern</span></div><section className="card dashboard-panel"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Rolle</th><th>Kontakt</th><th>Status</th><th className="num">Kontostand</th><th></th></tr></thead><tbody>{shown.map(u=><tr key={u.id}><td><b>{u.name}</b><small>{u.user_key}</small></td><td>{u.role==='admin'?'Admin':'User'}</td><td>{u.email||<span className="muted">Nicht erforderlich</span>}</td><td><span className={`status-pill ${u.active?'ready':'missing'}`}>{u.active?'Aktiv':'Inaktiv'}</span></td><td className={`num ${Number(u.balance)<0?'bad':Number(u.balance)>0?'good':''}`}><strong>{money(u.balance)}</strong></td><td><div className="table-actions"><button className="secondary smallbtn" onClick={()=>setSelected(u.id)}><SlidersHorizontal size={15}/> Profil</button><button className="secondary smallbtn" onClick={()=>startEdit(u)}><Edit3 size={15}/> Edit</button><button className="danger smallbtn" onClick={()=>del(u)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div></section>{selected&&<UserProfile session={session} userId={selected} onClose={()=>{setSelected(null);load()}}/>}</div>
}
function UserProfile({ session, userId, onClose }) {
  const [data,setData]=useState(null), [pay,setPay]=useState({amount:'',note:''}), [adj,setAdj]=useState({amount:'',note:''}), [msg,setMsg]=useState('')
  const load=async()=>setData(await rpc('kiosk_admin_user_profile',{...actor(session),p_user_id:userId})); useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  async function addPayment(e){
    e.preventDefault(); const amount=Number(pay.amount)
    if(!confirm(`PayPal-Zahlung über ${money(amount)} geprüft und als Guthaben verbuchen?`)) return
    try{ const result=await rpc('kiosk_admin_add_payment',{...actor(session),p_user_id:userId,p_amount:amount,p_note:pay.note||'PayPal-Zahlung geprüft'}); setPay({amount:'',note:''}); setMsg(`${money(result.amount||amount)} bestätigt. Der User wurde benachrichtigt; neuer Kontostand: ${money(result.balance)}.`); await load() }
    catch(error){setMsg(error.message)}
  }
  async function addAdjustment(e){ e.preventDefault(); await rpc('kiosk_admin_add_adjustment',{...actor(session),p_user_id:userId,p_amount:Number(adj.amount),p_note:adj.note}); setAdj({amount:'',note:''}); await load() }
  async function delEntry(id){ const reason=prompt('Grund für Korrektur','Fehlbuchung'); if(reason!==null){ await rpc('kiosk_admin_delete_entry',{...actor(session),p_entry_id:id,p_reason:reason}); await load() } }
  if(!data) return <div className="modal"><div className="panel"><button className="ghost close" onClick={onClose}><X/></button><Empty text="Lade Profil…"/></div></div>
  const u=data.user
  const outstanding=Math.max(0,-Number(u.balance||0))
  return <div className="modal"><div className="panel"><button className="ghost close" onClick={onClose}><X/></button><h2>{u.name}</h2><div className="card hero"><span>{u.user_key} · {u.role}</span><strong className={Number(u.balance)<0?'bad':Number(u.balance)>0?'good':''}>{money(u.balance)}</strong></div>{msg&&<div className={msg.includes('bestätigt')?'notice':'error'}>{msg}</div>}<form className="card form payment-confirm-form" onSubmit={addPayment}><div><span className="eyebrow">Nach eigener PayPal-Prüfung</span><h3>Zahlung bestätigen & gutschreiben</h3><p className="muted">Erst bestätigen, wenn der Zahlungseingang geprüft wurde. Danach wird der Betrag dem Konto gutgeschrieben und der User erhält eine Mitteilung.</p></div><div className="payment-quick-row"><input type="number" min="0.01" step="0.01" placeholder="Betrag, z.B. 20" value={pay.amount} onChange={e=>setPay({...pay,amount:e.target.value})}/>{outstanding>0&&<button type="button" className="secondary" onClick={()=>setPay({...pay,amount:outstanding.toFixed(2)})}>Offen: {money(outstanding)}</button>}</div><input placeholder="Notiz optional" value={pay.note} onChange={e=>setPay({...pay,note:e.target.value})}/><button disabled={Number(pay.amount)<=0}><CheckCircle2 size={18}/> Geprüfte Zahlung bestätigen</button></form><form className="card form" onSubmit={addAdjustment}><h3>Konto-Korrektur (+/-)</h3><input type="number" step="0.01" placeholder="z.B. -5 oder 5" value={adj.amount} onChange={e=>setAdj({...adj,amount:e.target.value})}/><input placeholder="Grund" value={adj.note} onChange={e=>setAdj({...adj,note:e.target.value})}/><button><CheckCircle2 size={18}/> Korrektur speichern</button></form><div className="actions"><button className="secondary" onClick={()=>downloadStatementPdf(data)}><Download size={18}/> Kontoauszug PDF</button></div><h3>Produktbuchungen nach Monat.Jahr</h3><div className="list grouped-list">{data.entries.map(e=><article className="card row" key={e.id}><div><b>{e.product_name}</b><p><span className="month-badge">{monthKey(e.created_at)}</span> {e.category_title} · {money(e.total)} · {dateTime(e.created_at)} {e.deleted_at?'· gelöscht':''}</p></div>{!e.deleted_at&&<button className="danger" onClick={()=>delEntry(e.id)}>Fehlbuchung löschen</button>}</article>)}</div><h3>Zahlungen & Korrekturen</h3><div className="list">{(data.movements||[]).filter(m=>m.kind!=='entry').map(m=><article className="card row" key={m.kind+m.id}><div><b>{m.type_label}</b><p>{money(m.amount)} · {dateTime(m.created_at)} {m.note?'· '+m.note:''}</p></div></article>)}</div></div></div>
}
function AdminAnalysis({ session }) { const [data,setData]=useState(null), [msg,setMsg]=useState(''); useEffect(()=>{rpc('kiosk_admin_analysis',actor(session)).then(setData).catch(e=>setMsg(e.message))},[]); if(msg) return <div className="error">{msg}</div>; if(!data) return <Empty text="Lade Analyse…"/>; const max=Math.max(1,...(data.products||[]).map(p=>Number(p.month_revenue||0))); return <div className="stack"><div className="stats"><Stat title="Umsatz Monat" value={money(data.summary.month_revenue)}/><Stat title="Einheiten Monat" value={data.summary.month_units}/><Stat title="Umsatz gesamt" value={money(data.summary.all_revenue)}/></div><h3>Produkte</h3>{data.products.map(p=><article className="card analysis" key={p.name}><b>{p.name}</b><p>{p.category} · Monat: {p.month_units} Stk. · {money(p.month_revenue)} {p.excluded_from_revenue?'· nicht im Umsatz':''}</p><div className="bar"><span style={{width:`${Math.max(3,Number(p.month_revenue||0)/max*100)}%`}}/></div></article>)}<h3>Kategorien</h3>{data.categories.map(c=><article className="card analysis" key={c.title}><b>{c.title}</b><p>Monat: {c.month_units} Stk. · {money(c.month_revenue)} · Gesamt: {money(c.all_revenue)}</p></article>)}</div> }

createRoot(document.getElementById('root')).render(<App />)
