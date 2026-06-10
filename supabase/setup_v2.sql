-- KioskFalke V2 Supabase Setup / Migration
-- In Supabase SQL Editor komplett ausführen.
-- Danach GitHub Dateien hochladen und Vercel neu deployen.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.kiosk_users (
  id uuid primary key default gen_random_uuid(),
  user_key text unique,
  name text not null,
  role text not null check (role in ('admin','user')) default 'user',
  code_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kiosk_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
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

alter table public.kiosk_users add column if not exists user_key text;
alter table public.kiosk_users add column if not exists updated_at timestamptz not null default now();
alter table public.kiosk_products add column if not exists description text not null default '';
alter table public.kiosk_products add column if not exists category_id uuid references public.kiosk_categories(id) on delete set null;
alter table public.kiosk_products add column if not exists updated_at timestamptz not null default now();
alter table public.kiosk_entries add column if not exists deleted_at timestamptz;
alter table public.kiosk_entries add column if not exists deleted_by uuid references public.kiosk_users(id);
alter table public.kiosk_entries add column if not exists deleted_reason text;

insert into public.kiosk_categories(title)
select 'Allgemein'
where not exists (select 1 from public.kiosk_categories where title='Allgemein');

update public.kiosk_products
set category_id = (select id from public.kiosk_categories where title='Allgemein' limit 1)
where category_id is null;

update public.kiosk_users
set user_key = case when role='admin' then 'admin' else lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')) end
where user_key is null;

-- Falls es durch gleiche Namen doppelte User-IDs gäbe, eindeutig machen.
update public.kiosk_users u
set user_key = coalesce(nullif(user_key,''), 'user') || '-' || substring(u.id::text,1,4)
where exists (
  select 1 from public.kiosk_users x
  where x.user_key = u.user_key and x.id <> u.id
);

alter table public.kiosk_users alter column user_key set not null;
create unique index if not exists kiosk_users_user_key_idx on public.kiosk_users(lower(user_key));

alter table public.kiosk_users enable row level security;
alter table public.kiosk_categories enable row level security;
alter table public.kiosk_products enable row level security;
alter table public.kiosk_entries enable row level security;
alter table public.kiosk_payments enable row level security;

drop policy if exists deny_users on public.kiosk_users;
drop policy if exists deny_categories on public.kiosk_categories;
drop policy if exists deny_products on public.kiosk_products;
drop policy if exists deny_entries on public.kiosk_entries;
drop policy if exists deny_payments on public.kiosk_payments;
create policy deny_users on public.kiosk_users for all using (false) with check (false);
create policy deny_categories on public.kiosk_categories for all using (false) with check (false);
create policy deny_products on public.kiosk_products for all using (false) with check (false);
create policy deny_entries on public.kiosk_entries for all using (false) with check (false);
create policy deny_payments on public.kiosk_payments for all using (false) with check (false);

-- Einmalige Migration alter bezahlt-Markierungen in Guthaben-Zahlungen.
insert into public.kiosk_payments(user_id, amount, note, created_by)
select e.user_id, sum(e.total), 'Migration: vorher als bezahlt markierte Entnahmen', null
from public.kiosk_entries e
where e.paid = true
  and not exists (select 1 from public.kiosk_payments p where p.note = 'Migration: vorher als bezahlt markierte Entnahmen')
group by e.user_id;

create or replace function public._kiosk_actor(p_actor_id uuid, p_actor_code text)
returns table(id uuid, user_key text, name text, role text)
language sql security definer set search_path = public, extensions as $$
  select u.id, u.user_key, u.name, u.role
  from public.kiosk_users u
  where u.id = p_actor_id
    and u.active = true
    and u.code_hash = extensions.crypt(p_actor_code, u.code_hash)
  limit 1;
$$;

create or replace function public._kiosk_require_admin(p_actor_id uuid, p_actor_code text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code) a where a.role = 'admin') then
    raise exception 'Admin-Berechtigung erforderlich';
  end if;
