-- =====================================================================
--  QUINIELA DE LA PEÑA · corrección de boletos sellados por la administradora
--  Pega este archivo en Supabase > SQL Editor > New query y pulsa RUN (una sola vez).
--  Sirve para corregir un boleto sellado que se pasó mal a la app (con la foto del boleto
--  validado delante). Solo la administradora (Choncha) puede hacerlo, la app pide el motivo
--  y lo deja apuntado en «Cambios registrados». Los demás siguen sin poder tocar una sellada.
-- =====================================================================
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
    if new.jugador is distinct from old.jugador
       or new.jornada is distinct from old.jornada
       or new.temporada is distinct from old.temporada then
      raise exception 'La quiniela de la jornada % ya está sellada: no se puede cambiar de jugador ni de jornada', old.jornada;
    end if;
    if (new.partidos is distinct from old.partidos or new.pleno is distinct from old.pleno) and not public.soy_admin() then
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

-- La administradora puede guardar la corrección en la quiniela de cualquiera
drop policy if exists "admin corrige quinielas" on public.quinielas;
create policy "admin corrige quinielas" on public.quinielas for update to authenticated
  using (public.soy_admin()) with check (public.soy_admin());

select 'Corrección de boletos sellados por la administradora activada' as resultado;
