import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import http from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const tempRoot = await mkdtemp(path.join(tmpdir(), 'report-skill-auth-smoke-'));
const templateDir = path.join(tempRoot, 'report-templates', 'demo-report');

await mkdir(templateDir, { recursive: true });
await writeFile(path.join(templateDir, 'index.html'), '<!DOCTYPE html><html><head><title>{{ title }}</title><link rel="stylesheet" href="styles.css" /></head><body><h1>{{ title }}</h1><p>{{ summary }}</p><script src="report.js"></script></body></html>');
await writeFile(path.join(templateDir, 'styles.css'), 'body { font-family: sans-serif; }');
await writeFile(path.join(templateDir, 'report.js'), 'const reportData = __REPORT_DATA__;\nconsole.log(reportData.title);');

const calls = {
  authHeaders: [],
  apiAuthHeaders: [],
  preparedFiles: [],
  reportBodies: []
};

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const bodyText = Buffer.concat(chunks).toString('utf8');

    if (req.method === 'POST' && req.url === '/api/agent/auth') {
      calls.authHeaders.push(req.headers.authorization || '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        agent: { id: 'agent-licai', name: '理财助手' },
        rabbitmq: {
          token: 'jwt-from-app-credentials',
          tokenExpiry: new Date(Date.now() + 3600_000).toISOString()
        }
      }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/agent/storage/upload/prepare') {
      calls.apiAuthHeaders.push(req.headers.authorization || '');
      calls.preparedFiles.push(JSON.parse(bodyText));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        sessionId: 'upload-session-1',
        presignedUrl: `http://127.0.0.1:${server.address().port}/upload/index.html`
      }));
      return;
    }

    if (req.method === 'PUT' && req.url === '/upload/index.html') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (req.method === 'POST' && req.url === '/api/agent/storage/upload/complete') {
      calls.apiAuthHeaders.push(req.headers.authorization || '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        fileId: 'file-123',
        downloadUrl: 'http://127.0.0.1:3000/api/reports/view/file-123'
      }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/agent/reports') {
      calls.apiAuthHeaders.push(req.headers.authorization || '');
      calls.reportBodies.push(JSON.parse(bodyText));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        inserted: 1,
        reportId: 'report-123',
        url: 'http://127.0.0.1:3000/reports/report-123'
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

try {
  const { stdout } = await execFile(
    'node',
    [
      '/Users/zcg/.agents/skills/report/scripts/index.js',
      'publish',
      JSON.stringify({
        templatePath: templateDir,
        title: '测试报告',
        summary: '自动换 token',
        reportData: {
          title: '测试报告',
          summary: '自动换 token'
        }
      })
    ],
    {
      cwd: tempRoot,
      env: {
        ...process.env,
        REPORT_STORAGE_PROVIDER: 'platform',
        PLATFORM_BASE_URL: `http://127.0.0.1:${port}`,
        AGENT_APP_ID: 'app-from-test',
        AGENT_APP_SECRET: 'secret-from-test'
      }
    }
  );

  const result = JSON.parse(stdout);
  assert.equal(result.success, true);
  assert.equal(result.reportId, 'report-123');
  assert.equal(result.url, 'http://127.0.0.1:3000/reports/report-123');
  assert.deepEqual(calls.authHeaders, [`Basic ${Buffer.from('app-from-test:secret-from-test').toString('base64')}`]);
  assert.ok(calls.apiAuthHeaders.length >= 3);
  assert.ok(calls.apiAuthHeaders.every((value) => value === 'Bearer jwt-from-app-credentials'));
  assert.equal(calls.reportBodies[0].reportUrl, 'http://127.0.0.1:3000/api/reports/view/file-123');

  console.log('report-skill-auth smoke ok');
} finally {
  server.close();
  await rm(tempRoot, { recursive: true, force: true });
}
