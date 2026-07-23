const http = require('http');
const { createApp } = require('./src/app');

const port = Number(process.env.PORT || 3000);
const app = createApp();

const server = http.createServer((req, res) => app(req, res));

server.listen(port, '127.0.0.1', () => {
  console.log(`Backend listening on http://127.0.0.1:${port}`);
});

module.exports = server;
