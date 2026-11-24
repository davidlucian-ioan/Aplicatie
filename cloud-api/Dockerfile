FROM node:22-alpine
WORKDIR /app
COPY collector-v11/ai ./collector-v11/ai
COPY cloud-api ./cloud-api
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node","cloud-api/server.js"]
