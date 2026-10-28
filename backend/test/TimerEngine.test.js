import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const TimerEngine = createRequire(import.meta.url)('../src/timers/TimerEngine.js');

function make(modality = 'foam') {
  const events = { expired: [], timeoutExpired: [], finished: 0 };
  const engine = new TimerEngine('m1', {
    onSetExpired: (e) => events.expired.push(e),
    onTimeoutExpired: (e) => events.timeoutExpired.push(e),
    onMatchFinished: () => { events.finished += 1; },
  });
  engine.setModality(modality);
  return { engine, events };
}
const sec = (n) => vi.advanceTimersByTime(n * 1000);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('TimerEngine: estado inicial y modalidad', () => {
  it('arranca con 20:00 de partido y 3:00 de set, ambos pausados', () => {
    const { engine } = make();
    expect(engine.matchTimeLeft).toBe(20 * 60);
    expect(engine.setTimeLeft).toBe(3 * 60);
    expect(engine.isMatchPaused).toBe(true);
    expect(engine.isSetPaused).toBe(true);
  });

  it('rechaza una modalidad inválida', () => {
    const { engine } = make();
    expect(() => engine.setModality('otra')).toThrow();
  });
});

describe('TimerEngine: timers independientes', () => {
  it('iniciar solo el partido no mueve el set', () => {
    const { engine } = make();
    engine.start('match');
    sec(5);
    expect(engine.matchTimeLeft).toBe(20 * 60 - 5);
    expect(engine.setTimeLeft).toBe(3 * 60);
  });

  it('iniciar solo el set no mueve el partido', () => {
    const { engine } = make();
    engine.start('set');
    sec(5);
    expect(engine.setTimeLeft).toBe(3 * 60 - 5);
    expect(engine.matchTimeLeft).toBe(20 * 60);
  });

  it('la pausa grupal detiene ambos a la vez', () => {
    const { engine } = make();
    engine.start('both');
    sec(10);
    engine.pause('both');
    const m = engine.matchTimeLeft;
    const s = engine.setTimeLeft;
    sec(30);
    expect(engine.matchTimeLeft).toBe(m);
    expect(engine.setTimeLeft).toBe(s);
  });

  it('reset del set lo vuelve a 3:00 y lo deja en pausa', () => {
    const { engine } = make();
    engine.start('both');
    sec(20);
    engine.reset('set');
    expect(engine.setTimeLeft).toBe(3 * 60);
    expect(engine.isSetPaused).toBe(true);
    expect(engine.isMatchPaused).toBe(false);
  });
});

describe('TimerEngine: automatismos al expirar el set', () => {
  it('Foam: avisa muerte súbita', () => {
    const { engine, events } = make('foam');
    engine.start('both');
    sec(3 * 60);
    expect(events.expired).toHaveLength(1);
    expect(events.expired[0].action).toBe('suddenDeath');
    expect(engine.isSetPaused).toBe(true);
  });

  it('Cloth: avisa +2 puntos y reinicio de set', () => {
    const { engine, events } = make('cloth');
    engine.start('both');
    sec(3 * 60);
    expect(events.expired).toHaveLength(1);
    expect(events.expired[0].action).toBe('resetWithBonus');
    expect(events.expired[0].message).toBe('SET FINALIZADO');
  });

  it('Cloth: si el set expira con menos de 2:00 de partido, lo deja en 1:30 y pausado', () => {
    const { engine } = make('cloth');
    engine.setTime('match', 150); // al expirar el set quedan 50 s de partido (< 2:00)
    engine.setTime('set', 100);
    engine.start('both');
    sec(100);
    expect(engine.matchTimeLeft).toBe(90);
    expect(engine.isMatchPaused).toBe(true);
  });
});

