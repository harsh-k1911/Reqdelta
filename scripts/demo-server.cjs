const http = require('node:http');

function createDemoServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Echo the method without changing data, so every supported method is easy to try.
    if (url.pathname === '/echo') {
      response.end(JSON.stringify({ method: request.method, path: url.pathname }));
      return;
    }
    if (request.method !== 'GET') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET');
      response.end(JSON.stringify({ error: 'Method not allowed', message: 'Use GET for this endpoint, or /echo to try another method.' }));
      return;
    }
    if (url.pathname === '/students/101') {
      const student = url.searchParams.get('version') === '2'
        ? { id: 101, fullName: 'Rahul', age: '20', active: true, branch: 'CSE' }
        : { id: 101, name: 'Rahul', age: 20, active: true, branch: 'CSE' };
      response.end(JSON.stringify(student));
    } else if (url.pathname === '/text') {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('Hello from the ReqDelta demo API. Text responses work too.');
    } else if (url.pathname === '/slow') {
      const timer = setTimeout(() => response.end(JSON.stringify({ message: 'A slow response' })), 20_000);
      response.on('close', () => clearTimeout(timer));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Not found', message: 'This is an HTTP response, not a connection failure.' }));
    }
  });
}

if (require.main === module) {
  const server = createDemoServer();
  server.on('error', (error) => { console.error(`Demo API: ${error.message}`); process.exit(1); });
  server.listen(3030, '127.0.0.1', () => {
    console.log('Demo API: http://127.0.0.1:3030/students/101');
    console.log('Also try /students/101?version=2, /text, /status/404, /slow, and /echo.');
  });
}

module.exports = { createDemoServer };
