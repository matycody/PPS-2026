// Lee un enlace de Google Maps y saca nombre, dirección y coordenadas (sin API key: todo sale de la URL)
const ALLOWED = [/^([a-z0-9-]+\.)?google\.[a-z.]+$/i, /^maps\.app\.goo\.gl$/i, /^goo\.gl$/i];

const okHost = (h) => ALLOWED.some((r) => r.test(h));
const num = (s) => Number(s);
const validCoords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function parseUrl(raw) {
  const out = { name: null, address: null, latitude: null, longitude: null };
  let u;
  try { u = new URL(raw); } catch { return out; }
  const full = decodeURIComponent(u.pathname + u.search + u.hash.replace(/%/g, '%25')).replace(/\+/g, ' ');

  // el pin exacto (!3d..!4d..) pesa más que el centro del mapa (@lat,lng)
  let m = full.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (!m) m = full.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) m = full.match(/[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (m && validCoords(num(m[1]), num(m[2]))) { out.latitude = num(m[1]); out.longitude = num(m[2]); }

  const p = u.pathname.match(/\/maps\/place\/([^/@]+)/);
  const q = u.searchParams.get('q') || u.searchParams.get('query');
  let text = null;
  try { text = p ? decodeURIComponent(p[1]).replace(/\+/g, ' ') : (q && !/^-?\d/.test(q) ? q : null); } catch { text = null; }
  if (text) {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    out.name = parts[0] ? parts[0].slice(0, 80) : null;
    out.address = (parts.length > 1 ? parts.slice(1).join(', ') : parts[0] || '').slice(0, 160) || null;
  }
  return out;
}

// Sigue las redirecciones de los enlaces cortos (maps.app.goo.gl) y devuelve la URL final
async function expand(raw, hops = 5) {
  let url = raw;
  for (let i = 0; i < hops; i++) {
    const u = new URL(url);
    if (!okHost(u.hostname)) throw new Error('El enlace debe ser de Google Maps');
    if (u.hostname.startsWith('consent.')) {
      const next = u.searchParams.get('continue');
      if (!next) break;
      url = next;
      continue;
    }
    if (/^(maps\.app\.)?goo\.gl$/i.test(u.hostname)) {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0' } });
      const loc = r.headers.get('location');
      if (!loc) break;
      url = new URL(loc, url).toString();
      continue;
    }
    break;
  }
  return url;
}

async function resolveMapsLink(raw) {
  const finalUrl = await expand(String(raw).trim());
  const data = parseUrl(finalUrl);
  return { ...data, mapUrl: String(raw).trim().slice(0, 300), found: data.latitude != null || !!data.name };
}

module.exports = { resolveMapsLink, parseUrl };
