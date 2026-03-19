FROM node:24.14-alpine

WORKDIR /app

COPY package.json .

RUN npm i

COPY index.js .

COPY ./routes ./routes

COPY ./controllers ./controllers

CMD [ "npm","run","dev" ]