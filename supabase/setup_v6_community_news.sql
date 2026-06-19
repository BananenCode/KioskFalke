-- KioskFalke V6: Community-News, Likes, Kommentare und News-Hinweis
-- In Supabase im SQL Editor einmal vollständig ausführen.
-- Voraussetzung: setup_v4_paypal_liquid.sql und setup_v5_statement_full_history.sql wurden bereits ausgeführt.

create table if not exists public.kiosk_news (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null,
  body text not null,
  image_data_url text not null default '',
  created_by uuid not null references public.kiosk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kiosk_news_likes (
  news_id uuid not null references public.kiosk_news(id) on delete cascade,
  user_id uuid not null references public.kiosk_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (news_id, user_id)
);

create table if not exists public.kiosk_news_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  news_id uuid not null references public.kiosk_news(id) on delete cascade,
  user_id uuid not null references public.kiosk_users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.kiosk_news_reads (
  user_id uuid primary key references public.kiosk_users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists kiosk_news_created_at_idx on public.kiosk_news(created_at desc);
create index if not exists kiosk_news_comments_news_idx on public.kiosk_news_comments(news_id, created_at);
create index if not exists kiosk_news_likes_news_idx on public.kiosk_news_likes(news_id);

alter table public.kiosk_news enable row level security;
alter table public.kiosk_news_likes enable row level security;
alter table public.kiosk_news_comments enable row level security;
alter table public.kiosk_news_reads enable row level security;

drop policy if exists deny_news on public.kiosk_news;
drop policy if exists deny_news_likes on public.kiosk_news_likes;
drop policy if exists deny_news_comments on public.kiosk_news_comments;
drop policy if exists deny_news_reads on public.kiosk_news_reads;
create policy deny_news on public.kiosk_news for all using (false) with check (false);
create policy deny_news_likes on public.kiosk_news_likes for all using (false) with check (false);
create policy deny_news_comments on public.kiosk_news_comments for all using (false) with check (false);
create policy deny_news_reads on public.kiosk_news_reads for all using (false) with check (false);

drop function if exists public.kiosk_news_feed(uuid,text) cascade;
create or replace function public.kiosk_news_feed(p_actor_id uuid, p_actor_code text)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id, p_actor_code)) then
    raise exception 'Ungültiger Zugang';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'body', n.body,
        'image_data_url', n.image_data_url,
        'created_at', n.created_at,
        'author_name', u.name,
        'likes_count', (select count(*) from public.kiosk_news_likes l where l.news_id = n.id),
        'comments_count', (select count(*) from public.kiosk_news_comments c where c.news_id = n.id),
        'user_liked', exists(
          select 1 from public.kiosk_news_likes l
          where l.news_id = n.id and l.user_id = p_actor_id
        ),
        'comments', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'user_id', c.user_id,
              'author_name', cu.name,
              'body', c.body,
              'created_at', c.created_at
            ) order by c.created_at asc
          )
          from public.kiosk_news_comments c
          join public.kiosk_users cu on cu.id = c.user_id
          where c.news_id = n.id
        ), '[]'::jsonb)
      ) order by n.created_at desc
    ),
    '[]'::jsonb
  ) into result
  from public.kiosk_news n
  join public.kiosk_users u on u.id = n.created_by;

  return result;
end;
$$;

drop function if exists public.kiosk_news_has_unread(uuid,text) cascade;
create or replace function public.kiosk_news_has_unread(p_actor_id uuid, p_actor_code text)
returns boolean
language plpgsql
security definer
set search_path = public as $$
declare
  last_seen timestamptz;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id, p_actor_code)) then
    raise exception 'Ungültiger Zugang';
  end if;

  select r.last_seen_at into last_seen
  from public.kiosk_news_reads r
  where r.user_id = p_actor_id;

  return exists(
    select 1
    from public.kiosk_news n
    where n.created_by <> p_actor_id
      and n.created_at > coalesce(last_seen, '1970-01-01'::timestamptz)
  );
end;
$$;

