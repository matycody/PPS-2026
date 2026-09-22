// Apodo si existe; si no, el nombre real
export const personName = (p, fallback = '') => p?.nickname?.trim() || p?.name || fallback

// Número válido (0 a 999) o null. El 0 cuenta.
export const personNumber = (p) =>
  Number.isInteger(p?.number) && p.number >= 0 && p.number <= 999 ? p.number : null
