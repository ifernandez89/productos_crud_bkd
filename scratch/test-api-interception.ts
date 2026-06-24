import { createServer, IncomingMessage, ServerResponse } from 'http';
import { BrowserToolService } from '../src/jarvis/tools/browser/browser-tool.service';

async function startServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/api/test') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'api intercepted' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
      <html>
        <body>
          <h1>API interception test</h1>
          <script>
            fetch('/api/test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hello: 'world' })
            }).then(r => r.json()).then(() => {
              document.body.dataset.status = 'done';
            });
          </script>
        </body>
      </html>`);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return server;
}

async function main() {
  const server = await startServer();
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const service = new BrowserToolService();
  const result = await service.fetch(baseUrl);

  console.log('RESULT_TITLE:', result && !('error' in result) ? result.title : 'ERROR');
  if (result && !('error' in result) && result.apis) {
    console.log('APIS_COUNT:', result.apis.length);
    console.log(JSON.stringify(result.apis, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  await service.close();
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
