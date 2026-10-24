const { spawn } = require('node:child_process');

async function start() {
  // Vite uses ES modules; dynamic import lets a CommonJS script load it.
  const { createServer } = await import('vite');
  const server = await createServer();
  await server.listen();
  const env = { ...process.env, REQDELTA_DEV_URL: 'http://127.0.0.1:5173/' };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = spawn(require('electron'), ['.'], { stdio: 'inherit', env });
  let closing = false;
  async function close(code = 0) {
    if (closing) return;
    closing = true;
    if (desktop.exitCode === null) desktop.kill();
    await server.close();
    process.exit(code);
  }
  desktop.on('error', (error) => { console.error(error.message); close(1); });
  desktop.on('exit', (code) => close(code ?? 0));
  process.on('SIGINT', () => close());
  process.on('SIGTERM', () => close());
  console.log('ReqDelta is opening. React edits update live; restart for Electron file changes.');
}

start().catch((error) => { console.error(error.message); process.exit(1); });
