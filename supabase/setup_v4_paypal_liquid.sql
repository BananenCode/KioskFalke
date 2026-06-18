-- KioskFalke V3 Supabase Migration
-- In Supabase SQL Editor komplett ausführen.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Alte RPC-Funktionen löschen, damit Return-Types geändert werden können.
drop function if exists public._kiosk_actor(uuid,text) cascade;
drop function if exists public._kiosk_require_admin(uuid,text) cascade;
drop function if exists public._kiosk_balance(uuid) cascade;
drop function if exists public.kiosk_login(text) cascade;
drop function if exists public.kiosk_login(text,text) cascade;
drop function if exists public.kiosk_list_categories(uuid,text) cascade;
drop function if exists public.kiosk_products(uuid,text) cascade;
drop function if exists public.kiosk_take_product(uuid,text,uuid,int) cascade;
drop function if exists public.kiosk_my_dashboard(uuid,text) cascade;
drop function if exists public.kiosk_admin_users(uuid,text) cascade;
drop function if exists public.kiosk_admin_create_user(uuid,text,text,text,text) cascade;
drop function if exists public.kiosk_admin_upsert_user(uuid,text,uuid,text,text,text,text,boolean) cascade;
drop function if exists public.kiosk_admin_delete_user(uuid,text,uuid,text) cascade;
drop function if exists public.kiosk_admin_categories(uuid,text) cascade;
drop function if exists public.kiosk_admin_upsert_category(uuid,text,uuid,text,text,boolean) cascade;
drop function if exists public.kiosk_admin_delete_category(uuid,text,uuid) cascade;
drop function if exists public.kiosk_admin_products(uuid,text) cascade;
drop function if exists public.kiosk_admin_upsert_product(uuid,text,uuid,text,text,numeric,uuid,boolean,text,boolean) cascade;
drop function if exists public.kiosk_admin_delete_product(uuid,text,uuid) cascade;
drop function if exists public.kiosk_admin_overview(uuid,text) cascade;
drop function if exists public.kiosk_admin_user_profile(uuid,text,uuid) cascade;
drop function if exists public.kiosk_admin_delete_entry(uuid,text,uuid,text) cascade;
drop function if exists public.kiosk_admin_add_payment(uuid,text,uuid,numeric,text) cascade;
drop function if exists public.kiosk_admin_add_adjustment(uuid,text,uuid,numeric,text) cascade;
drop function if exists public.kiosk_admin_analysis(uuid,text) cascade;
drop function if exists public.kiosk_admin_get_settings(uuid,text) cascade;
drop function if exists public.kiosk_admin_set_paypal_me(uuid,text,text) cascade;

