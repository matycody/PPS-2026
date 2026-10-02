// Rol visual (color de acento) a partir de lo que devuelve GET /me
export function accentRole(user, menu = []) {
  const roles = user?.roles ?? []
  if (roles.includes('ADMIN')) return 'admin'
  if (roles.includes('REFEREE')) return 'referee'
  if (menu.includes('control_mesa')) return 'table'
  if (roles.includes('PLAYER')) return 'player'
  return 'visitor'
}
