import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BarChart3, CheckCircle2, ClipboardList, CreditCard, Edit3, FolderTree, LogOut, Package, Plus, ShoppingBasket, Trash2, UserRoundCog, Users, WalletCards, X } from 'lucide-react'
import { supabase } from './supabase'
import './styles.css'

const STORE_KEY = 'kioskfalke_session_v2'
const money = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))
const dateTime = (d) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
const currentMonth = () => new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

function useSession() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY) || 'null') } catch { return null }
  })
  const save = (next, remember = true) => {
    setSession(next)
    localStorage.removeItem(STORE_KEY); sessionStorage.removeItem(STORE_KEY)
    if (next) (remember ? localStorage : sessionStorage).setItem(STORE_KEY, JSON.stringify(next))
  }
  return [session, save]
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}
function actor(session) { return { p_actor_id: session.id, p_actor_code: session.code } }

function App() {
  const [session, setSession] = useSession()
  const [tab, setTab] = useState('kiosk')
  if (!session) return <Login onLogin={setSession} />
  return <Shell session={session} setSession={setSession} tab={tab} setTab={setTab} />
}

function Login({ onLogin }) {
  const [userKey, setUserKey] = useState('')
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const user = await rpc('kiosk_login', { p_user_key: userKey.trim(), p_code: code.trim() })
      if (!user?.id) throw new Error('User_ID oder Zugangscode falsch')
      onLogin({ ...user, code: code.trim() }, remember)
    } catch (e) { setError(e.message || 'Anmeldung fehlgeschlagen') }
    finally { setBusy(false) }
  }
  return <main className="login-screen"><section className="login-card">
    <div className="logo">K</div><h1>KioskFalke</h1><p>Privater Kiosk. Mit User_ID und Code anmelden.</p>
    <form onSubmit={submit} className="stack">
      <input autoFocus placeholder="User_ID" value={userKey} onChange={e=>setUserKey(e.target.value)} autoCapitalize="none" />
      <input placeholder="Zugangscode" type="password" value={code} onChange={e=>setCode(e.target.value)} />
      <label className="check"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} /> Eingeloggt bleiben</label>
      {error && <div className="error">{error}</div>}
      <button disabled={!userKey.trim() || !code.trim() || busy}>{busy ? 'Prüfe…' : 'Einloggen'}</button>
    </form>
    <p className="small">Hinweis: Offene Beträge bitte immer zum 1. eines Monats bezahlen.</p>
  </section></main>
}

function Shell({ session, setSession, tab, setTab }) {
  const isAdmin = session.role === 'admin'
  const tabs = [['kiosk', ShoppingBasket, 'Kiosk'], ['dashboard', WalletCards, 'Konto'], ...(isAdmin ? [['admin', UserRoundCog, 'Admin']] : [])]
  return <div className="app">
    <header className="topbar"><div><strong>KioskFalke</strong><span>{session.name} · {session.user_key} · {isAdmin ? 'Admin' : 'User'}</span></div><button className="ghost" onClick={() => setSession(null)}><LogOut size={18}/></button></header>
    <main className="content">{tab === 'kiosk' && <Kiosk session={session}/>} {tab === 'dashboard' && <Dashboard session={session}/>} {tab === 'admin' && isAdmin && <Admin session={session}/>}</main>
    <nav className="bottom-nav">{tabs.map(([key, Icon, label]) => <button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><Icon size={21}/><span>{label}</span></button>)}</nav>
  </div>
}

function Kiosk({ session }) {
  const [products, setProducts] = useState([]), [busyId, setBusyId] = useState(null), [msg, setMsg] = useState(''), [error, setError] = useState('')
  const grouped = useMemo(() => products.reduce((acc,p)=>{(acc[p.category_title||'Ohne Kategorie'] ||= []).push(p); return acc}, {}), [products])
  const load = async () => setProducts(await rpc('kiosk_products', actor(session)))
  useEffect(()=>{ load().catch(e=>setError(e.message)) }, [])
  async function take(product) {
    setBusyId(product.id); setMsg(''); setError('')
    try {
      const res = await rpc('kiosk_take_product', { ...actor(session), p_product_id: product.id, p_quantity: 1 })
      setMsg(`${product.name} gebucht. Kontostand: ${money(res.balance)}${res.warning ? ' — ' + res.warning : ''}`)
    } catch(e){ setError(e.message) } finally { setBusyId(null) }
  }
  return <section><h2>Produkte</h2>{msg && <div className={msg.includes('50') ? 'warning' : 'notice'}>{msg}</div>}{error && <div className="error">{error}</div>}
    {!products.length && <Empty text="Noch keine aktiven Produkte."/>}
    {Object.entries(grouped).map(([cat, rows]) => <div key={cat} className="category-block"><h3 className="category-title">{cat}</h3><div className="grid">{rows.map(p => <article className="card product" key={p.id}><div><h3>{p.name}</h3>{p.description && <p>{p.description}</p>}<b>{money(p.price)}</b></div><button disabled={busyId===p.id} onClick={()=>take(p)}><Plus size={18}/> Nehmen</button></article>)}</div></div>)}
  </section>
}

