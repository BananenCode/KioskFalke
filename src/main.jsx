import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, ShoppingBasket, Users, CheckCircle2, LogOut, WalletCards, Package, Settings } from 'lucide-react'
import { supabase } from './supabase'
import './styles.css'

const STORE_KEY = 'kioskfalke_session_v1'
const money = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))

function useSession() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') } catch { return null }
  })
  const save = (next) => {
    setSession(next)
    if (next) localStorage.setItem(STORE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORE_KEY)
  }
  return [session, save]
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

function App() {
  const [session, setSession] = useSession()
  const [tab, setTab] = useState('kiosk')
  if (!session) return <Login onLogin={setSession} />
  return <Shell session={session} setSession={setSession} tab={tab} setTab={setTab} />
}

function Login({ onLogin }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const user = await rpc('kiosk_login', { p_code: code.trim() })
      if (!user?.id) throw new Error('Code nicht gefunden')
      onLogin({ ...user, code: code.trim() })
    } catch (e) { setError(e.message || 'Anmeldung fehlgeschlagen') }
    finally { setBusy(false) }
  }
  return <main className="login-screen">
    <section className="login-card">
      <div className="logo">K</div>
      <h1>KioskFalke</h1>
      <p>Privater Kiosk. Code eingeben und loslegen.</p>
      <form onSubmit={submit} className="stack">
        <input autoFocus inputMode="text" placeholder="Zugangscode" value={code} onChange={e=>setCode(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <button disabled={!code.trim() || busy}>{busy ? 'Prüfe…' : 'Einloggen'}</button>
      </form>
    </section>
  </main>
}

function Shell({ session, setSession, tab, setTab }) {
  const isAdmin = session.role === 'admin'
  const tabs = [
    ['kiosk', ShoppingBasket, 'Kiosk'], ['dashboard', WalletCards, 'Dashboard'],
    ...(isAdmin ? [['admin', Settings, 'Admin']] : [])
  ]
  return <div className="app">
    <header className="topbar">
      <div><strong>KioskFalke</strong><span>{session.name} · {isAdmin ? 'Admin' : 'User'}</span></div>
      <button className="ghost" onClick={() => setSession(null)}><LogOut size={18}/></button>
    </header>
    <main className="content">
      {tab === 'kiosk' && <Kiosk session={session}/>} 
      {tab === 'dashboard' && <Dashboard session={session}/>} 
      {tab === 'admin' && isAdmin && <Admin session={session}/>} 
    </main>
    <nav className="bottom-nav">{tabs.map(([key, Icon, label]) => <button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><Icon size={21}/><span>{label}</span></button>)}</nav>
  </div>
}

function Kiosk({ session }) {
  const [products, setProducts] = useState([]), [busyId, setBusyId] = useState(null), [msg, setMsg] = useState('')
  const load = async () => setProducts(await rpc('kiosk_products', { p_actor_id: session.id, p_actor_code: session.code }))
  useEffect(()=>{ load().catch(e=>setMsg(e.message)) }, [])
  async function take(product, qty=1) {
    setBusyId(product.id); setMsg('')
    try { await rpc('kiosk_take_product', { p_actor_id: session.id, p_actor_code: session.code, p_product_id: product.id, p_quantity: qty }); setMsg(`${product.name} gebucht.`) }
    catch(e){ setMsg(e.message) } finally { setBusyId(null) }
  }
  return <section><h2>Produkte</h2>{msg && <div className="notice">{msg}</div>}<div className="grid">{products.map(p => <article className="card product" key={p.id}><div><h3>{p.name}</h3><p>{money(p.price)}</p></div><button disabled={busyId===p.id} onClick={()=>take(p,1)}><Plus size={18}/> Nehmen</button></article>)}</div>{!products.length && <Empty text="Noch keine aktiven Produkte."/>}</section>
}

function Dashboard({ session }) {
  const [data, setData] = useState(null), [error, setError] = useState('')
  const load = async () => setData(await rpc('kiosk_my_dashboard', { p_actor_id: session.id, p_actor_code: session.code }))
  useEffect(()=>{ load().catch(e=>setError(e.message)) }, [])
  if (error) return <div className="error">{error}</div>
  if (!data) return <Empty text="Lade Dashboard…" />
  return <section><h2>Mein Dashboard</h2><div className="stats"><Stat title="Offen" value={money(data.open_total)} /><Stat title="Bezahlt" value={money(data.paid_total)} /><Stat title="Entnahmen" value={data.items_count} /></div><h3>Letzte Entnahmen</h3><List rows={data.recent_items || []} render={r => <><b>{r.product_name}</b><span>{r.quantity}× · {money(r.total)} · {new Date(r.created_at).toLocaleDateString('de-DE')}</span></>} /></section>
}

function Admin({ session }) {
  const [view, setView] = useState('overview')
  return <section><h2>Admin</h2><div className="segmented"><button className={view==='overview'?'active':''} onClick={()=>setView('overview')}>Übersicht</button><button className={view==='products'?'active':''} onClick={()=>setView('products')}>Produkte</button><button className={view==='users'?'active':''} onClick={()=>setView('users')}>User</button></div>{view==='overview' && <AdminOverview session={session}/>} {view==='products' && <AdminProducts session={session}/>} {view==='users' && <AdminUsers session={session}/>}</section>
}

function AdminOverview({ session }) {
  const [rows, setRows] = useState([]), [msg, setMsg] = useState('')
  const load = async()=>setRows(await rpc('kiosk_admin_overview',{p_actor_id:session.id,p_actor_code:session.code}))
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  async function markPaid(userId){await rpc('kiosk_admin_mark_paid',{p_actor_id:session.id,p_actor_code:session.code,p_user_id:userId}); await load()}
  return <div className="stack">{msg&&<div className="error">{msg}</div>}{rows.map(r=><article className="card row" key={r.user_id}><div><h3>{r.name}</h3><p>Offen: <b>{money(r.open_total)}</b> · Bezahlt: {money(r.paid_total)}</p></div><button disabled={Number(r.open_total)<=0} onClick={()=>markPaid(r.user_id)}><CheckCircle2 size={18}/> Bezahlt</button></article>)}</div>
}

function AdminProducts({ session }) {
  const [rows,setRows]=useState([]), [form,setForm]=useState({name:'',price:''}), [msg,setMsg]=useState('')
  const load=async()=>setRows(await rpc('kiosk_admin_products',{p_actor_id:session.id,p_actor_code:session.code}))
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  async function add(e){e.preventDefault(); await rpc('kiosk_admin_upsert_product',{p_actor_id:session.id,p_actor_code:session.code,p_product_id:null,p_name:form.name,p_price:Number(form.price),p_active:true}); setForm({name:'',price:''}); await load()}
  async function toggle(p){await rpc('kiosk_admin_upsert_product',{p_actor_id:session.id,p_actor_code:session.code,p_product_id:p.id,p_name:p.name,p_price:Number(p.price),p_active:!p.active}); await load()}
  return <div className="stack"><form className="card form" onSubmit={add}><input placeholder="Produktname" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="Preis z.B. 1.50" type="number" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/><button><Package size={18}/> Speichern</button></form>{msg&&<div className="error">{msg}</div>}{rows.map(p=><article className="card row" key={p.id}><div><h3>{p.name}</h3><p>{money(p.price)} · {p.active?'aktiv':'inaktiv'}</p></div><button className="secondary" onClick={()=>toggle(p)}>{p.active?'Deaktivieren':'Aktivieren'}</button></article>)}</div>
}

function AdminUsers({ session }) {
  const [rows,setRows]=useState([]), [form,setForm]=useState({name:'',role:'user',code:''}), [msg,setMsg]=useState('')
  const load=async()=>setRows(await rpc('kiosk_admin_users',{p_actor_id:session.id,p_actor_code:session.code}))
  useEffect(()=>{load().catch(e=>setMsg(e.message))},[])
  async function add(e){e.preventDefault(); setMsg(''); try{await rpc('kiosk_admin_create_user',{p_actor_id:session.id,p_actor_code:session.code,p_name:form.name,p_role:form.role,p_code:form.code}); setForm({name:'',role:'user',code:''}); await load()}catch(e){setMsg(e.message)}}
  return <div className="stack"><form className="card form" onSubmit={add}><input placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="user">User</option><option value="admin">Admin</option></select><input placeholder="Zugangscode" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><button><Users size={18}/> User anlegen</button></form>{msg&&<div className="error">{msg}</div>}{rows.map(u=><article className="card row" key={u.id}><div><h3>{u.name}</h3><p>{u.role} · erstellt {new Date(u.created_at).toLocaleDateString('de-DE')}</p></div></article>)}</div>
}

function Stat({title,value}){return <div className="stat"><span>{title}</span><b>{value}</b></div>}
function Empty({text}){return <div className="empty">{text}</div>}
function List({rows, render}){return <div className="list">{rows.length?rows.map((r,i)=><article className="card listitem" key={i}>{render(r)}</article>):<Empty text="Keine Einträge."/>}</div>}

createRoot(document.getElementById('root')).render(<App />)
