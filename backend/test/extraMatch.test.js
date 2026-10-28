import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Se reemplaza la base por un doble antes de cargar el servicio (el servicio hace require('../db'))
const dbPath = require.resolve('../src/db.js');
const db = {
  tournament: {
    findUnique: async ({ where }) => ({
      T1: { id: 'T1', status: 'ACTIVE', pausedAt: null },
      TF: { id: 'TF', status: 'FINISHED', pausedAt: null },
      TP: { id: 'TP', status: 'ACTIVE', pausedAt: new Date() },
    })[where.id] || null,
  },
  stage: {
    findFirst: async ({ where }) => (where.id === 'Z1' && where.tournamentId === 'T1' && where.type === 'LEAGUE'
      ? { id: 'Z1', name: 'Zona A', teams: [{ teamId: 'a' }, { teamId: 'b' }] } : null),
  },
  matchday: { findFirst: async ({ where }) => (where.id === 'D1' && where.stageId === 'Z1' ? { id: 'D1', number: 3 } : null) },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const S = require('../src/services/extraMatch.js');

const plan = (o) => S.planStanding({ tournamentId: 'T1', stageId: 'Z1', teamAId: 'a', teamBId: 'b', ...o });

describe('extraMatch: torneo que admite partidos', () => {
  it('acepta un torneo en curso', async () => {
    expect((await S.assertTournamentOpen('T1')).id).toBe('T1');
  });
  it('rechaza finalizado, pausado e inexistente', async () => {
    await expect(S.assertTournamentOpen('TF')).rejects.toMatchObject({ status: 409 });
    await expect(S.assertTournamentOpen('TP')).rejects.toMatchObject({ status: 409 });
    await expect(S.assertTournamentOpen('X')).rejects.toMatchObject({ status: 404 });
  });
});

describe('extraMatch: sumar a la tabla', () => {
  it('exige torneo, zona y los dos equipos de esa zona', async () => {
    await expect(plan({ tournamentId: null })).rejects.toMatchObject({ status: 400 });
    await expect(plan({ stageId: undefined })).rejects.toMatchObject({ status: 400 });
    await expect(plan({ stageId: 'ZX' })).rejects.toMatchObject({ status: 404 });
    await expect(plan({ teamBId: null })).rejects.toMatchObject({ status: 409 });
    await expect(plan({ teamBId: 'c' })).rejects.toMatchObject({ status: 409 });
    await expect(plan({ matchdayId: 'D9' })).rejects.toMatchObject({ status: 404 });
  });
  it('usa una fecha existente o crea una nueva', async () => {
    expect((await plan({ matchdayId: 'D1' })).matchday.id).toBe('D1');
    expect((await plan({ matchdayId: 'new' })).matchday).toBeNull();
    expect((await plan({})).matchday).toBeNull();
  });
  it('ubica el partido al final de la fecha o en una fecha nueva con el número siguiente', async () => {
    const created = [];
    const tx = {
      matchday: { aggregate: async () => ({ _max: { number: 4 } }), create: async ({ data }) => { created.push(data); return { id: 'NEW', ...data }; } },
      match: { aggregate: async ({ where }) => ({ _max: { slot: where.matchdayId === 'NEW' ? null : 5 } }) },
    };
    expect(await S.placeInFixture(tx, await plan({ matchdayId: 'D1' }), null)).toEqual({ stageId: 'Z1', matchdayId: 'D1', slot: 6 });
    const when = new Date('2026-11-02T15:00:00Z');
    expect(await S.placeInFixture(tx, await plan({ matchdayId: 'new' }), when)).toEqual({ stageId: 'Z1', matchdayId: 'NEW', slot: 1 });
    expect(created[0].number).toBe(5);
    expect(created[0].date).toBe(when);
  });
});
