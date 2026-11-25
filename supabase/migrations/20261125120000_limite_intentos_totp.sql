-- =============================================================================
-- Límite de intentos de código TOTP (revisión de seguridad, hallazgo 1).
--
-- Sin límite, un código incorrecto no costaba nada y se podían pedir retos de
-- step-up nuevos sin fin: con un access_token robado se podía adivinar el
-- segundo factor por fuerza bruta. Ahora cada persona tiene como mucho
-- p_max_attempts intentos por ventana fija de p_window_seconds, contando la
-- confirmación de la inscripción y la verificación del step-up. Los valores
-- los fija la API (TOTP_ATTEMPT_LIMIT en supabase/functions/api/routes/mfa.ts).
--
-- El contador vive en mfa_factors porque las Edge Functions no comparten
-- memoria (decisión 0002). Volver a pedir la inscripción no lo reinicia: el
-- upsert de startMfaEnrollment no toca estas columnas.
-- =============================================================================

alter table public.mfa_factors
  add column totp_attempts integer not null default 0
    check (totp_attempts >= 0),
  -- Inicio de la ventana de intentos actual; null si no hay intentos.
  add column totp_attempts_window_start timestamptz;

-- Cuenta un intento ANTES de verificar el código, en una sola sentencia
-- UPDATE: la fila queda bloqueada durante la actualización, así que
-- peticiones en paralelo no pueden saltarse el límite. Si la ventana ya pasó,
-- abre una nueva con este intento. Devuelve si el intento está permitido y
-- cuándo termina la ventana; ninguna fila si la persona no tiene factor.
create function public.register_totp_attempt(
  p_user_id uuid,
  p_now timestamptz,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_at timestamptz)
language sql
set search_path = ''
as $$
  update public.mfa_factors
     set totp_attempts = case
           when totp_attempts_window_start is null
             or totp_attempts_window_start
                  <= p_now - make_interval(secs => p_window_seconds)
           then 1
           else totp_attempts + 1
         end,
         totp_attempts_window_start = case
           when totp_attempts_window_start is null
             or totp_attempts_window_start
                  <= p_now - make_interval(secs => p_window_seconds)
           then p_now
           else totp_attempts_window_start
         end
   where user_id = p_user_id
  returning
    mfa_factors.totp_attempts <= p_max_attempts,
    mfa_factors.totp_attempts_window_start
      + make_interval(secs => p_window_seconds);
$$;

-- Igual que en el esquema inicial, y además un código correcto reinicia el
-- contador de intentos.
create or replace function public.consume_totp_step(p_user_id uuid, p_step bigint)
returns boolean
language sql
set search_path = ''
as $$
  with updated as (
    update public.mfa_factors
       set last_used_step = p_step,
           totp_attempts = 0,
           totp_attempts_window_start = null
     where user_id = p_user_id
       and confirmed_at is not null
       and (last_used_step is null or last_used_step < p_step)
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke execute on function
  public.register_totp_attempt(uuid, timestamptz, integer, integer)
from public, anon, authenticated;
