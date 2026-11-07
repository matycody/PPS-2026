require('dotenv').config(); 
const { PrismaClient } = require('@prisma/client'); 
const { PrismaPg } = require('@prisma/adapter-pg'); 
 
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  // Con muchas consultas en paralelo (tablas de varios torneos) el pool por defecto se agota y las que esperan fallan por tiempo
  max: Number(process.env.DB_POOL_MAX) || 15,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 20000,
  idleTimeoutMillis: 30000,
}); 
// Por defecto Prisma corta cualquier transacción a los 5 s (P2028). Las operaciones grandes (jornadas, fixtures, reinicios)
// hacen decenas de escrituras seguidas, así que el límite general sube a 60 s. Una transacción puede pedir otro valor por su cuenta.
const prisma = new PrismaClient({ adapter, transactionOptions: { timeout: 60000, maxWait: 10000 } }); 
 
module.exports = prisma; 