function Dashboard({ session }) {
  const [data, setData] = useState(null), [error, setError] = useState('')
  const load = async () => setData(await rpc('kiosk_my_dashboard', actor(session)))
  useEffect(()=>{ load().catch(e=>setError(e.message)) }, [])
  if (error) return <div className="error">{error}</div>
  if (!data) return <Empty text="Lade Konto…" />
  const balanceClass = Number(data.balance) < 0 ? 'bad' : Number(data.balance) > 0 ? 'good' : ''
  return <section><h2>Mein Konto</h2><div className="card hero"><span>Kontostand</span><strong className={balanceClass}>{money(data.balance)}</strong><p>{data.pay_info}</p></div>
    <div className="stats"><Stat title="Monat" value={data.month_label || currentMonth()} /><Stat title="Entnahmen" value={money(data.month_spent)} /><Stat title="Zahlungen" value={money(data.month_payments)} /></div>
    <h3>Journal aktueller Monat</h3><List rows={data.month_items || []} render={r => <><b>{r.product_name}</b><span>{r.category_title} · {r.quantity}× · {money(r.total)} · {dateTime(r.created_at)}</span></>} />
    <h3 className="mt">Zahlungen aktueller Monat</h3><List rows={data.month_payments_list || []} render={r => <><b>+ {money(r.amount)}</b><span>{r.note || 'Zahlung'} · {dateTime(r.created_at)}</span></>} />
  </section>
}

function Admin({ session }) {
  const [view, setView] = useState('overview')
  const views = [['overview','Übersicht'],['products','Produkte'],['categories','Kategorien'],['users','User'],['analysis','Analyse']]
  return <section><h2>Admin</h2><div className="segmented wrap">{views.map(v=><button key={v[0]} className={view===v[0]?'active':''} onClick={()=>setView(v[0])}>{v[1]}</button>)}</div>
    {view==='overview' && <AdminOverview session={session}/>} {view==='products' && <AdminProducts session={session}/>} {view==='categories' && <AdminCategories session={session}/>} {view==='users' && <AdminUsers session={session}/>} {view==='analysis' && <AdminAnalysis session={session}/>} </section>
}

function AdminOverview({ session }) {
  const [rows, setRows] = useState([]), [selected, setSelected] = useState(null), [msg, setMsg] = useState('')
  const load = async()=>setRows(await rpc('kiosk_admin_overview', actor(session)))
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  return <div className="stack">{msg&&<div className="error">{msg}</div>}{rows.map(r=><article className="card row" key={r.user_id}><div><h3>{r.name}</h3><p>{r.user_key} · {r.role} · Monat {money(r.month_spent)}</p><b className={Number(r.balance)<0?'bad':Number(r.balance)>0?'good':''}>Konto: {money(r.balance)}</b></div><button className="secondary" onClick={()=>setSelected(r.user_id)}><ClipboardList size={18}/> Profil</button></article>)}{selected&&<UserDetail session={session} userId={selected} onClose={()=>{setSelected(null);load()}}/>}</div>
}

function UserDetail({ session, userId, onClose }) {
  const [data,setData]=useState(null), [amount,setAmount]=useState(''), [note,setNote]=useState(''), [msg,setMsg]=useState('')
  const load=async()=>setData(await rpc('kiosk_admin_user_detail',{...actor(session),p_user_id:userId}))
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[userId])
  async function pay(e){e.preventDefault(); setMsg(''); try{await rpc('kiosk_admin_add_payment',{...actor(session),p_user_id:userId,p_amount:Number(amount),p_note:note}); setAmount(''); setNote(''); await load()}catch(e){setMsg(e.message)}}
  async function delEntry(id){if(!confirm('Fehlbuchung wirklich entfernen?'))return; await rpc('kiosk_admin_delete_entry',{...actor(session),p_entry_id:id,p_reason:'Fehlbuchung durch Admin korrigiert'}); await load()}
  if(!data) return <div className="modal"><div className="panel"><Empty text="Lade Profil…"/></div></div>
  return <div className="modal"><div className="panel"><button className="ghost close" onClick={onClose}><X size={18}/></button><h2>{data.user?.name}</h2><p className="muted">{data.user?.user_key} · Konto {money(data.user?.balance)}</p>{msg&&<div className="error">{msg}</div>}
    <form className="card form" onSubmit={pay}><h3>Zahlung erfassen</h3><input type="number" step="0.01" placeholder="Betrag z.B. 25.00" value={amount} onChange={e=>setAmount(e.target.value)}/><input placeholder="Notiz optional" value={note} onChange={e=>setNote(e.target.value)}/><button><CreditCard size={18}/> Zahlung speichern</button></form>
    <h3>Monatsjournal</h3><List rows={data.entries||[]} render={r => <><b className={r.deleted_at?'muted':''}>{r.product_name} {r.deleted_at?'(entfernt)':''}</b><span>{r.category_title} · {money(r.total)} · {dateTime(r.created_at)}</span>{!r.deleted_at && <button className="danger smallbtn" onClick={()=>delEntry(r.id)}><Trash2 size={16}/> Fehlbuchung entfernen</button>}</>} />
    <h3>Zahlungen</h3><List rows={data.payments||[]} render={r => <><b>+ {money(r.amount)}</b><span>{r.note || 'Zahlung'} · {dateTime(r.created_at)}</span></>} />
  </div></div>
}

