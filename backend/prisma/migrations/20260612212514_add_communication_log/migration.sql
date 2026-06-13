-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runnerId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "direccion" TEXT NOT NULL DEFAULT 'entrante',
    "mensaje" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationLog_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "Runner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Runner" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "telefono" TEXT,
    "ciudad" TEXT NOT NULL DEFAULT 'México',
    "estado" TEXT NOT NULL DEFAULT 'México',
    "fechaNacimiento" DATETIME,
    "nivel" TEXT NOT NULL DEFAULT 'principiante',
    "fotoPerfil" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Runner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Runner" ("activo", "apellido", "ciudad", "createdAt", "estado", "fechaNacimiento", "fotoPerfil", "id", "nivel", "nombre", "notas", "telefono", "updatedAt", "userId") SELECT "activo", "apellido", "ciudad", "createdAt", "estado", "fechaNacimiento", "fotoPerfil", "id", "nivel", "nombre", "notas", "telefono", "updatedAt", "userId" FROM "Runner";
DROP TABLE "Runner";
ALTER TABLE "new_Runner" RENAME TO "Runner";
CREATE UNIQUE INDEX "Runner_userId_key" ON "Runner"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
