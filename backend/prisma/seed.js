require('dotenv').config();
const prisma = require('../src/db');

async function main() {
  const emails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.length) throw new Error('Falta ADMIN_EMAILS en .env');

  for (const email of emails) {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (!existing) {
      await prisma.user.create({ data: { email, roles: ['ADMIN'] } });
    } else if (!existing.roles.includes('ADMIN')) {
      await prisma.user.update({
        where: { email },
        data: { roles: { set: [...existing.roles, 'ADMIN'] } },
      });
    }
    console.log('Admin listo:', email);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());