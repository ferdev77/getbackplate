import { CronExpressionParser } from 'cron-parser';

/**
 * Cuando le toca a cada reparto periodico.
 *
 * El reparto no ocurre en cualquier momento: hay una sola pasada por dia, la
 * del cron de Vercel (`/api/webhooks/cron/process-recurrence`, configurado en
 * vercel.json como "0 9 * * *"). Un turno agendado a cualquier otra hora no se
 * adelanta ni se atrasa: espera a la proxima pasada.
 *
 * Por eso el proximo turno se ancla SIEMPRE al horario de esa pasada. Antes se
 * calculaba como "el momento en que se ejecuto + 1 dia", y eso derivaba:
 *
 *   dia 1  la pasada arranca 09:00 y termina 09:01  ->  agenda 09:01 del dia 2
 *   dia 2  la pasada arranca 09:00, el turno vence 09:01: 88 segundos tarde,
 *          no lo toma  ->  no se reparte nada
 *   dia 3  ya esta vencido, lo toma y vuelve a agendar 09:01
 *
 * Resultado real en produccion: los checklists diarios salian dia por medio
 * (30 y 31 de julio si, 1 de agosto si, 2 no, 3 si, 4 no). Cualquier demora de
 * procesamiento corria el horario mas alla de la pasada del dia siguiente y no
 * se recuperaba nunca.
 *
 * Anclando al horario de la pasada, el turno queda clavado y no deriva. Ademas
 * un checklist creado a las 15:38 pasa a repartirse en la pasada siguiente, en
 * vez de esperar casi dos dias porque su turno caia a las 15:38.
 */

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom_days';

/**
 * Hora UTC de la pasada diaria. Tiene que coincidir con el schedule de
 * process-recurrence en vercel.json ("0 9 * * *"). Si se cambia alla, se cambia
 * aca: si quedan distintos, los turnos vuelven a caer fuera de la pasada.
 */
export const HORA_UTC_DEL_REPARTO = 9;

/** La misma fecha, pero a la hora en que pasa el reparto. */
function alHorarioDelReparto(fecha: Date): Date {
  const anclada = new Date(fecha);
  anclada.setUTCHours(HORA_UTC_DEL_REPARTO, 0, 0, 0);
  return anclada;
}

export function calculateNextRunAt(
  recurrenceType: RecurrenceType,
  cronExpression?: string | null,
  customDays?: number[] | null,
  now: Date = new Date()
): Date {
  // Una expresion cron explicita manda: quien la escribio eligio el horario a
  // mano y no se le ancla nada.
  //
  // Se usa CronExpressionParser.parse, la API de cron-parser v5. Antes se
  // llamaba a parseExpression, que es de v4 y en v5 no existe: la llamada
  // reventaba y caia siempre en el fallback de abajo, o sea que ninguna
  // expresion cron se respetaba. Hoy no hay ningun registro que use este campo
  // -- por eso no se noto -- pero la rama estaba muerta.
  //
  // La zona horaria se fija en UTC a proposito: si no, el parser usa la del
  // proceso y el horario cambiaria segun donde corra.
  if (cronExpression) {
    try {
      const interval = CronExpressionParser.parse(cronExpression, { currentDate: now, tz: "UTC" });
      return interval.next().toDate();
    } catch (e) {
      console.error('Error parsing cron expression', e);
      // Fallback: la proxima pasada.
      return alHorarioDelReparto(sumarDias(now, 1));
    }
  }

  switch (recurrenceType) {
    case 'daily':
      return alHorarioDelReparto(sumarDias(now, 1));

    case 'weekly':
      return alHorarioDelReparto(sumarDias(now, 7));

    case 'monthly': {
      const next = new Date(now);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return alHorarioDelReparto(next);
    }

    case 'yearly': {
      const next = new Date(now);
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return alHorarioDelReparto(next);
    }

    case 'custom_days':
      return alHorarioDelReparto(proximoDiaElegido(now, customDays));

    default:
      return alHorarioDelReparto(sumarDias(now, 1));
  }
}

function sumarDias(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

/**
 * El proximo dia de la semana que este en la lista (0 = domingo).
 *
 * Se empieza a buscar desde mañana: el turno de hoy, si lo habia, es el que
 * acaba de correr. Sin dias elegidos se comporta como diario.
 */
function proximoDiaElegido(now: Date, customDays?: number[] | null): Date {
  if (!customDays || customDays.length === 0) return sumarDias(now, 1);

  for (let adelanto = 1; adelanto <= 7; adelanto++) {
    const candidato = sumarDias(now, adelanto);
    if (customDays.includes(candidato.getUTCDay())) return candidato;
  }

  return sumarDias(now, 1);
}
