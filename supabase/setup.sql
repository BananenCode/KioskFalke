-- KioskFalke Supabase Setup
-- 1) In Supabase öffnen: SQL Editor > New query
-- 2) Alles einfügen und Run klicken
-- 3) Danach die App mit Project URL + Publishable Key verbinden

create extension if not exists pgcrypto;

create table if not exists public.kiosk_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('admin','user')) default 'user',
  code_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.kiosk_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now()
);

alter table public.kiosk_users enable row level security;
alter table public.kiosk_products enable row level security;
alter table public.kiosk_entries enable row level security;

drop policy if exists deny_users on public.kiosk_users;
drop policy if exists deny_products on public.kiosk_products;
drop policy if exists deny_entries on public.kiosk_entries;
create policy deny_users on public.kiosk_users for all using (false) with check (false);
create policy deny_products on public.kiosk_products for all using (false) with check (false);
create policy deny_entries on public.kiosk_entries for all using (false) with check (false);

create or replace function public._kiosk_actor(p_actor_id uuid, p_actor_code text)
returns table(id uuid, name text, role text)
language sql security definer set search_path = public as $$
  select u.id, u.name, u.role
  from kiosk_users u
  where u.id = p_actor_id
    and u.active = true
    and u.code_hash = crypt(p_actor_code, u.code_hash)
  limit 1;
$$;

create or replace function public._kiosk_require_admin(p_actor_id uuid, p_actor_code text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from _kiosk_actor(p_actor_id,p_actor_code) a where a.role = 'admin') then
    raise exception 'Admin-Berechtigung erforderlich';
  end if;
end;
$$;

create or replace function public.kiosk_login(p_code text)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('id', u.id, 'name', u.name, 'role', u.role)
    from kiosk_users u
    where u.active = true and u.code_hash = crypt(p_code, u.code_hash)
    limit 1
  ), '{}'::jsonb);
$$;

create or replace function public.kiosk_products(p_actor_id uuid, p_actor_code text)
returns table(id uuid, name text, price numeric, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from _kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  return query select p.id,p.name,p.price,p.active from kiosk_products p where p.active=true order by p.name;
end;
$$;

create or replace function public.kiosk_take_product(p_actor_id uuid, p_actor_code text, p_product_id uuid, p_quantity int default 1)
returns void
language plpgsql security definer set search_path = public as $$
declare v_price numeric(10,2);
begin
  if not exists (select 1 from _kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select price into v_price from kiosk_products where id=p_product_id and active=true;
  if v_price is null then raise exception 'Produkt nicht gefunden oder inaktiv'; end if;
  insert into kiosk_entries(user_id,product_id,quantity,unit_price) values(p_actor_id,p_product_id,greatest(p_quantity,1),v_price);
end;
$$;

create or replace function public.kiosk_my_dashboard(p_actor_id uuid, p_actor_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists (select 1 from _kiosk_actor(p_actor_id,p_actor_code)) then raise exception 'Ungültiger Zugang'; end if;
  select jsonb_build_object(
    'open_total', coalesce(sum(total) filter (where paid=false),0),
    'paid_total', coalesce(sum(total) filter (where paid=true),0),
    'items_count', count(*),
    'recent_items', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select e.created_at, p.name as product_name, e.quantity, e.total, e.paid
        from kiosk_entries e join kiosk_products p on p.id=e.product_id
        where e.user_id=p_actor_id
        order by e.created_at desc limit 20
      ) x
    ), '[]'::jsonb)
  ) into result
  from kiosk_entries where user_id=p_actor_id;
  return result;
end;
$$;

create or replace function public.kiosk_admin_users(p_actor_id uuid, p_actor_code text)
returns table(id uuid, name text, role text, active boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform _kiosk_require_admin(p_actor_id,p_actor_code);
  return query select u.id,u.name,u.role,u.active,u.created_at from kiosk_users u order by u.created_at desc;
end;
$$;

create or replace function public.kiosk_admin_create_user(p_actor_id uuid, p_actor_code text, p_name text, p_role text, p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform _kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(p_name)) < 2 then raise exception 'Name zu kurz'; end if;
  if p_role not in ('admin','user') then raise exception 'Rolle ungültig'; end if;
  if length(trim(p_code)) < 4 then raise exception 'Code mindestens 4 Zeichen'; end if;
  insert into kiosk_users(name, role, code_hash) values(trim(p_name), p_role, crypt(trim(p_code), gen_salt('bf'))) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.kiosk_admin_products(p_actor_id uuid, p_actor_code text)
returns table(id uuid, name text, price numeric, active boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform _kiosk_require_admin(p_actor_id,p_actor_code);
  return query select p.id,p.name,p.price,p.active,p.created_at from kiosk_products p order by p.active desc,p.name;
end;
$$;

create or replace function public.kiosk_admin_upsert_product(p_actor_id uuid, p_actor_code text, p_product_id uuid, p_name text, p_price numeric, p_active boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare out_id uuid;
begin
  perform _kiosk_require_admin(p_actor_id,p_actor_code);
  if length(trim(p_name)) < 2 then raise exception 'Produktname zu kurz'; end if;
  if p_price < 0 then raise exception 'Preis ungültig'; end if;
  if p_product_id is null then
    insert into kiosk_products(name,price,active) values(trim(p_name),round(p_price,2),coalesce(p_active,true)) returning id into out_id;
  else
    update kiosk_products set name=trim(p_name), price=round(p_price,2), active=coalesce(p_active,true) where id=p_product_id returning id into out_id;
  end if;
  return out_id;
end;
$$;

create or replace function public.kiosk_admin_overview(p_actor_id uuid, p_actor_code text)
returns table(user_id uuid, name text, role text, open_total numeric, paid_total numeric, entries_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform _kiosk_require_admin(p_actor_id,p_actor_code);
  return query
  select u.id, u.name, u.role,
    coalesce(sum(e.total) filter (where e.paid=false),0) as open_total,
    coalesce(sum(e.total) filter (where e.paid=true),0) as paid_total,
    count(e.id) as entries_count
  from kiosk_users u
  left join kiosk_entries e on e.user_id=u.id
  where u.active=true
  group by u.id,u.name,u.role
  order by open_total desc,u.name;
end;
$$;

create or replace function public.kiosk_admin_mark_paid(p_actor_id uuid, p_actor_code text, p_user_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _kiosk_require_admin(p_actor_id,p_actor_code);
  update kiosk_entries set paid=true, paid_at=now() where user_id=p_user_id and paid=false;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Erster Admin: Code bitte nach dem ersten Login im echten Betrieb nicht öffentlich teilen.
insert into public.kiosk_users(name, role, code_hash)
select 'Admin', 'admin', crypt('admin1234', gen_salt('bf'))
where not exists (select 1 from public.kiosk_users where role='admin');

insert into public.kiosk_products(name, price, active)
select * from (values ('Cola',1.20,true),('Wasser',0.80,true),('Schokoriegel',1.00,true)) v(name,price,active)
where not exists (select 1 from public.kiosk_products);
