-- Torneos eliminados (papelera): se pueden restaurar o borrar definitivamente
ALTER TABLE "Tournament" ADD COLUMN "deletedAt" TIMESTAMP(3);
