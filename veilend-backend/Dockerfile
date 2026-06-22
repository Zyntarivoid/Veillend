FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --package-lock=false

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --package-lock=false && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
