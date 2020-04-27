FROM node:13.10-alpine3.11
COPY ./package.json /app/
RUN \
    cd /app && \
    npm install
WORKDIR /app/src/example
ENTRYPOINT ["node"]
# CMD ["--inspect-brk=0.0.0.0:9222","standalone.js"]
CMD ["standalone.js"]
COPY ./src /app/src
# COPY ./src /app/app.js