end;
$$;

create or replace function public._kiosk_balance(p_user_id uuid)
returns numeric
language sql security definer set search_path = public as $$
  select round(
    coalesce((select sum(amount) from public.kiosk_payments p where p.user_id = p_user_id),0)
    - coalesce((select sum(total) from public.kiosk_entries e where e.user_id = p_user_id and e.deleted_at is null),0)
  , 2);
$$;

create or replace function public.kiosk_login(p_user_key text, p_code text)
returns jsonb
language sql security definer set search_path = public, extensions as $$
  select coalesce((
    select jsonb_build_object('id', u.id, 'user_key', u.user_key, 'name', u.name, 'role', u.role, 'balance', public._kiosk_balance(u.id))
    from public.kiosk_users u
    where u.active = true
      and lower(u.user_key) = lower(trim(p_user_key))
      and u.code_hash = extensions.crypt(p_code, u.code_hash)
    limit 1
  ), '{}'::jsonb);
$$;

create or replace function public.kiosk_list_categories(p_actor_id uuid, p_actor_code text)
returns table(id uuid, title text, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  return query select c.id,c.title,c.active from public.kiosk_categories c where c.active=true order by c.title;
end;
$$;

create or replace function public.kiosk_products(p_actor_id uuid, p_actor_code text)
returns table(id uuid, name text, description text, price numeric, category_id uuid, category_title text, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  return query
  select p.id,p.name,p.description,p.price,p.category_id,coalesce(c.title,'Ohne Kategorie') as category_title,p.active
  from public.kiosk_products p
  left join public.kiosk_categories c on c.id=p.category_id
  where p.active=true
  order by coalesce(c.title,'Ohne Kategorie'), p.name;
end;
$$;

create or replace function public.kiosk_take_product(p_actor_id uuid, p_actor_code text, p_product_id uuid, p_quantity int default 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_price numeric(10,2); v_name text; v_balance numeric; v_entry uuid;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select price, name into v_price, v_name from public.kiosk_products where id=p_product_id and active=true;
  if v_price is null then raise exception 'Produkt nicht gefunden oder inaktiv'; end if;
  insert into public.kiosk_entries(user_id,product_id,quantity,unit_price) values(p_actor_id,p_product_id,greatest(p_quantity,1),v_price) returning id into v_entry;
  v_balance := public._kiosk_balance(p_actor_id);
  return jsonb_build_object('entry_id', v_entry, 'product_name', v_name, 'balance', v_balance, 'warning', case when v_balance <= -50 then 'Dein Konto ist über 50 € im Minus. Bitte bezahlen.' else null end);
end;
$$;

create or replace function public.kiosk_my_dashboard(p_actor_id uuid, p_actor_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; month_start date := date_trunc('month', now())::date; next_month date := (date_trunc('month', now()) + interval '1 month')::date;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select jsonb_build_object(
    'balance', public._kiosk_balance(p_actor_id),
    'month_label', to_char(month_start, 'TMMonth YYYY'),
    'pay_info', 'Bitte offene Beträge immer zum 1. eines Monats bezahlen.',
    'month_spent', coalesce((select sum(e.total) from public.kiosk_entries e where e.user_id=p_actor_id and e.deleted_at is null and e.created_at >= month_start and e.created_at < next_month),0),
    'month_payments', coalesce((select sum(p.amount) from public.kiosk_payments p where p.user_id=p_actor_id and p.created_at >= month_start and p.created_at < next_month),0),
    'month_items', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select e.id, e.created_at, pr.name as product_name, c.title as category_title, e.quantity, e.total
        from public.kiosk_entries e
        join public.kiosk_products pr on pr.id=e.product_id
        left join public.kiosk_categories c on c.id=pr.category_id
        where e.user_id=p_actor_id and e.deleted_at is null and e.created_at >= month_start and e.created_at < next_month
        order by e.created_at desc
      ) x
    ), '[]'::jsonb),
    'month_payments_list', coalesce((
      select jsonb_agg(y order by y.created_at desc) from (
        select p.id, p.created_at, p.amount, p.note from public.kiosk_payments p
        where p.user_id=p_actor_id and p.created_at >= month_start and p.created_at < next_month
        order by p.created_at desc
      ) y
    ), '[]'::jsonb)
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
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare out_id uuid; clean_key text := lower(trim(p_user_key));
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if length(clean_key) < 3 then raise exception 'User_ID mindestens 3 Zeichen'; end if;
  if clean_key !~ '^[a-z0-9._-]+$' then raise exception 'User_ID nur mit Buchstaben, Zahlen, Punkt, Minus oder Unterstrich'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Name zu kurz'; end if;
  if p_role not in ('admin','user') then raise exception 'Rolle ungültig'; end if;
  if p_user_id is null then
    if length(trim(coalesce(p_code,''))) < 4 then raise exception 'Zugangscode mindestens 4 Zeichen'; end if;
    insert into public.kiosk_users(user_key,name,role,code_hash,active)
    values(clean_key, trim(p_name), p_role, extensions.crypt(trim(p_code), extensions.gen_salt('bf')), coalesce(p_active,true))
    returning id into out_id;
  else
    update public.kiosk_users
    set user_key=clean_key, name=trim(p_name), role=p_role, active=coalesce(p_active,true),
        code_hash = case when length(trim(coalesce(p_code,''))) >= 4 then extensions.crypt(trim(p_code), extensions.gen_salt('bf')) else code_hash end,
        updated_at=now()
    where id=p_user_id returning id into out_id;
  end if;
  return out_id;
exception when unique_violation then
  raise exception 'User_ID oder Zugangscode ist bereits vergeben';
end;
$$;

create or replace function public.kiosk_admin_delete_user(p_actor_id uuid, p_actor_code text, p_user_id uuid, p_drop_code text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_role text; v_balance numeric; v_admins int;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select role, public._kiosk_balance(id) into v_role, v_balance from public.kiosk_users where id=p_user_id;
  if v_role is null then raise exception 'User nicht gefunden'; end if;
  if v_balance <> 0 then raise exception 'User kann nur gelöscht werden, wenn das Konto genau 0,00 € ist'; end if;
  if v_role='admin' and coalesce(p_drop_code,'') <> 'DROPADMIN' then raise exception 'Zum Löschen eines Admins ist der Sicherheitscode erforderlich'; end if;
  select count(*) into v_admins from public.kiosk_users where role='admin' and active=true and id <> p_user_id;
  if v_role='admin' and v_admins < 1 then raise exception 'Der letzte aktive Admin kann nicht gelöscht werden'; end if;
  update public.kiosk_users set active=false, updated_at=now() where id=p_user_id;
end;
$$;

create or replace function public.kiosk_admin_categories(p_actor_id uuid, p_actor_code text)
returns table(id uuid, title text, active boolean, product_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query select c.id,c.title,c.active,count(p.id) from public.kiosk_categories c left join public.kiosk_products p on p.category_id=c.id group by c.id,c.title,c.active order by c.active desc,c.title;
end;
$$;

create or replace function public.kiosk_admin_upsert_category(p_actor_id uuid, p_actor_code text, p_category_id uuid, p_title text, p_active boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare out_id uuid;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(p_title)) < 2 then raise exception 'Kategorie-Titel zu kurz'; end if;
  if p_category_id is null then
    insert into public.kiosk_categories(title,active) values(trim(p_title),coalesce(p_active,true)) returning id into out_id;
  else
    update public.kiosk_categories set title=trim(p_title), active=coalesce(p_active,true), updated_at=now() where id=p_category_id returning id into out_id;
  end if;
  return out_id;
end;
$$;

create or replace function public.kiosk_admin_delete_category(p_actor_id uuid, p_actor_code text, p_category_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  update public.kiosk_products set category_id = null where category_id=p_category_id;
  delete from public.kiosk_categories where id=p_category_id;
end;
$$;

create or replace function public.kiosk_admin_products(p_actor_id uuid, p_actor_code text)
returns table(id uuid, name text, description text, price numeric, category_id uuid, category_title text, active boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query select p.id,p.name,p.description,p.price,p.category_id,coalesce(c.title,'Ohne Kategorie'),p.active,p.created_at from public.kiosk_products p left join public.kiosk_categories c on c.id=p.category_id order by p.active desc,coalesce(c.title,''),p.name;
end;
$$;

create or replace function public.kiosk_admin_upsert_product(p_actor_id uuid, p_actor_code text, p_product_id uuid, p_name text, p_description text, p_price numeric, p_category_id uuid, p_active boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare out_id uuid;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(p_name)) < 2 then raise exception 'Produkttitel zu kurz'; end if;
  if p_price < 0 then raise exception 'Preis ungültig'; end if;
  if p_product_id is null then
    insert into public.kiosk_products(name,description,price,category_id,active)
    values(trim(p_name),coalesce(trim(p_description),''),round(p_price,2),p_category_id,coalesce(p_active,true)) returning id into out_id;
  else
    update public.kiosk_products set name=trim(p_name), description=coalesce(trim(p_description),''), price=round(p_price,2), category_id=p_category_id, active=coalesce(p_active,true), updated_at=now() where id=p_product_id returning id into out_id;
  end if;
  return out_id;
end;
$$;

create or replace function public.kiosk_admin_delete_product(p_actor_id uuid, p_actor_code text, p_product_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if exists (select 1 from public.kiosk_entries where product_id=p_product_id) then
    update public.kiosk_products set active=false, updated_at=now() where id=p_product_id;
  else
    delete from public.kiosk_products where id=p_product_id;
  end if;
end;
$$;

create or replace function public.kiosk_admin_overview(p_actor_id uuid, p_actor_code text)
returns table(user_id uuid, user_key text, name text, role text, balance numeric, month_spent numeric, entries_count bigint)
language plpgsql security definer set search_path = public as $$
declare month_start date := date_trunc('month', now())::date; next_month date := (date_trunc('month', now()) + interval '1 month')::date;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  return query
  select u.id, u.user_key, u.name, u.role, public._kiosk_balance(u.id),
    coalesce(sum(e.total) filter (where e.deleted_at is null and e.created_at >= month_start and e.created_at < next_month),0) as month_spent,
    count(e.id) filter (where e.deleted_at is null) as entries_count
  from public.kiosk_users u
  left join public.kiosk_entries e on e.user_id=u.id
  where u.active=true
  group by u.id,u.user_key,u.name,u.role
  order by public._kiosk_balance(u.id), u.name;
end;
$$;

create or replace function public.kiosk_admin_add_payment(p_actor_id uuid, p_actor_code text, p_user_id uuid, p_amount numeric, p_note text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare out_id uuid;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  if p_amount <= 0 then raise exception 'Betrag muss größer als 0 sein'; end if;
  insert into public.kiosk_payments(user_id,amount,note,created_by) values(p_user_id,round(p_amount,2),coalesce(trim(p_note),''),p_actor_id) returning id into out_id;
  return out_id;
end;
$$;

create or replace function public.kiosk_admin_user_detail(p_actor_id uuid, p_actor_code text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; month_start date := date_trunc('month', now())::date; next_month date := (date_trunc('month', now()) + interval '1 month')::date;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select jsonb_build_object(
    'user', (select to_jsonb(u) || jsonb_build_object('balance', public._kiosk_balance(u.id)) from public.kiosk_users u where u.id=p_user_id),
    'entries', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select e.id,e.created_at,pr.name as product_name,c.title as category_title,e.quantity,e.total,e.deleted_at,e.deleted_reason
      from public.kiosk_entries e join public.kiosk_products pr on pr.id=e.product_id left join public.kiosk_categories c on c.id=pr.category_id
      where e.user_id=p_user_id and e.created_at >= month_start and e.created_at < next_month
      order by e.created_at desc
    ) x),'[]'::jsonb),
    'payments', coalesce((select jsonb_agg(y order by y.created_at desc) from (
      select p.id,p.created_at,p.amount,p.note from public.kiosk_payments p where p.user_id=p_user_id and p.created_at >= month_start and p.created_at < next_month order by p.created_at desc
    ) y),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.kiosk_admin_delete_entry(p_actor_id uuid, p_actor_code text, p_entry_id uuid, p_reason text default 'Fehlbuchung')
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  update public.kiosk_entries set deleted_at=now(), deleted_by=p_actor_id, deleted_reason=coalesce(trim(p_reason),'Fehlbuchung') where id=p_entry_id and deleted_at is null;
end;
$$;

create or replace function public.kiosk_admin_analysis(p_actor_id uuid, p_actor_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; month_start date := date_trunc('month', now())::date; next_month date := (date_trunc('month', now()) + interval '1 month')::date;
begin
  perform public._kiosk_require_admin(p_actor_id,p_actor_code);
  select jsonb_build_object(
    'month_label', to_char(month_start, 'TMMonth YYYY'),
    'total_revenue', coalesce((select sum(total) from public.kiosk_entries where deleted_at is null),0),
    'month_revenue', coalesce((select sum(total) from public.kiosk_entries where deleted_at is null and created_at>=month_start and created_at<next_month),0),
    'products', coalesce((select jsonb_agg(p order by (p->>'month_revenue')::numeric desc) from (
      select jsonb_build_object(
        'product_id', pr.id,
        'name', pr.name,
        'category', coalesce(c.title,'Ohne Kategorie'),
        'price', pr.price,
        'month_qty', coalesce(sum(e.quantity) filter (where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0),
        'month_revenue', coalesce(sum(e.total) filter (where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0),
        'all_qty', coalesce(sum(e.quantity) filter (where e.deleted_at is null),0),
        'all_revenue', coalesce(sum(e.total) filter (where e.deleted_at is null),0)
      ) p
      from public.kiosk_products pr left join public.kiosk_categories c on c.id=pr.category_id left join public.kiosk_entries e on e.product_id=pr.id
      group by pr.id,pr.name,c.title,pr.price
    ) s),'[]'::jsonb),
    'categories', coalesce((select jsonb_agg(cj order by (cj->>'month_revenue')::numeric desc) from (
      select jsonb_build_object(
        'category_id', c.id,
        'title', coalesce(c.title,'Ohne Kategorie'),
        'month_qty', coalesce(sum(e.quantity) filter (where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0),
        'month_revenue', coalesce(sum(e.total) filter (where e.created_at>=month_start and e.created_at<next_month and e.deleted_at is null),0),
        'all_qty', coalesce(sum(e.quantity) filter (where e.deleted_at is null),0),
        'all_revenue', coalesce(sum(e.total) filter (where e.deleted_at is null),0)
      ) cj
      from public.kiosk_categories c left join public.kiosk_products pr on pr.category_id=c.id left join public.kiosk_entries e on e.product_id=pr.id
      group by c.id,c.title
    ) s),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Erster Admin, falls noch keiner existiert.
insert into public.kiosk_users(user_key,name, role, code_hash)
select 'admin','Admin', 'admin', extensions.crypt('admin1234', extensions.gen_salt('bf'))
where not exists (select 1 from public.kiosk_users where role='admin');

insert into public.kiosk_products(name, description, price, category_id, active)
select v.name, v.description, v.price, (select id from public.kiosk_categories where title='Allgemein' limit 1), true
from (values ('Cola','Softgetränk',1.20),('Wasser','Mineralwasser',0.80),('Schokoriegel','Snack',1.00)) v(name,description,price)
where not exists (select 1 from public.kiosk_products);

grant execute on all functions in schema public to anon, authenticated;
