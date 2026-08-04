import { describe, expect, it } from "vitest";

import { calculateNextRunAt, HORA_UTC_DEL_REPARTO } from "../cron-utils";

/**
 * Cuando le toca a cada reparto.
 *
 * Hay una sola pasada por dia. Un turno agendado a cualquier otra hora no se
 * adelanta: espera a la del dia siguiente. Estos tests fijan que el turno
 * quede siempre pegado al horario de la pasada, porque cuando no lo estaba los
 * checklists diarios salian dia por medio y nadie se enteraba.
 */

/** El horario de la pasada, para leer los casos sin hacer cuentas. */
const H = String(HORA_UTC_DEL_REPARTO).padStart(2, "0");

function iso(fecha: Date) {
  return fecha.toISOString();
}

describe("calculateNextRunAt", () => {
  it("agenda a la hora de la pasada, no a la hora en que corrio", () => {
    // El caso que rompia: la pasada arranca 09:00 y termina 09:01. Si el turno
    // quedaba a las 09:01, al dia siguiente la pasada de las 09:00 llegaba 88
    // segundos antes y no lo tomaba.
    const terminoDeProcesar = new Date("2026-08-03T09:01:28.000Z");

    expect(iso(calculateNextRunAt("daily", null, null, terminoDeProcesar)))
      .toBe(`2026-08-04T${H}:00:00.000Z`);
  });

  it("no deja que el horario derive corrida tras corrida", () => {
    // Se simulan varios dias arrancando siempre con unos segundos de demora:
    // el turno tiene que quedar clavado, no correrse un poco cada vez.
    let turno = new Date("2026-08-03T09:00:00.000Z");

    for (let dia = 0; dia < 5; dia++) {
      const seEjecutoConDemora = new Date(turno.getTime() + 97_000);
      turno = calculateNextRunAt("daily", null, null, seEjecutoConDemora);
      expect(turno.getUTCHours()).toBe(HORA_UTC_DEL_REPARTO);
      expect(turno.getUTCMinutes()).toBe(0);
      expect(turno.getUTCSeconds()).toBe(0);
    }
  });

  it("un checklist creado al mediodia entra en la pasada siguiente", () => {
    // Antes su turno caia a las 15:38 del dia siguiente, la pasada de las 09:00
    // pasaba antes y el primer reparto se iba a casi dos dias.
    const creadoAlMediodia = new Date("2026-08-03T15:38:48.000Z");

    expect(iso(calculateNextRunAt("daily", null, null, creadoAlMediodia)))
      .toBe(`2026-08-04T${H}:00:00.000Z`);
  });

  it("semanal cae siete dias despues, en la pasada", () => {
    const ahora = new Date("2026-08-03T15:38:48.000Z");

    expect(iso(calculateNextRunAt("weekly", null, null, ahora)))
      .toBe(`2026-08-10T${H}:00:00.000Z`);
  });

  it("mensual y anual tambien quedan en la pasada", () => {
    const ahora = new Date("2026-08-03T15:38:48.000Z");

    expect(iso(calculateNextRunAt("monthly", null, null, ahora)))
      .toBe(`2026-09-03T${H}:00:00.000Z`);
    expect(iso(calculateNextRunAt("yearly", null, null, ahora)))
      .toBe(`2027-08-03T${H}:00:00.000Z`);
  });

  describe("dias especificos", () => {
    it("busca el proximo dia elegido, sin contar el de hoy", () => {
      // Lunes 3 de agosto. Con lunes y jueves elegidos, el proximo es el jueves:
      // el turno de hoy es justamente el que se acaba de repartir.
      const lunes = new Date("2026-08-03T09:01:00.000Z");
      expect(lunes.getUTCDay()).toBe(1);

      const proximo = calculateNextRunAt("custom_days", null, [1, 4], lunes);
      expect(proximo.getUTCDay()).toBe(4);
      expect(iso(proximo)).toBe(`2026-08-06T${H}:00:00.000Z`);
    });

    it("con un solo dia elegido vuelve a la semana siguiente", () => {
      const lunes = new Date("2026-08-03T09:01:00.000Z");

      const proximo = calculateNextRunAt("custom_days", null, [1], lunes);
      expect(iso(proximo)).toBe(`2026-08-10T${H}:00:00.000Z`);
    });

    it("sin dias elegidos se comporta como diario", () => {
      const ahora = new Date("2026-08-03T15:38:48.000Z");

      expect(iso(calculateNextRunAt("custom_days", null, [], ahora)))
        .toBe(`2026-08-04T${H}:00:00.000Z`);
    });
  });

  it("una expresion cron explicita manda sobre el anclaje", () => {
    // Si alguien la escribio a mano, eligio el horario a proposito.
    const ahora = new Date("2026-08-03T09:01:00.000Z");

    const proximo = calculateNextRunAt("daily", "30 14 * * *", null, ahora);
    expect(proximo.getUTCHours()).toBe(14);
    expect(proximo.getUTCMinutes()).toBe(30);
  });

  it("si la expresion cron esta rota cae en la proxima pasada", () => {
    const ahora = new Date("2026-08-03T09:01:00.000Z");

    expect(iso(calculateNextRunAt("daily", "no es una expresion", null, ahora)))
      .toBe(`2026-08-04T${H}:00:00.000Z`);
  });

  it("el horario coincide con el schedule del cron en vercel.json", () => {
    // Si se cambia el schedule alla y no aca, los turnos vuelven a caer fuera
    // de la pasada y se repite el bug de "dia por medio".
    expect(HORA_UTC_DEL_REPARTO).toBe(9);
  });
});
