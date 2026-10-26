FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY worlds ./worlds
COPY scripts ./scripts
COPY tsconfig.base.json ./

# Build workspace packages before packaging the bundled seed worlds.
RUN npm ci --include=dev
RUN npm run build
RUN npm run seed

EXPOSE 8787
VOLUME ["/app/apps/server/data"]

CMD ["npm", "start"]
