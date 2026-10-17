// Plantel de DEMOSTRACIÓN: jugadores sin login (sin usuario) para completar los equipos.
//   Crear:   node scripts/demo-plantel.js
//   Borrar:  node scripts/demo-plantel.js --borrar
// Todos los jugadores demo tienen mail "...@demo.pps" y DNI "DEMO...", así se borran sin tocar nada real.
// Reglas por equipo: 7 masculinos (si tiene rama masculina), 7 femeninas (si tiene rama femenina) y,
// si tiene mixto, 4 masculinos + 3 femeninas al azar de su plantel (si no tiene la rama, se le arma lo mínimo para el mixto).
require('dotenv').config();
const prisma = require('../src/db');

const DOMAIN = '@demo.pps';
const MALE_NAMES = ['Lucas', 'Mateo', 'Santiago', 'Facundo', 'Nicolás', 'Tomás', 'Joaquín', 'Franco', 'Agustín', 'Bruno', 'Ezequiel', 'Gonzalo', 'Ignacio', 'Maximiliano', 'Federico', 'Julián', 'Thiago', 'Leandro', 'Damián', 'Emiliano', 'Axel', 'Brian', 'Kevin', 'Lautaro', 'Matías', 'Rodrigo', 'Sebastián', 'Gastón'];
const FEMALE_NAMES = ['Sofía', 'Camila', 'Valentina', 'Martina', 'Lucía', 'Julieta', 'Agustina', 'Milagros', 'Florencia', 'Micaela', 'Belén', 'Carolina', 'Daniela', 'Rocío', 'Candela', 'Antonella', 'Brenda', 'Victoria', 'Paula', 'Mariana', 'Abril', 'Catalina', 'Jazmín', 'Luciana', 'Natalia', 'Romina', 'Pilar', 'Ailén'];
const SURNAMES = ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Sánchez', 'García', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Suárez', 'Aguirre', 'Giménez', 'Gutiérrez', 'Peralta', 'Rojas', 'Ortiz', 'Silva', 'Molina', 'Castro', 'Ríos', 'Vega', 'Cabrera', 'Luna', 'Ferreyra'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

async function borrar() {
  const profiles = await prisma.profile.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = profiles.map((p) => p.id);
  const rel = await prisma.playerTeam.deleteMany({ where: { profileId: { in: ids } } });
  const del = await prisma.profile.deleteMany({ where: { id: { in: ids } } });
  console.log(`Borrados ${del.count} jugadores demo (${rel.count} vínculos a equipos).`);
}

async function crear() {
  const teams = await prisma.team.findMany({ include: { branches: true }, orderBy: { name: 'asc' } });
  let seq = (await prisma.profile.count({ where: { email: { endsWith: DOMAIN } } })) + 1;
  const usedNames = new Set();
  let total = 0;

  const newPerson = async (team, sex) => {
    let name;
    do { name = `${pick(sex === 'M' ? MALE_NAMES : FEMALE_NAMES)} ${pick(SURNAMES)}`; } while (usedNames.has(name) && usedNames.size < 900);
    usedNames.add(name);
    const n = seq++;
    return prisma.profile.create({
      data: {
        dni: 'DEMO' + String(n).padStart(6, '0'),
        email: `demo${n}${DOMAIN}`,
        name, sex, isPlayer: true, active: true,
      },
    });
  };

  for (const team of teams) {
    const br = team.branches.map((b) => b.branch);
    const hasM = br.includes('MALE'), hasF = br.includes('FEMALE'), hasX = br.includes('MIXED');
    const current = await prisma.playerTeam.findMany({ where: { teamId: team.id, to: null } });
    const have = (b) => current.filter((c) => c.branch === b).length;

    const nM = hasM ? Math.max(0, 7 - have('MALE')) : 0;
    const nF = hasF ? Math.max(0, 7 - have('FEMALE')) : 0;
    const males = [], females = [];
    for (let i = 0; i < nM; i++) males.push(await newPerson(team, 'M'));
    for (let i = 0; i < nF; i++) females.push(await newPerson(team, 'F'));

    // Mixto: 4 masculinos + 3 femeninas al azar del plantel; si no tiene rama masculina/femenina se crean los que faltan
    let mixM = 0, mixF = 0;
    if (hasX && have('MIXED') === 0) {
      const needM = 4, needF = 3;
      const poolM = hasM ? shuffle(males) : [];
      const poolF = hasF ? shuffle(females) : [];
      // Si faltan para completar el mixto (no tiene la rama o el plantel ya estaba cargado), se crean solo para el mixto
      let extra = 0;
      while (poolM.length < needM) { poolM.push(await newPerson(team, 'M')); extra++; }
      while (poolF.length < needF) { poolF.push(await newPerson(team, 'F')); extra++; }
      const mixed = [...poolM.slice(0, needM).map((p) => [p, 'M']), ...poolF.slice(0, needF).map((p) => [p, 'F'])];
      for (const [p] of mixed) await prisma.playerTeam.create({ data: { profileId: p.id, teamId: team.id, branch: 'MIXED' } });
      mixM = poolM.slice(0, needM).length; mixF = poolF.slice(0, needF).length;
      total += extra;
    }

    // Números de camiseta sin repetir dentro del equipo
    const nums = shuffle(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const p of [...males, ...females]) {
      const branch = p.sex === 'M' ? 'MALE' : 'FEMALE';
      await prisma.playerTeam.create({ data: { profileId: p.id, teamId: team.id, branch } });
      await prisma.profile.update({ where: { id: p.id }, data: { number: nums.pop() } });
    }
    total += males.length + females.length;
    console.log(`${team.name}: +${males.length} masc, +${females.length} fem${hasX ? `, mixto ${mixM}M/${mixF}F` : ''}`);
  }
  console.log(`Listo: ${total} jugadores demo creados. Para borrarlos: node scripts/demo-plantel.js --borrar`);
}

(async () => {
  const url = process.env.DATABASE_URL || '';
  if (url.includes('ep-withered-grass')) throw new Error('Esto apunta a PRODUCCIÓN. Abortado.');
  if (process.argv.includes('--borrar')) await borrar(); else await crear();
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
