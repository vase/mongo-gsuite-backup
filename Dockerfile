FROM node:16 as builder

RUN mkdir /app
RUN chown -R node:node /app
COPY --chown=node:node . /app
WORKDIR /app

USER node

RUN npm ci && npm cache clean --force --loglevel=error
RUN npm run get-binaries

# FROM node:16-slim as app

# ARG NODE_ENV=production
# WORKDIR /app
# USER node

# COPY --from=builder /app /app

CMD ["npm", "start"]