describe('TimerEngine: fin del partido', () => {
  it('al llegar a 0 pausa el partido y avisa', () => {
    const { engine, events } = make('foam');
    engine.setTime('match', 3);
    engine.start('match');
    sec(3);
    expect(engine.matchTimeLeft).toBe(0);
    expect(engine.isMatchPaused).toBe(true);
    expect(events.expired.at(-1).source).toBe('match');
  });

  it('no se puede reanudar un partido en 0', () => {
    const { engine } = make();
    engine.setTime('match', 0);
    engine.resume('match');
    expect(engine.isMatchPaused).toBe(true);
  });

  it('finishHalf pasa al 2º tiempo y al terminar el 2º finaliza el partido', () => {
    const { engine, events } = make();
    expect(engine.finishHalf()).toEqual({ matchEnded: false });
    expect(engine.matchHalf).toBe(2);
    expect(engine.matchTimeLeft).toBe(20 * 60);
    expect(engine.finishHalf()).toEqual({ matchEnded: true });
    expect(events.finished).toBe(1);
  });
});

describe('TimerEngine: tiempo muerto', () => {
  it('congela los relojes y los reanuda al terminar', () => {
    const { engine } = make();
    engine.start('both');
    sec(10);
    expect(engine.startTimeout('A').ok).toBe(true);
    const m = engine.matchTimeLeft;
    sec(30);
    expect(engine.matchTimeLeft).toBe(m);
    engine.endTimeout();
    expect(engine.isMatchPaused).toBe(false);
    sec(5);
    expect(engine.matchTimeLeft).toBe(m - 5);
  });

  it('cada equipo tiene uno por tiempo', () => {
    const { engine } = make();
    expect(engine.startTimeout('A').ok).toBe(true);
    engine.endTimeout();
    expect(engine.startTimeout('A').ok).toBe(false);
    expect(engine.startTimeout('B').ok).toBe(true);
  });

  it('no permite dos a la vez ni equipos inválidos', () => {
    const { engine } = make();
    expect(engine.startTimeout('Z').ok).toBe(false);
    engine.startTimeout('A');
    expect(engine.startTimeout('B').ok).toBe(false);
  });

  it('dura 1 minuto y avisa al terminar', () => {
    const { engine, events } = make();
    engine.startTimeout('A');
    sec(60);
    expect(engine.isTimeoutRunning).toBe(false);
    expect(events.timeoutExpired).toHaveLength(1);
  });

  it('deshacer devuelve el tiempo muerto al equipo y restaura los relojes', () => {
    const { engine } = make();
    engine.start('both');
    sec(10);
    engine.startTimeout('A');
    expect(engine.cancelTimeout().ok).toBe(true);
    expect(engine.timeoutTeam).toBeNull();
    expect(engine.isMatchPaused).toBe(false);
    expect(engine.isSetPaused).toBe(false);
    expect(engine.startTimeout('A').ok).toBe(true); // lo conserva
  });

  it('no se puede deshacer si ya terminó', () => {
    const { engine } = make();
    engine.startTimeout('A');
    sec(60);
    expect(engine.cancelTimeout().ok).toBe(false);
  });

  it('no se puede iniciar el reloj durante un tiempo muerto', () => {
    const { engine } = make();
    engine.startTimeout('A');
    engine.start('both');
    expect(engine.isMatchPaused).toBe(true);
  });
});

describe('TimerEngine: ajustes manuales', () => {
  it('adjust no baja de 0', () => {
    const { engine } = make();
    engine.adjust('set', -9999);
    expect(engine.setTimeLeft).toBe(0);
  });

  it('timer inválido lanza error', () => {
    const { engine } = make();
    expect(() => engine.reset('x')).toThrow();
    expect(() => engine.adjust('x', 1)).toThrow();
  });
});

