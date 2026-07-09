FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias necesarias para node-gyp y prisma
RUN apk add --no-cache python3 make g++ openssl

# Copiar configuraciones de entorno de Node
COPY package.json package-lock.json turbo.json ./

# Copiar el código fuente completo del monorepo
COPY apps ./apps
COPY packages ./packages

# Instalar dependencias usando npm workspaces
RUN npm install

# Generar cliente de Prisma
RUN cd packages/db && npx prisma generate

# Compilar el backend usando Turbo
RUN npx turbo run build --filter=@ppp/api

# ----------------- ETAPA DE PRODUCCIÓN -----------------
FROM node:20-alpine AS runner

WORKDIR /app

# Instalar OpenSSL para que Prisma funcione en producción en Alpine
RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Copiar todos los archivos ya construidos desde la etapa anterior
# En un monorepo, es más seguro mantener la estructura para que los workspaces funcionen
COPY --from=builder /app ./

EXPOSE 4000

# Comando para iniciar la aplicación (ejecutado desde la raíz del monorepo)
CMD ["node", "apps/api/dist/main.js"]
