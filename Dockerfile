FROM node:20-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
COPY content ./content
RUN chown -R node:node /app/content/dealer /app/content/dms /app/content/domo
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
