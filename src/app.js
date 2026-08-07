const http = require('http');
const { buildErrorEnvelope, buildSuccessEnvelope, validatePayload } = require('./validation');

function createApp() {
  return async function handleRequest(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const method = req.method.toUpperCase();
    const pathname = url.pathname;

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    let body = {};

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, 400, buildErrorEnvelope('Request body must be valid JSON.', [{ field: 'body', message: 'Invalid JSON payload.' }], 'INVALID_JSON'));
        return;
      }

      const issues = validatePayload(pathname, method, body);
      if (issues.length > 0) {
        sendJson(res, 400, buildErrorEnvelope('Request payload is invalid.', issues, 'VALIDATION_ERROR'));
        return;
      }
    }

    const routeData = {
      method,
      path: pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      received: body,
    };

    if (pathname === '/health' || pathname === '/api/health') {
      sendJson(res, 200, buildSuccessEnvelope({ status: 'ok' }, { route: pathname, method }));
      return;
    }

    if (pathname === '/users' || pathname === '/api/users') {
      sendJson(res, 200, buildSuccessEnvelope({ users: [] }, { route: pathname, method }));
      return;
    }

    sendJson(res, 200, buildSuccessEnvelope(routeData, { route: pathname, method }));
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
    });

    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

module.exports = {
  createApp,
  createServer: (port = process.env.PORT || 3000) => {
    const app = createApp();
    return http.createServer((req, res) => app(req, res)).listen(port);
  },
};
