// Planilla de juego SIMULADA para probar la lectura de la herramienta (nombres, DNI y firmas hechas "a mano").
//   Ejemplo con los datos de muestra:   node scripts/planilla-demo.js
//   Con datos reales de la base:        node scripts/planilla-demo.js --db Hydra Noazar FEMALE
//   Opciones: --out archivo.png   --sin-firma 1 (cuántos de cada equipo quedan sin firmar, por defecto 1)
// La foto sale en scripts/out/. No se sube a git.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SAMPLE = {
  teamA: { name: 'Hydra', players: [[4, 'Natalia Romero'], [5, 'Victoria Gutiérrez'], [9, 'Carolina Cabrera'], [16, 'Julieta Sánchez'], [18, 'Lucía García'], [21, 'Luciana Vega'], [23, 'Catalina Vega']] },
  teamB: { name: 'Noazar', players: [[1, 'Mariana Flores'], [3, 'Camila Sosa'], [7, 'Abril Herrera'], [12, 'Carolina Fernández'], [18, 'Daniela Ramírez'], [22, 'Carolina Gutiérrez'], [24, 'Romina Molina']] },
  category: 'Cloth Femenino',
};

const W = 1700, H = 1060, ROWS = 20, ROW_H = 30, TOP = 250, COLW = [44, 250, 120, 140, 50, 50, 56, 52];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// Firma: trazo continuo con vueltas, inclinado, de tinta azul
function signature(x, y, w, h) {
  const n = 7 + Math.floor(rnd() * 4);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push([x + 6 + t * (w - 18), y + h / 2 + Math.sin(t * 9 + rnd()) * (h * 0.32) - t * 4 + (rnd() - 0.5) * 5]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    d += ` C${(px + (cx - px) * 0.3).toFixed(1)} ${(py - 9 - rnd() * 6).toFixed(1)} ${(px + (cx - px) * 0.7).toFixed(1)} ${(cy + 9 + rnd() * 6).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
  }
  const end = pts[pts.length - 1];
  d += ` l${(-w * 0.6).toFixed(1)} ${(3 + rnd() * 4).toFixed(1)}`; // rasgo final
  return `<path d="${d}" fill="none" stroke="#17308f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${(-4 + rnd() * 8).toFixed(1)} ${end[0].toFixed(1)} ${end[1].toFixed(1)})"/>`;
}

function table(x0, team, unsigned) {
  const xs = COLW.reduce((a, w) => (a.push(a[a.length - 1] + w), a), [x0]);
  const heads = ['Nº', 'NOMBRE Y APELLIDO', 'DNI', 'FIRMA', 'Aperc.', 'Aperc.', 'Amones.', 'Descal.'];
  let s = `<rect x="${x0}" y="${TOP - 26}" width="${xs[8] - x0}" height="26" fill="#fff" stroke="#000"/>`;
  heads.forEach((h, i) => { s += `<text x="${(xs[i] + xs[i + 1]) / 2}" y="${TOP - 9}" font-size="11" text-anchor="middle">${h}</text>`; });
  for (let r = 0; r < ROWS; r++) {
    const y = TOP + r * ROW_H;
    s += `<rect x="${x0}" y="${y}" width="${xs[8] - x0}" height="${ROW_H}" fill="none" stroke="#000"/>`;
    xs.slice(1, 8).forEach((x) => { s += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + ROW_H}" stroke="#000"/>`; });
    const p = team.players[r];
    if (!p) continue;
    const [num, name, dni] = p;
    s += `<text x="${xs[0] + 6}" y="${y + 20}" font-size="14">${esc(num)}</text>`;
    s += `<text x="${xs[1] + 6}" y="${y + 20}" font-size="15" font-family="Arial, Helvetica, sans-serif">${esc(name)}</text>`;
    if (dni) s += `<text x="${xs[2] + 8}" y="${y + 20}" font-size="15" font-family="Arial, Helvetica, sans-serif">${esc(dni)}</text>`;
    if (r < team.players.length - unsigned) s += signature(xs[3] + 4, y + 2, COLW[3] - 8, ROW_H - 4);
  }
  return s;
}

function sheetSvg(data, unsigned) {
  const xA = 40, xB = 40 + COLW.reduce((a, b) => a + b, 0) + 40;
  const box = (x, y, w, h, t = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#000"/><text x="${x + 6}" y="${y + h - 8}" font-size="12">${esc(t)}</text>`;
  const bottom = TOP + ROWS * ROW_H + 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">
<rect width="100%" height="100%" fill="#fbfbf8"/>
<text x="${W / 2}" y="70" font-size="34" font-weight="700" text-anchor="middle">PLANILLA DE JUEGO</text>
<text x="40" y="60" font-size="26" font-weight="700" fill="#1a4fa0">DBA</text><text x="40" y="84" font-size="11">DODGEBALL ARGENTINA</text>
${box(40, 110, 330, 28, 'EQUIPO A: ' + data.teamA.name)}${box(380, 110, 330, 28, 'EQUIPO B: ' + data.teamB.name)}
${box(720, 110, 330, 28, 'Categoría: ' + data.category)}${box(1060, 110, 250, 28, 'Fecha: ' + new Date().toLocaleDateString('es-AR'))}${box(1320, 110, 120, 28, 'Hora:')}
${box(40, 140, 330, 28, 'Jugado en:')}${box(380, 140, 120, 28, '1° T  A:')}${box(510, 140, 120, 28, 'B:')}${box(640, 140, 140, 28, 'FINAL  A:')}${box(790, 140, 120, 28, 'B:')}
${table(xA, data.teamA, unsigned)}${table(xB, data.teamB, unsigned)}
${[xA, xB].map((x) => ['D.T.', 'Asistente 1', 'Asistente 2', 'Shaggers'].map((t, i) => box(x, bottom + i * 26, 420, 26, t)).join('')).join('')}
${box(xA, bottom + 120, 420, 34, 'FIRMA RESPONSABLE A:')}${box(xB, bottom + 120, 420, 34, 'FIRMA RESPONSABLE B:')}
<text x="40" y="${bottom + 190}" font-size="12">OBSERVACIONES: ______________________________________________________________________________________________________</text>
<text x="40" y="${bottom + 235}" font-size="12">Planillero: ____________________  Firma: ________   Cronometrista: ____________________  Firma: ________   1er Árbitro: ____________________  Firma: ________</text>
</svg>`;
}

async function fromDb(a, b, branch) {
  require('dotenv').config();
  const prisma = require('../src/db');
  const load = async (name) => {
    const team = await prisma.team.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (!team) throw new Error('No existe el equipo ' + name);
    const rows = await prisma.playerTeam.findMany({ where: { teamId: team.id, branch, to: null }, include: { profile: true } });
    return { name: team.name, players: rows.map((r) => [r.profile.number ?? '', r.profile.name, r.profile.dni]) };
  };
  const data = { teamA: await load(a), teamB: await load(b), category: branch };
  await prisma.$disconnect();
  return data;
}

(async () => {
  const args = process.argv.slice(2);
  const opt = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
  const dbi = args.indexOf('--db');
  const data = dbi >= 0 ? await fromDb(args[dbi + 1], args[dbi + 2], args[dbi + 3] || 'MIXED') : SAMPLE;
  const unsigned = Number(opt('--sin-firma', 1));
  const out = path.resolve(opt('--out', path.join(__dirname, 'out', 'planilla-' + data.teamA.name + '-vs-' + data.teamB.name + '.png')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(sheetSvg(data, unsigned))).png().toFile(out);
  console.log('Planilla simulada:', out);
})().catch((e) => { console.error(e.message); process.exit(1); });
