FROM node:20-alpine

WORKDIR /app

# O projeto utiliza exclusivamente módulos nativos do Node.js (http, fs, path)
COPY server.js ./
COPY index.html ./
COPY icon.png ./
COPY manifest.json ./
COPY config.xml ./
COPY css/ ./css/
COPY js/ ./js/

RUN mkdir -p images

ENV PORT=8080
ENV DVR_HOST=192.168.100.2
ENV DVR_PORT=80

EXPOSE 8080

CMD ["node", "server.js"]
