FROM node:24.14-alpine

WORKDIR /app

COPY package.json  .

RUN npm i

COPY . .

CMD ["npm", "run", "dev"]
