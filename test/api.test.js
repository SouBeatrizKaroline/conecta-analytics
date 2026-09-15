import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Api } from '../src/api.js';

test('cliente usa Bearer no cabeçalho e preserva erros da API', async (t) => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer local-test') {
      res.writeHead(401);
      res.end(JSON.stringify({ error: { message: 'Token inválido.' } }));
      return;
    }
    res.end(JSON.stringify({ path: req.url, authorization: true }));
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(new Api(url).json('/api/v1/admin/summary'), /Token inválido/);
  const api = new Api(url, 'local-test');
  assert.deepEqual(await api.json('/api/v1/admin/summary?segment=energia'), {
    path: '/api/v1/admin/summary?segment=energia',
    authorization: true,
  });
});
