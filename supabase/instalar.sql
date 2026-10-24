-- =====================================================================
--  QUINIELA DE LA PEÑA · instalación de la base de datos (Supabase)
--  Pega TODO este archivo en Supabase > SQL Editor > New query y pulsa RUN.
--  Se puede ejecutar más de una vez sin romper nada.
-- =====================================================================

-- ---------- Jugadores de la peña ----------
create table if not exists public.jugadores (
  nombre   text primary key,                 -- CHONCHA, FEDE, QUINO
  usuario  text not null unique,             -- lo que se escribe para entrar: choncha, fede, quino
  orden    int  not null,                    -- orden de los turnos
  admin    boolean not null default false,   -- puede rellenar por quien aún no ha entrado
  user_id  uuid unique references auth.users(id) on delete set null
);

insert into public.jugadores (nombre, usuario, orden, admin) values
  ('CHONCHA','choncha',1,true),
  ('FEDE','fede',2,false),
  ('QUINO','quino',3,false)
on conflict (nombre) do nothing;

-- ---------- Quinielas (una por jornada) ----------
create table if not exists public.quinielas (
  id          bigint generated always as identity primary key,
  temporada   text not null,
  jornada     int  not null check (jornada between 1 and 80),
  fecha       date,
  jugador     text not null references public.jugadores(nombre),
  estado      text not null default 'borrador' check (estado in ('borrador','sellada','escrutada')),
  partidos    jsonb,          -- [{local, visitante, signos}] x14
  pleno       jsonb,          -- {local, visitante, l, v}
  resultados  jsonb,          -- ["1","X",...] x14
  pleno_res   jsonb,          -- {l, v}
  aciertos    int check (aciertos between 0 and 15),
  premio      numeric(10,2),
  coste       numeric(10,2) not null default 12,
  nota        text,
  cambios     jsonb not null default '[]'::jsonb,
  creada      timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  unique (temporada, jornada)
);

-- ---------- Funciones de ayuda ----------
create or replace function public.mi_jugador() returns text
language sql stable security definer set search_path = public as $$
  select nombre from public.jugadores where user_id = auth.uid()
$$;

create or replace function public.soy_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin from public.jugadores where user_id = auth.uid()), false)
$$;

create or replace function public.puedo_escribir(j text) returns boolean
language sql stable security definer set search_path = public as $$
  select j = public.mi_jugador()
      or (public.soy_admin() and exists (select 1 from public.jugadores where nombre = j and user_id is null))
$$;

-- Al crear un usuario "fede@...", se vincula solo con el jugador FEDE
create or replace function public.vincular_jugador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.jugadores set user_id = new.id
   where usuario = lower(split_part(new.email, '@', 1)) and user_id is null;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.vincular_jugador();

-- por si los usuarios se crearon antes de ejecutar este archivo
update public.jugadores j set user_id = u.id
  from auth.users u
 where j.user_id is null and j.usuario = lower(split_part(u.email, '@', 1));

-- ---------- Seguridad: todos leen, cada uno solo modifica lo suyo ----------
alter table public.jugadores enable row level security;
alter table public.quinielas enable row level security;

drop policy if exists "leer jugadores" on public.jugadores;
create policy "leer jugadores" on public.jugadores for select to authenticated using (true);

drop policy if exists "leer quinielas" on public.quinielas;
create policy "leer quinielas" on public.quinielas for select to authenticated using (true);

drop policy if exists "crear mis quinielas" on public.quinielas;
create policy "crear mis quinielas" on public.quinielas for insert to authenticated
  with check (public.puedo_escribir(jugador));

drop policy if exists "editar mis quinielas" on public.quinielas;
create policy "editar mis quinielas" on public.quinielas for update to authenticated
  using (public.puedo_escribir(jugador)) with check (public.puedo_escribir(jugador));

drop policy if exists "borrar mis quinielas" on public.quinielas;
create policy "borrar mis quinielas" on public.quinielas for delete to authenticated
  using (public.puedo_escribir(jugador));

-- Una quiniela sellada no se puede cambiar ni borrar
create or replace function public.proteger_sellada() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'borrador' and old.partidos is not null then
      raise exception 'La quiniela de la jornada % ya está sellada y no se puede borrar', old.jornada;
    end if;
    return old;
  end if;
  if old.estado <> 'borrador' and old.partidos is not null then
    if new.partidos is distinct from old.partidos
       or new.pleno is distinct from old.pleno
       or new.jugador is distinct from old.jugador
       or new.jornada is distinct from old.jornada
       or new.temporada is distinct from old.temporada then
      raise exception 'La quiniela de la jornada % ya está sellada: los signos no se pueden cambiar', old.jornada;
    end if;
    if new.estado = 'borrador' then
      raise exception 'Una quiniela sellada no puede volver a borrador';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists proteger_sellada on public.quinielas;
create trigger proteger_sellada before update or delete on public.quinielas
  for each row execute function public.proteger_sellada();


-- Avisar en directo a los demás cuando alguien cambia una quiniela
do $$ begin
  alter publication supabase_realtime add table public.quinielas;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ---------- Histórico de la temporada 2026/27 (del Excel) ----------
insert into public.quinielas (temporada, jornada, fecha, jugador, estado, aciertos, premio, coste, nota) values
  ('2026/27', 3, '2026-08-30', 'CHONCHA', 'escrutada', 12, 25.68, 12, null),
  ('2026/27', 4, '2026-09-06', 'FEDE',    'escrutada',  9,  0.00, 12, null),
  ('2026/27', 5, '2026-09-13', 'QUINO',   'escrutada',  8,  0.00, 12, 'Fecha corregida: en el Excel ponía 13/06/2026.'),
  ('2026/27', 6, '2026-09-16', 'CHONCHA', 'escrutada',  7,  0.00, 12, null),
  ('2026/27', 7, '2026-09-20', 'FEDE',    'escrutada', 10,  0.00, 12, 'Fecha corregida: en el Excel ponía 20/06/2026.'),
  ('2026/27', 8, '2026-10-11', 'QUINO',   'escrutada', 12,  3.91, 12, null),
  ('2026/27', 9, '2026-10-18', 'CHONCHA', 'escrutada', 12, 12.79, 12, null)
on conflict (temporada, jornada) do nothing;

-- Comprobación: debe salir 3 jugadores y 7 quinielas
select (select count(*) from public.jugadores) as jugadores,
       (select count(*) from public.quinielas) as quinielas;
