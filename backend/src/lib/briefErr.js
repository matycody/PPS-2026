// Resume un error (p. ej. de Prisma, que es multilínea y a veces se ve vacío en los logs) en una línea: código + últimas líneas.
function briefErr(e) {
  const msg = String((e && e.message) || e).replace(/\x1b\[[0-9;]*m/g, '');
  const lines = msg.split('\n').map((s) => s.trim()).filter(Boolean);
  return ((e && e.code) ? e.code + ' ' : '') + lines.slice(-2).join(' | ');
}
module.exports = { briefErr };
