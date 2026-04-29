ARG NODE_IMAGE=docker.m.daocloud.io/library/node:20-alpine
ARG NGINX_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}

FROM base AS development
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 80
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]

FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_SERVER_URL
ARG VITE_SERVER_HTTP_URL
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV VITE_SERVER_HTTP_URL=${VITE_SERVER_HTTP_URL}
RUN npm run build

FROM ${NGINX_IMAGE} AS production
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
