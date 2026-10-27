# ==============================================================================
# Bóveda Digital — Dockerfile Optimizado para Google Cloud Run & Contenedores
# ==============================================================================
FROM node:20-alpine

# Definir directorio de trabajo de la aplicación
WORKDIR /app

# Definir variables de entorno de producción
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/app/data

# Crear directorio de persistencia para datos cifrados
RUN mkdir -p /app/data

# Copiar el código fuente de la aplicación (0 dependencias externas necesarias)
COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY manifest.json ./
COPY sw.js ./
COPY .nojekyll ./
COPY assets/ ./assets/
COPY data/ ./data/
COPY docs/ ./docs/

# Exponer el puerto predeterminado de Google Cloud Run
EXPOSE 8080

# Iniciar servidor nativo de Bóveda Digital
CMD ["node", "server.js"]