drop function if exists public.kiosk_news_mark_seen(uuid,text) cascade;
create or replace function public.kiosk_news_mark_seen(p_actor_id uuid, p_actor_code text)
returns void
language plpgsql
security definer
set search_path = public as $$
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id, p_actor_code)) then
    raise exception 'Ungültiger Zugang';
  end if;

  insert into public.kiosk_news_reads(user_id, last_seen_at)
  values (p_actor_id, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;

drop function if exists public.kiosk_admin_create_news(uuid,text,text,text,text) cascade;
create or replace function public.kiosk_admin_create_news(
  p_actor_id uuid,
  p_actor_code text,
  p_title text,
  p_body text,
  p_image_data_url text
)
returns uuid
language plpgsql
security definer
set search_path = public as $$
declare
  out_id uuid;
  image_value text := coalesce(p_image_data_url, '');
begin
  perform public._kiosk_require_admin(p_actor_id, p_actor_code);

  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'Der Titel ist zu kurz'; end if;
  if length(trim(coalesce(p_title, ''))) > 120 then raise exception 'Der Titel darf maximal 120 Zeichen haben'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Bitte einen News-Text eingeben'; end if;
  if length(coalesce(p_body, '')) > 3000 then raise exception 'Der News-Text darf maximal 3000 Zeichen haben'; end if;
  if length(image_value) > 2200000 then raise exception 'Das Foto ist zu groß'; end if;
  if image_value <> '' and image_value !~ '^data:image/(jpeg|png|webp);base64,' then
    raise exception 'Fotoformat nicht unterstützt';
  end if;

  insert into public.kiosk_news(title, body, image_data_url, created_by)
  values (trim(p_title), trim(p_body), image_value, p_actor_id)
  returning id into out_id;

  insert into public.kiosk_news_reads(user_id, last_seen_at)
  values (p_actor_id, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;

  return out_id;
end;
$$;

drop function if exists public.kiosk_admin_delete_news(uuid,text,uuid) cascade;
create or replace function public.kiosk_admin_delete_news(p_actor_id uuid, p_actor_code text, p_news_id uuid)
returns void
language plpgsql
security definer
set search_path = public as $$
begin
  perform public._kiosk_require_admin(p_actor_id, p_actor_code);
  delete from public.kiosk_news where id = p_news_id;
  if not found then raise exception 'News-Beitrag nicht gefunden'; end if;
end;
$$;

drop function if exists public.kiosk_toggle_news_like(uuid,text,uuid) cascade;
create or replace function public.kiosk_toggle_news_like(p_actor_id uuid, p_actor_code text, p_news_id uuid)
returns integer
language plpgsql
security definer
set search_path = public as $$
declare
  total_likes integer;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id, p_actor_code)) then
    raise exception 'Ungültiger Zugang';
  end if;
  if not exists (select 1 from public.kiosk_news where id = p_news_id) then
    raise exception 'News-Beitrag nicht gefunden';
  end if;

  if exists (select 1 from public.kiosk_news_likes where news_id = p_news_id and user_id = p_actor_id) then
    delete from public.kiosk_news_likes where news_id = p_news_id and user_id = p_actor_id;
  else
    insert into public.kiosk_news_likes(news_id, user_id) values (p_news_id, p_actor_id);
  end if;

  select count(*)::integer into total_likes from public.kiosk_news_likes where news_id = p_news_id;
  return total_likes;
end;
$$;

drop function if exists public.kiosk_add_news_comment(uuid,text,uuid,text) cascade;
create or replace function public.kiosk_add_news_comment(p_actor_id uuid, p_actor_code text, p_news_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public as $$
declare
  out_id uuid;
begin
  if not exists (select 1 from public._kiosk_actor(p_actor_id, p_actor_code)) then
    raise exception 'Ungültiger Zugang';
  end if;
  if not exists (select 1 from public.kiosk_news where id = p_news_id) then
    raise exception 'News-Beitrag nicht gefunden';
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Der Kommentar ist leer'; end if;
  if length(coalesce(p_body, '')) > 500 then raise exception 'Der Kommentar darf maximal 500 Zeichen haben'; end if;

  insert into public.kiosk_news_comments(news_id, user_id, body)
  values (p_news_id, p_actor_id, trim(p_body))
  returning id into out_id;
  return out_id;
end;
$$;

drop function if exists public.kiosk_delete_news_comment(uuid,text,uuid) cascade;
create or replace function public.kiosk_delete_news_comment(p_actor_id uuid, p_actor_code text, p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public as $$
declare
  owner_id uuid;
  actor_role text;
begin
  select a.role into actor_role from public._kiosk_actor(p_actor_id, p_actor_code) a;
  if actor_role is null then raise exception 'Ungültiger Zugang'; end if;

  select c.user_id into owner_id from public.kiosk_news_comments c where c.id = p_comment_id;
  if owner_id is null then raise exception 'Kommentar nicht gefunden'; end if;
  if owner_id <> p_actor_id and actor_role <> 'admin' then raise exception 'Keine Berechtigung zum Löschen'; end if;

  delete from public.kiosk_news_comments where id = p_comment_id;
end;
$$;

grant execute on function public.kiosk_news_feed(uuid,text) to anon, authenticated;
grant execute on function public.kiosk_news_has_unread(uuid,text) to anon, authenticated;
grant execute on function public.kiosk_news_mark_seen(uuid,text) to anon, authenticated;
grant execute on function public.kiosk_admin_create_news(uuid,text,text,text,text) to anon, authenticated;
grant execute on function public.kiosk_admin_delete_news(uuid,text,uuid) to anon, authenticated;
grant execute on function public.kiosk_toggle_news_like(uuid,text,uuid) to anon, authenticated;
grant execute on function public.kiosk_add_news_comment(uuid,text,uuid,text) to anon, authenticated;
grant execute on function public.kiosk_delete_news_comment(uuid,text,uuid) to anon, authenticated;
