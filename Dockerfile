# ---- build the dashboard + SDK ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY dashboard/package.json dashboard/
COPY sdk/package.json sdk/
RUN npm ci --workspace server --workspace dashboard --workspace sdk --include-workspace-root=false
COPY dashboard dashboard
COPY sdk sdk
RUN npm run build -w dashboard && npm run build -w sdk

# ---- runtime ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY dashboard/package.json dashboard/
COPY sdk/package.json sdk/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force
COPY server server
# game builds (made with Cocos Creator, see scripts/build-games.mjs) + dashboard + sdk
COPY --from=build /app/server/public/app server/public/app
COPY --from=build /app/server/public/sdk server/public/sdk
RUN mkdir -p /data && chown -R node:node /data /app/server/public
VOLUME /data
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/src/index.ts"]
