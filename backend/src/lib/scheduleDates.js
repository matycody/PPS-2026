// Cómo se reparten las fechas (o rondas) de un torneo en el calendario.
//  - 'interval' (por defecto): cada `intervalDays` días desde la primera fecha
//  - 'sameDay': todas el mismo día (la primera fecha)
//  - 'weekend': fin de semana — la primera mitad el primer día (sábado) y la segunda mitad al día siguiente (domingo)
const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULES = ['interval', 'sameDay', 'weekend'];

function parseSchedule(value) {
  if (value === undefined || value === null || value === '') return 'interval';
  return SCHEDULES.includes(value) ? value : undefined;
}

// i: índice de la fecha (desde 0) · total: cantidad de fechas
function scheduleDate({ schedule, startDate, intervalDays, i, total }) {
  if (!startDate) return null;
  if (schedule === 'sameDay') return new Date(startDate.getTime());
  if (schedule === 'weekend') {
    const secondDay = i >= Math.ceil(total / 2);
    return new Date(startDate.getTime() + (secondDay ? DAY_MS : 0));
  }
  return new Date(startDate.getTime() + i * intervalDays * DAY_MS);
}

module.exports = { SCHEDULES, parseSchedule, scheduleDate };