create table if not exists public.kiosk_users (
  id uuid primary key default gen_random_uuid(),
  user_key text unique,
  name text not null,
  role text not null check (role in ('admin','user')) default 'user',
  code_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kiosk_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  icon_data_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kiosk_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  category_id uuid references public.kiosk_categories(id) on delete set null,
  icon_data_url text not null default '',
  excluded_from_revenue boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kiosk_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kiosk_users(id),
  product_id uuid not null references public.kiosk_products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  total numeric(10,2) generated always as (quantity * unit_price) stored,
  paid boolean not null default false,
  paid_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.kiosk_users(id),
  deleted_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.kiosk_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kiosk_users(id),
  amount numeric(10,2) not null check (amount > 0),
  note text not null default '',
  created_by uuid references public.kiosk_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.kiosk_settings (
  key text primary key,
  value text not null default '',
  updated_by uuid references public.kiosk_users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.kiosk_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kiosk_users(id),
  amount numeric(10,2) not null,
  note text not null default '',
  created_by uuid references public.kiosk_users(id),
  created_at timestamptz not null default now()
);

alter table public.kiosk_users add column if not exists user_key text;
alter table public.kiosk_users add column if not exists updated_at timestamptz not null default now();
alter table public.kiosk_categories add column if not exists icon_data_url text not null default '';
alter table public.kiosk_categories add column if not exists updated_at timestamptz not null default now();
alter table public.kiosk_products add column if not exists description text not null default '';
alter table public.kiosk_products add column if not exists category_id uuid references public.kiosk_categories(id) on delete set null;
alter table public.kiosk_products add column if not exists icon_data_url text not null default '';
alter table public.kiosk_products add column if not exists excluded_from_revenue boolean not null default false;
alter table public.kiosk_products add column if not exists updated_at timestamptz not null default now();
alter table public.kiosk_entries add column if not exists deleted_at timestamptz;
alter table public.kiosk_entries add column if not exists deleted_by uuid references public.kiosk_users(id);
alter table public.kiosk_entries add column if not exists deleted_reason text;

insert into public.kiosk_categories(title)
select 'Allgemein' where not exists (select 1 from public.kiosk_categories where title='Allgemein');

update public.kiosk_products set category_id = (select id from public.kiosk_categories where title='Allgemein' limit 1) where category_id is null;
update public.kiosk_users set user_key = case when role='admin' then 'admin' else lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')) end where user_key is null;
update public.kiosk_users u set user_key = coalesce(nullif(user_key,''), 'user') || '-' || substring(u.id::text,1,4)
where exists (select 1 from public.kiosk_users x where lower(x.user_key)=lower(u.user_key) and x.id<>u.id);
alter table public.kiosk_users alter column user_key set not null;
create unique index if not exists kiosk_users_user_key_idx on public.kiosk_users(lower(user_key));

alter table public.kiosk_users enable row level security;
alter table public.kiosk_categories enable row level security;
alter table public.kiosk_products enable row level security;
alter table public.kiosk_entries enable row level security;
alter table public.kiosk_payments enable row level security;
alter table public.kiosk_settings enable row level security;
alter table public.kiosk_adjustments enable row level security;

drop policy if exists deny_users on public.kiosk_users;
drop policy if exists deny_categories on public.kiosk_categories;
drop policy if exists deny_products on public.kiosk_products;
drop policy if exists deny_entries on public.kiosk_entries;
drop policy if exists deny_payments on public.kiosk_payments;
drop policy if exists deny_settings on public.kiosk_settings;
drop policy if exists deny_adjustments on public.kiosk_adjustments;
create policy deny_users on public.kiosk_users for all using (false) with check (false);
create policy deny_categories on public.kiosk_categories for all using (false) with check (false);
create policy deny_products on public.kiosk_products for all using (false) with check (false);
create policy deny_entries on public.kiosk_entries for all using (false) with check (false);
create policy deny_payments on public.kiosk_payments for all using (false) with check (false);
create policy deny_settings on public.kiosk_settings for all using (false) with check (false);
create policy deny_adjustments on public.kiosk_adjustments for all using (false) with check (false);

insert into public.kiosk_payments(user_id, amount, note, created_by)
select e.user_id, sum(e.total), 'Migration: vorher als bezahlt markierte Entnahmen', null
from public.kiosk_entries e
where e.paid = true and not exists (select 1 from public.kiosk_payments p where p.note = 'Migration: vorher als bezahlt markierte Entnahmen')
group by e.user_id;

create or replace function public._kiosk_actor(p_actor_id uuid, p_actor_code text)
returns table(id uuid, user_key text, name text, role text)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.user_key, u.name, u.role
  from public.kiosk_users u
  where u.id = p_actor_id and u.active = true and u.code_hash = extensions.crypt(p_actor_code, u.code_hash)
  limit 1;
$$;

create or replace function public._kiosk_require_admin(p_actor_id uuid, p_actor_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code) a where a.role='admin') then raise exception 'Admin-Berechtigung erforderlich'; end if;
end;
$$;

create or replace function public._kiosk_balance(p_user_id uuid)
returns numeric language sql security definer set search_path = public as $$
  select round(
    coalesce((select sum(amount) from public.kiosk_payments p where p.user_id=p_user_id),0)
    + coalesce((select sum(amount) from public.kiosk_adjustments a where a.user_id=p_user_id),0)
    - coalesce((select sum(total) from public.kiosk_entries e where e.user_id=p_user_id and e.deleted_at is null),0)
  ,2);
$$;

create or replace function public.kiosk_login(p_user_key text, p_code text)
returns jsonb language sql security definer set search_path = public, extensions as $$
  select coalesce((select jsonb_build_object('id',u.id,'user_key',u.user_key,'name',u.name,'role',u.role,'balance',public._kiosk_balance(u.id)) from public.kiosk_users u
  where u.active=true and lower(u.user_key)=lower(trim(p_user_key)) and u.code_hash=extensions.crypt(p_code,u.code_hash) limit 1),'{}'::jsonb);