function AdminCategories({ session }) {
  const [rows,setRows]=useState([]), [form,setForm]=useState({id:null,title:'',active:true}), [msg,setMsg]=useState('')
  const load=async()=>setRows(await rpc('kiosk_admin_categories',actor(session)))
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  async function save(e){e.preventDefault(); setMsg(''); try{await rpc('kiosk_admin_upsert_category',{...actor(session),p_category_id:form.id,p_title:form.title,p_active:form.active}); setForm({id:null,title:'',active:true}); await load()}catch(e){setMsg(e.message)}}
  async function del(id){if(confirm('Kategorie löschen? Produkte bleiben erhalten, aber ohne Kategorie.')){await rpc('kiosk_admin_delete_category',{...actor(session),p_category_id:id}); await load()}}
  return <div className="stack"><form className="card form" onSubmit={save}><h3>{form.id?'Kategorie bearbeiten':'Kategorie anlegen'}</h3><input placeholder="Titel z.B. Softgetränke" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> aktiv</label><button><FolderTree size={18}/> Speichern</button>{form.id&&<button type="button" className="secondary" onClick={()=>setForm({id:null,title:'',active:true})}>Abbrechen</button>}</form>{msg&&<div className="error">{msg}</div>}{rows.map(c=><article className="card row" key={c.id}><div><h3>{c.title}</h3><p>{c.product_count} Produkte · {c.active?'aktiv':'inaktiv'}</p></div><div className="actions"><button className="secondary" onClick={()=>setForm({id:c.id,title:c.title,active:c.active})}><Edit3 size={16}/></button><button className="danger" onClick={()=>del(c.id)}><Trash2 size={16}/></button></div></article>)}</div>
}

function AdminProducts({ session }) {
  const empty={id:null,name:'',description:'',price:'',category_id:'',active:true}
  const [rows,setRows]=useState([]), [cats,setCats]=useState([]), [form,setForm]=useState(empty), [msg,setMsg]=useState('')
  const load=async()=>{setRows(await rpc('kiosk_admin_products',actor(session))); setCats(await rpc('kiosk_admin_categories',actor(session)))}
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  async function save(e){e.preventDefault(); setMsg(''); try{await rpc('kiosk_admin_upsert_product',{...actor(session),p_product_id:form.id,p_name:form.name,p_description:form.description,p_price:Number(form.price),p_category_id:form.category_id||null,p_active:form.active}); setForm(empty); await load()}catch(e){setMsg(e.message)}}
  async function del(id){if(confirm('Produkt löschen? Bei bestehendem Journal wird es deaktiviert.')){await rpc('kiosk_admin_delete_product',{...actor(session),p_product_id:id}); await load()}}
  return <div className="stack"><form className="card form" onSubmit={save}><h3>{form.id?'Produkt bearbeiten':'Produkt anlegen'}</h3><input placeholder="Titel" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="Beschreibung" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><input placeholder="Preis z.B. 1.00" type="number" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/><select value={form.category_id||''} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">Ohne Kategorie</option>{cats.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> aktiv</label><button><Package size={18}/> Speichern</button>{form.id&&<button type="button" className="secondary" onClick={()=>setForm(empty)}>Abbrechen</button>}</form>{msg&&<div className="error">{msg}</div>}{rows.map(p=><article className="card row" key={p.id}><div><h3>{p.name}</h3><p>{p.description} · {p.category_title} · {p.active?'aktiv':'inaktiv'}</p><b>{money(p.price)}</b></div><div className="actions"><button className="secondary" onClick={()=>setForm({id:p.id,name:p.name,description:p.description||'',price:p.price,category_id:p.category_id||'',active:p.active})}><Edit3 size={16}/></button><button className="danger" onClick={()=>del(p.id)}><Trash2 size={16}/></button></div></article>)}</div>
}

