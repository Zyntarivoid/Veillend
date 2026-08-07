const http = require('http');
const { spawn } = require('child_process');

function request(method, path, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (error) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function waitForServer(retries = 10) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await request('GET', '/health');
      if (response.statusCode === 200) {
        return response;
      }
    } catch (error) {
      // Retry until the server is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Server did not become ready in time.');
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), stdio: 'ignore' });

  try {
    await waitForServer();

    const valid = await request('POST', '/users', { name: 'Ada', email: 'ada@example.com' });
    const invalid = await request('POST', '/users', { name: '', email: 'not-an-email' });
    const health = await request('GET', '/health');

    console.log(JSON.stringify({ valid, invalid, health }, null, 2));

    const invalidEnvelope = invalid.body && invalid.body.success === false && invalid.body.error && Array.isArray(invalid.body.error.details);
    if (valid.statusCode !== 200 || !valid.body.success || invalid.statusCode !== 400 || !invalidEnvelope || health.statusCode !== 200 || !health.body.success) {
      process.exitCode = 1;
    }
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
