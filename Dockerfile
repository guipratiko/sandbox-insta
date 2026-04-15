# Build direto em Node (sem Nixpacks): evita etapa longa do nix-env e o mount de cache do npm
# no Docker, que em alguns hosts (EasyPanel) parece “travar” sem logs novos durante npm ci.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY .npmrc ./

RUN npm ci --omit=dev --no-audit --fund=false

COPY . .

RUN npm run build

ENV NODE_ENV=production

# A porta real vem do PORT no ambiente (EasyPanel / Railway); 4335 é o default do app.
EXPOSE 4335

CMD ["node", "dist/server.js"]