function AdminUsers({ session }) {
  const empty={id:null,user_key:'',name:'',role:'user',code:'',active:true}
  const [rows,setRows]=useState([]), [form,setForm]=useState(empty), [msg,setMsg]=useState('')
  const load=async()=>setRows(await rpc('kiosk_admin_users',actor(session)))
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  async function save(e){e.preventDefault(); setMsg(''); try{await rpc('kiosk_admin_upsert_user',{...actor(session),p_user_id:form.id,p_user_key:form.user_key,p_name:form.name,p_role:form.role,p_code:form.code,p_active:form.active}); setForm(empty); await load()}catch(e){setMsg(e.message)}}
  async function del(u){let drop=''; if(u.role==='admin') drop=prompt('Admin löschen: Sicherheitscode eingeben') || ''; if(!confirm(`${u.name} wirklich löschen? Konto muss 0,00 € sein.`))return; try{await rpc('kiosk_admin_delete_user',{...actor(session),p_user_id:u.id,p_drop_code:drop}); await load()}catch(e){setMsg(e.message)}}
  return <div className="stack"><form className="card form" onSubmit={save}><h3>{form.id?'User bearbeiten':'User anlegen'}</h3><input placeholder="User_ID z.B. max01" value={form.user_key} onChange={e=>setForm({...form,user_key:e.target.value})}/><input placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="user">User</option><option value="admin">Admin</option></select><input placeholder={form.id?'Neuer Zugangscode optional':'Zugangscode'} value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> aktiv</label><button><Users size={18}/> Speichern</button>{form.id&&<button type="button" className="secondary" onClick={()=>setForm(empty)}>Abbrechen</button>}</form>{msg&&<div className="error">{msg}</div>}{rows.map(u=><article className="card row" key={u.id}><div><h3>{u.name}</h3><p>{u.user_key} · {u.role} · {u.active?'aktiv':'inaktiv'}</p><b className={Number(u.balance)<0?'bad':Number(u.balance)>0?'good':''}>Konto {money(u.balance)}</b></div><div className="actions"><button className="secondary" onClick={()=>setForm({id:u.id,user_key:u.user_key,name:u.name,role:u.role,code:'',active:u.active})}><Edit3 size={16}/></button><button className="danger" onClick={()=>del(u)}><Trash2 size={16}/></button></div></article>)}</div>
}

function AdminAnalysis({ session }) {
  const [data,setData]=useState(null), [mode,setMode]=useState('products'), [msg,setMsg]=useState('')
  useEffect(()=>{rpc('kiosk_admin_analysis',actor(session)).then(setData).catch(e=>setMsg(e.message))},[])
  if(msg) return <div className="error">{msg}</div>
  if(!data) return <Empty text="Lade Analyse…"/>
  const rows = mode==='products' ? data.products : data.categories
  return <div className="stack"><div className="stats"><Stat title="Monat" value={data.month_label}/><Stat title="Umsatz Monat" value={money(data.month_revenue)}/><Stat title="Umsatz Gesamt" value={money(data.total_revenue)}/></div><div className="segmented"><button className={mode==='products'?'active':''} onClick={()=>setMode('products')}>Produkte</button><button className={mode==='categories'?'active':''} onClick={()=>setMode('categories')}>Kategorien</button></div><div className="notice">Tipp: Produkte mit hoher Menge/Umsatz regelmäßig nachkaufen; Produkte mit 0 Verkäufen prüfen, ersetzen oder deaktivieren.</div>{rows.map((r,i)=><article className="card analysis" key={r.product_id||r.category_id||i}><div><h3>{i+1}. {r.name||r.title}</h3><p>{r.category || 'Kategorie'} · Monat: {r.month_qty} Stück / {money(r.month_revenue)}</p><p>Gesamt: {r.all_qty} Stück / {money(r.all_revenue)}</p></div><div className="bar"><span style={{width: `${Math.min(100, Number(r.month_revenue || 0) / Math.max(1, Number(data.month_revenue || 1)) * 100)}%`}} /></div></article>)}</div>
}

function Stat({title,value}){return <div className="stat"><span>{title}</span><b>{value}</b></div>}
function Empty({text}){return <div className="empty">{text}</div>}
function List({rows, render}){return <div className="list">{rows.length?rows.map((r,i)=><article className="card listitem" key={r.id||i}>{render(r)}</article>):<Empty text="Keine Einträge."/>}</div>}

createRoot(document.getElementById('root')).render(<App />)