$$;

create or replace function public.kiosk_list_categories(p_actor_id uuid, p_actor_code text)
returns table(id uuid, title text, icon_data_url text, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  return query select c.id,c.title,c.icon_data_url,c.active from public.kiosk_categories c where c.active=true order by c.title;
end;
$$;

create or replace function public.kiosk_products(p_actor_id uuid, p_actor_code text)
returns table(id uuid, name text, description text, price numeric, category_id uuid, category_title text, category_icon_data_url text, icon_data_url text, excluded_from_revenue boolean, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  return query select p.id,p.name,p.description,p.price,p.category_id,coalesce(c.title,'Ohne Kategorie'),coalesce(c.icon_data_url,''),p.icon_data_url,p.excluded_from_revenue,p.active
  from public.kiosk_products p left join public.kiosk_categories c on c.id=p.category_id where p.active=true order by coalesce(c.title,'Ohne Kategorie'), p.name;
end;
$$;

create or replace function public.kiosk_take_product(p_actor_id uuid, p_actor_code text, p_product_id uuid, p_quantity int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_price numeric(10,2); v_name text; v_balance numeric; v_entry uuid;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select price,name into v_price,v_name from public.kiosk_products where id=p_product_id and active=true;
  if v_price is null then raise exception 'Produkt nicht gefunden oder inaktiv'; end if;
  insert into public.kiosk_entries(user_id,product_id,quantity,unit_price) values(p_actor_id,p_product_id,greatest(p_quantity,1),v_price) returning id into v_entry;
  v_balance := public._kiosk_balance(p_actor_id);
  return jsonb_build_object('entry_id',v_entry,'product_name',v_name,'balance',v_balance,'warning',case when v_balance <= -50 then 'Dein Konto ist über 50 € im Minus. Bitte bezahlen.' else null end);
end;
$$;

create or replace function public.kiosk_my_dashboard(p_actor_id uuid, p_actor_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; month_start date := date_trunc('month', now())::date; next_month date := (date_trunc('month', now()) + interval '1 month')::date;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select jsonb_build_object(
    'balance', public._kiosk_balance(p_actor_id),
    'month_label', to_char(month_start,'TMMonth YYYY'),
    'pay_info','Bitte offene Beträge immer zum 1. eines Monats bezahlen.',
    'paypal_me', coalesce((select value from public.kiosk_settings where key='paypal_me'),''),
    'month_spent', coalesce((select sum(e.total) from public.kiosk_entries e where e.user_id=p_actor_id and e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month),0),
    'month_payments', coalesce((select sum(p.amount) from public.kiosk_payments p where p.user_id=p_actor_id and p.created_at>=month_start and p.created_at<next_month),0),
    'month_adjustments', coalesce((select sum(a.amount) from public.kiosk_adjustments a where a.user_id=p_actor_id and a.created_at>=month_start and a.created_at<next_month),0),
    'month_items', coalesce((select jsonb_agg(x order by x.created_at desc) from (select e.id,e.created_at,pr.name as product_name,c.title as category_title,e.quantity,e.total,pr.icon_data_url from public.kiosk_entries e join public.kiosk_products pr on pr.id=e.product_id left join public.kiosk_categories c on c.id=pr.category_id where e.user_id=p_actor_id and e.deleted_at is null and e.created_at>=month_start and e.created_at<next_month order by e.created_at desc) x),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.kiosk_admin_users(p_actor_id uuid, p_actor_code text)
returns table(id uuid, user_key text, name text, role text, active boolean, balance numeric, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query select u.id,u.user_key,u.name,u.role,u.active,public._kiosk_balance(u.id),u.created_at from public.kiosk_users u order by u.active desc,u.name;
end;
$$;

create or replace function public.kiosk_admin_upsert_user(p_actor_id uuid, p_actor_code text, p_user_id uuid, p_user_key text, p_name text, p_role text, p_code text, p_active boolean)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare out_id uuid;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(p_user_key))<2 then raise exception 'User_ID zu kurz'; end if;
  if length(trim(p_name))<2 then raise exception 'Name zu kurz'; end if;
  if p_role not in ('admin','user') then raise exception 'Rolle ungültig'; end if;
  if p_user_id is null then
    if length(trim(p_code))<4 then raise exception 'Code mindestens 4 Zeichen'; end if;
    insert into public.kiosk_users(user_key,name,role,code_hash,active) values(trim(p_user_key),trim(p_name),p_role,extensions.crypt(trim(p_code),extensions.gen_salt('bf')),coalesce(p_active,true)) returning id into out_id;
  else
    update public.kiosk_users set user_key=trim(p_user_key), name=trim(p_name), role=p_role, active=coalesce(p_active,true), updated_at=now() where id=p_user_id returning id into out_id;
    if length(coalesce(trim(p_code),''))>=4 then update public.kiosk_users set code_hash=extensions.crypt(trim(p_code),extensions.gen_salt('bf')) where id=p_user_id; end if;
  end if;
  return out_id;
end;
$$;

create or replace function public.kiosk_admin_delete_user(p_actor_id uuid, p_actor_code text, p_user_id uuid, p_drop_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_balance numeric;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select role, public._kiosk_balance(id) into v_role, v_balance from public.kiosk_users where id=p_user_id;
  if v_role is null then raise exception 'User nicht gefunden'; end if;
  if v_balance <> 0 then raise exception 'User kann nur bei Kontostand 0,00 € gelöscht werden'; end if;
  if v_role='admin' then
    if coalesce(p_drop_code,'') <> 'DROPADMIN' then raise exception 'Admin-Löschcode falsch'; end if;
    if (select count(*) from public.kiosk_users where role='admin' and active=true and id<>p_user_id) < 1 then raise exception 'Der letzte aktive Admin kann nicht gelöscht werden'; end if;
  end if;
  update public.kiosk_users set active=false, updated_at=now() where id=p_user_id;
end;
$$;

create or replace function public.kiosk_admin_categories(p_actor_id uuid, p_actor_code text)
returns table(id uuid, title text, icon_data_url text, active boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query select c.id,c.title,c.icon_data_url,c.active,c.created_at from public.kiosk_categories c order by c.active desc,c.title;
end;
$$;

create or replace function public.kiosk_admin_upsert_category(p_actor_id uuid, p_actor_code text, p_category_id uuid, p_title text, p_icon_data_url text, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare out_id uuid;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(p_title))<2 then raise exception 'Kategorietitel zu kurz'; end if;
  if p_category_id is null then insert into public.kiosk_categories(title,icon_data_url,active) values(trim(p_title),coalesce(p_icon_data_url,''),coalesce(p_active,true)) returning id into out_id;
  else update public.kiosk_categories set title=trim(p_title), icon_data_url=coalesce(p_icon_data_url,icon_data_url), active=coalesce(p_active,true), updated_at=now() where id=p_category_id returning id into out_id; end if;
  return out_id;
end;
$$;

create or replace function public.kiosk_admin_delete_category(p_actor_id uuid, p_actor_code text, p_category_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  update public.kiosk_products set category_id=null where category_id=p_category_id;
  update public.kiosk_categories set active=false, updated_at=now() where id=p_category_id;
end;
$$;

create or replace function public.kiosk_admin_products(p_actor_id uuid, p_actor_code text)
returns table(id uuid, name text, description text, price numeric, category_id uuid, category_title text, icon_data_url text, excluded_from_revenue boolean, active boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query select p.id,p.name,p.description,p.price,p.category_id,coalesce(c.title,'Ohne Kategorie'),p.icon_data_url,p.excluded_from_revenue,p.active,p.created_at from public.kiosk_products p left join public.kiosk_categories c on c.id=p.category_id order by p.active desc,coalesce(c.title,''),p.name;
end;
$$;

create or replace function public.kiosk_admin_upsert_product(p_actor_id uuid, p_actor_code text, p_product_id uuid, p_name text, p_description text, p_price numeric, p_category_id uuid, p_active boolean, p_icon_data_url text, p_excluded_from_revenue boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare out_id uuid;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(p_name))<2 then raise exception 'Produkttitel zu kurz'; end if;
  if p_price<0 then raise exception 'Preis ungültig'; end if;
  if p_product_id is null then insert into public.kiosk_products(name,description,price,category_id,active,icon_data_url,excluded_from_revenue) values(trim(p_name),coalesce(p_description,''),round(p_price,2),p_category_id,coalesce(p_active,true),coalesce(p_icon_data_url,''),coalesce(p_excluded_from_revenue,false)) returning id into out_id;
  else update public.kiosk_products set name=trim(p_name), description=coalesce(p_description,''), price=round(p_price,2), category_id=p_category_id, active=coalesce(p_active,true), icon_data_url=coalesce(p_icon_data_url,icon_data_url), excluded_from_revenue=coalesce(p_excluded_from_revenue,false), updated_at=now() where id=p_product_id returning id into out_id; end if;
  return out_id;
end;
$$;

create or replace function public.kiosk_admin_delete_product(p_actor_id uuid, p_actor_code text, p_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  update public.kiosk_products set active=false, updated_at=now() where id=p_product_id;
end;
$$;

create or replace function public.kiosk_admin_overview(p_actor_id uuid, p_actor_code text)
returns table(user_id uuid, user_key text, name text, role text, balance numeric, month_spent numeric, entries_count bigint)
language plpgsql security definer set search_path = public as $$
declare month_start date := date_trunc('month',now())::date; next_month date := (date_trunc('month',now())+interval '1 month')::date;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query select u.id,u.user_key,u.name,u.role,public._kiosk_balance(u.id),coalesce(sum(e.total) filter(where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0),count(e.id) filter(where e.deleted_at is null) from public.kiosk_users u left join public.kiosk_entries e on e.user_id=u.id where u.active=true group by u.id,u.user_key,u.name,u.role order by public._kiosk_balance(u.id),u.name;
end;
$$;

create or replace function public.kiosk_admin_user_profile(p_actor_id uuid, p_actor_code text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select jsonb_build_object(
    'user',(select jsonb_build_object('id',u.id,'user_key',u.user_key,'name',u.name,'role',u.role,'active',u.active,'balance',public._kiosk_balance(u.id)) from public.kiosk_users u where u.id=p_user_id),
    'entries',coalesce((select jsonb_agg(x order by x.created_at desc) from (select e.id,e.created_at,pr.name as product_name,c.title as category_title,e.quantity,e.total,e.deleted_at from public.kiosk_entries e join public.kiosk_products pr on pr.id=e.product_id left join public.kiosk_categories c on c.id=pr.category_id where e.user_id=p_user_id order by e.created_at desc limit 80) x),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(p order by p.created_at desc) from (select id,created_at,amount,note from public.kiosk_payments where user_id=p_user_id order by created_at desc limit 30) p),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(a order by a.created_at desc) from (select id,created_at,amount,note from public.kiosk_adjustments where user_id=p_user_id order by created_at desc limit 30) a),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(m order by m.created_at desc) from (
      select e.id, e.created_at, 'entry' as kind, 'Kauf' as type_label, pr.name as title, coalesce(c.title,'Ohne Kategorie') as note, -e.total as amount from public.kiosk_entries e join public.kiosk_products pr on pr.id=e.product_id left join public.kiosk_categories c on c.id=pr.category_id where e.user_id=p_user_id and e.deleted_at is null
      union all select p.id, p.created_at, 'payment', 'Zahlung', 'Zahlung', p.note, p.amount from public.kiosk_payments p where p.user_id=p_user_id
      union all select a.id, a.created_at, 'adjustment', 'Korrektur', 'Korrektur', a.note, a.amount from public.kiosk_adjustments a where a.user_id=p_user_id
      order by created_at desc limit 250
    ) m),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.kiosk_admin_delete_entry(p_actor_id uuid, p_actor_code text, p_entry_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  update public.kiosk_entries set deleted_at=now(), deleted_by=p_actor_id, deleted_reason=coalesce(p_reason,'Fehlbuchung') where id=p_entry_id and deleted_at is null;
end;
$$;

create or replace function public.kiosk_admin_add_payment(p_actor_id uuid, p_actor_code text, p_user_id uuid, p_amount numeric, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if p_amount<=0 then raise exception 'Zahlbetrag muss größer als 0 sein'; end if;
  insert into public.kiosk_payments(user_id,amount,note,created_by) values(p_user_id,round(p_amount,2),coalesce(p_note,'Zahlung'),p_actor_id);
  return public._kiosk_balance(p_user_id);
end;
$$;

create or replace function public.kiosk_admin_add_adjustment(p_actor_id uuid, p_actor_code text, p_user_id uuid, p_amount numeric, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if p_amount=0 then raise exception 'Korrektur darf nicht 0 sein'; end if;
  insert into public.kiosk_adjustments(user_id,amount,note,created_by) values(p_user_id,round(p_amount,2),coalesce(p_note,'Konto-Korrektur'),p_actor_id);
  return public._kiosk_balance(p_user_id);
end;
$$;


create or replace function public.kiosk_admin_get_settings(p_actor_id uuid, p_actor_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return jsonb_build_object('paypal_me', coalesce((select value from public.kiosk_settings where key='paypal_me'),''));
end;
$$;

create or replace function public.kiosk_admin_set_paypal_me(p_actor_id uuid, p_actor_code text, p_paypal_me text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_paypal_me,''));
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  v := regexp_replace(v, '^https?://(www\.)?paypal\.me/', '', 'i');
  v := regexp_replace(v, '^paypal\.me/', '', 'i');
  v := regexp_replace(v, '^@', '');
  v := split_part(split_part(split_part(v,'?',1),'#',1),'/',1);
  if v <> '' and v !~ '^[A-Za-z0-9._-]{3,80}$' then raise exception 'PayPal.Me-Adresse ungültig'; end if;
  insert into public.kiosk_settings(key,value,updated_by,updated_at) values('paypal_me',v,p_actor_id,now())
  on conflict(key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now();
  return jsonb_build_object('paypal_me',v);
end;
$$;

create or replace function public.kiosk_admin_analysis(p_actor_id uuid, p_actor_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  month_start date := date_trunc('month',now())::date;
  next_month date := (date_trunc('month',now())+interval '1 month')::date;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'month_revenue', coalesce((
        select sum(e.total)
        from public.kiosk_entries e
        join public.kiosk_products p on p.id=e.product_id
        where e.deleted_at is null
          and coalesce(p.excluded_from_revenue,false)=false
          and e.created_at>=month_start
          and e.created_at<next_month
      ),0),
      'month_units', coalesce((
        select sum(e.quantity)
        from public.kiosk_entries e
        where e.deleted_at is null
          and e.created_at>=month_start
          and e.created_at<next_month
      ),0),
      'all_revenue', coalesce((
        select sum(e.total)
        from public.kiosk_entries e
        join public.kiosk_products p on p.id=e.product_id
        where e.deleted_at is null
          and coalesce(p.excluded_from_revenue,false)=false
      ),0)
    ),
    'products', coalesce((
      select jsonb_agg(x.obj order by x.month_revenue desc)
      from (
        select
          coalesce(sum(e.quantity) filter(where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0) as month_units,
          case when coalesce(p.excluded_from_revenue,false) then 0 else coalesce(sum(e.total) filter(where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0) end as month_revenue,
          jsonb_build_object(
            'name',p.name,
            'category',coalesce(c.title,'Ohne Kategorie'),
            'excluded_from_revenue',coalesce(p.excluded_from_revenue,false),
            'month_units',coalesce(sum(e.quantity) filter(where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0),
            'month_revenue',case when coalesce(p.excluded_from_revenue,false) then 0 else coalesce(sum(e.total) filter(where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0) end,
            'all_units',coalesce(sum(e.quantity) filter(where e.deleted_at is null),0),
            'all_revenue',case when coalesce(p.excluded_from_revenue,false) then 0 else coalesce(sum(e.total) filter(where e.deleted_at is null),0) end
          ) as obj
        from public.kiosk_products p
        left join public.kiosk_categories c on c.id=p.category_id
        left join public.kiosk_entries e on e.product_id=p.id
        group by p.id,p.name,c.title,p.excluded_from_revenue
      ) x
    ),'[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(y.obj order by y.month_revenue desc)
      from (
        select
          coalesce(sum(e.total) filter(where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null and coalesce(p.excluded_from_revenue,false)=false),0) as month_revenue,
          jsonb_build_object(
            'title',coalesce(c.title,'Ohne Kategorie'),
            'month_units',coalesce(sum(e.quantity) filter(where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0),
            'month_revenue',coalesce(sum(e.total) filter(where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null and coalesce(p.excluded_from_revenue,false)=false),0),
            'all_revenue',coalesce(sum(e.total) filter(where e.deleted_at is null and coalesce(p.excluded_from_revenue,false)=false),0)
          ) as obj
        from public.kiosk_categories c
        left join public.kiosk_products p on p.category_id=c.id
        left join public.kiosk_entries e on e.product_id=p.id
        group by c.id,c.title
      ) y
    ),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

insert into public.kiosk_users(user_key,name,role,code_hash,active)
select 'admin','Admin','admin',extensions.crypt('admin1234',extensions.gen_salt('bf')),true
where not exists (select 1 from public.kiosk_users where role='admin');

insert into public.kiosk_products(name,description,price,category_id,active)
select v.name,v.description,v.price,(select id from public.kiosk_categories where title='Allgemein' limit 1),true
from (values ('Cola','Softgetränk',1.20),('Wasser','Mineralwasser',0.80),('Schokoriegel','Snack',1.00)) v(name,description,price)
where not exists (select 1 from public.kiosk_products);

grant execute on all functions in schema public to anon, authenticated;

-- V4 Community Vorschläge & Votes
create table if not exists public.kiosk_suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open','added','rejected')),
  created_by uuid not null references public.kiosk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kiosk_suggestion_votes (
  suggestion_id uuid not null references public.kiosk_suggestions(id) on delete cascade,
  user_id uuid not null references public.kiosk_users(id),
  created_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

alter table public.kiosk_suggestions enable row level security;
alter table public.kiosk_suggestion_votes enable row level security;
drop policy if exists deny_suggestions on public.kiosk_suggestions;
drop policy if exists deny_suggestion_votes on public.kiosk_suggestion_votes;
create policy deny_suggestions on public.kiosk_suggestions for all using (false) with check (false);
create policy deny_suggestion_votes on public.kiosk_suggestion_votes for all using (false) with check (false);

drop function if exists public.kiosk_community(uuid,text) cascade;
create or replace function public.kiosk_community(p_actor_id uuid, p_actor_code text)
returns table(
  id uuid,
  title text,
  description text,
  status text,
  created_by_name text,
  created_at timestamptz,
  upvotes bigint,
  user_voted boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  return query
  select s.id, s.title, s.description, s.status, u.name as created_by_name, s.created_at,
    count(v.user_id)::bigint as upvotes,
    exists(select 1 from public.kiosk_suggestion_votes vv where vv.suggestion_id=s.id and vv.user_id=p_actor_id) as user_voted
  from public.kiosk_suggestions s
  join public.kiosk_users u on u.id=s.created_by
  left join public.kiosk_suggestion_votes v on v.suggestion_id=s.id
  group by s.id, s.title, s.description, s.status, u.name, s.created_at
  order by case s.status when 'open' then 0 when 'added' then 1 else 2 end, count(v.user_id) desc, s.created_at desc;
end;
$$;

drop function if exists public.kiosk_create_suggestion(uuid,text,text,text) cascade;
create or replace function public.kiosk_create_suggestion(p_actor_id uuid, p_actor_code text, p_title text, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare out_id uuid;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  if length(trim(p_title)) < 2 then raise exception 'Titel zu kurz'; end if;
  insert into public.kiosk_suggestions(title, description, created_by)
  values(trim(p_title), coalesce(trim(p_description),''), p_actor_id)
  returning id into out_id;
  return out_id;
end;
$$;

drop function if exists public.kiosk_toggle_suggestion_vote(uuid,text,uuid) cascade;
create or replace function public.kiosk_toggle_suggestion_vote(p_actor_id uuid, p_actor_code text, p_suggestion_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  if exists (select 1 from public.kiosk_suggestion_votes where suggestion_id=p_suggestion_id and user_id=p_actor_id) then
    delete from public.kiosk_suggestion_votes where suggestion_id=p_suggestion_id and user_id=p_actor_id;
  else
    insert into public.kiosk_suggestion_votes(suggestion_id,user_id) values(p_suggestion_id,p_actor_id);
  end if;
  select count(*)::int into n from public.kiosk_suggestion_votes where suggestion_id=p_suggestion_id;
  return n;
end;
$$;

drop function if exists public.kiosk_admin_set_suggestion_status(uuid,text,uuid,text) cascade;
create or replace function public.kiosk_admin_set_suggestion_status(p_actor_id uuid, p_actor_code text, p_suggestion_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if p_status not in ('open','added','rejected') then raise exception 'Status ungültig'; end if;
  update public.kiosk_suggestions set status=p_status, updated_at=now() where id=p_suggestion_id;
end;
$$;

grant execute on all functions in schema public to anon, authenticated;