describe('TimerEngine: persistencia y recuperación del reloj', () => {
  function withPersist() {
    const saves = [];
    const engine = new TimerEngine('m1', { onPersist: (state, opts) => saves.push({ state, ...opts }) });
    engine.setModality('foam');
    return { engine, saves };
  }

  it('toJSON expone el estado completo', () => {
    const { engine } = make();
    engine.start('both');
    sec(5);
    const s = engine.toJSON();
    expect(s.matchTimeLeft).toBe(20 * 60 - 5);
    expect(s.setTimeLeft).toBe(3 * 60 - 5);
    expect(s.isMatchPaused).toBe(false);
    expect(s.timeoutsUsed).toEqual({ A: { 1: false, 2: false }, B: { 1: false, 2: false } });
  });

  it('onPersist distingue el conteo (tick) de los comandos', () => {
    const { engine, saves } = withPersist();
    saves.length = 0;
    engine.start('both'); // comando
    sec(3); // 3 ticks
    engine.pause('both'); // comando
    expect(saves.map((x) => x.tick)).toEqual([false, true, true, true, false]);
  });

  it('restore recupera tiempos, tiempo y tiempos muertos usados, siempre en pausa', () => {
    const { engine } = make();
    engine.restore({
      matchTimeLeft: 754, setTimeLeft: 41, timeoutTimeLeft: 60,
      isMatchPaused: false, isSetPaused: false, isTimeoutRunning: false,
      matchHalf: 2, clothAutoResetUsed: true,
      timeoutTeam: null, timeoutHalf: null,
      timeoutsUsed: { A: { 1: true, 2: false }, B: { 1: false, 2: false } },
      resumeAfterTimeout: { match: false, set: false },
    });
    expect(engine.matchTimeLeft).toBe(754);
    expect(engine.setTimeLeft).toBe(41);
    expect(engine.matchHalf).toBe(2);
    expect(engine.isMatchPaused).toBe(true);
    expect(engine.isSetPaused).toBe(true);
    expect(engine.intervalId).toBeNull();
    expect(engine.timeoutsUsed.A[1]).toBe(true);
    expect(engine.recovered).toBe(true);
    sec(10); // no corre solo
    expect(engine.matchTimeLeft).toBe(754);
  });

  it('un tiempo muerto en curso se recupera detenido y no reanuda los relojes solo', () => {
    const { engine } = make();
    engine.restore({
      matchTimeLeft: 600, setTimeLeft: 100, timeoutTimeLeft: 38,
      isMatchPaused: true, isSetPaused: true, isTimeoutRunning: true,
      matchHalf: 1, clothAutoResetUsed: false,
      timeoutTeam: 'B', timeoutHalf: 1,
      timeoutsUsed: { A: { 1: false, 2: false }, B: { 1: true, 2: false } },
      resumeAfterTimeout: { match: true, set: true },
    });
    expect(engine.timeoutTeam).toBe('B');
    expect(engine.isTimeoutRunning).toBe(false);
    expect(engine.timeoutTimeLeft).toBe(38);
    expect(engine.endTimeout()).toEqual({ ok: true });
    expect(engine.isMatchPaused).toBe(true);
    expect(engine.isSetPaused).toBe(true);
  });

  it('start limpia la marca de recuperado y el reloj vuelve a correr', () => {
    const { engine } = make();
    engine.restore({ matchTimeLeft: 300, setTimeLeft: 60, timeoutsUsed: {}, resumeAfterTimeout: {} });
    engine.start('both');
    expect(engine.recovered).toBe(false);
    sec(2);
    expect(engine.matchTimeLeft).toBe(298);
  });

  it('restore ignora valores inválidos o fuera de rango', () => {
    const { engine } = make();
    engine.restore({ matchTimeLeft: 99999, setTimeLeft: -5, timeoutTimeLeft: 'x', matchHalf: 7, timeoutTeam: 'Z' });
    expect(engine.matchTimeLeft).toBe(20 * 60);
    expect(engine.setTimeLeft).toBe(0);
    expect(engine.timeoutTimeLeft).toBe(60);
    expect(engine.matchHalf).toBe(1);
    expect(engine.timeoutTeam).toBeNull();
  });
});
