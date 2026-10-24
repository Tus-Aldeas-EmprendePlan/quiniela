-- =====================================================================
--  QUINIELA DE LA PEÑA · bloqueo de quinielas selladas
--  Pega este archivo en Supabase > SQL Editor > New query y pulsa RUN.
--  Una vez sellada, nadie (ni su dueño) puede cambiar los signos ni el pleno,
--  devolverla a borrador ni borrarla. Sí se pueden apuntar resultados, aciertos y premio.
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

select 'Bloqueo de quinielas selladas activado' as resultado;
