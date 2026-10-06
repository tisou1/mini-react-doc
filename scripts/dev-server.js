import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
let port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535.');
}
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/examples/index.html' : url.pathname);
    const filePath = resolve(projectRoot, `.${pathname}`);
    const localPath = relative(projectRoot, filePath);
    // 仅提供源码和示例；不能通过 URL 读取 .git、.env 或目录之外的文件。
    if (isAbsolute(localPath) || localPath.startsWith('..') ||
        !/^(src|examples)[\\/]/.test(localPath) ||
        localPath.split(/[\\/]/).some(part => part.startsWith('.'))) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error instanceof URIError ? 400 : ['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code) ? 404 : 500;
    response.writeHead(status).end(status === 404 ? 'Not found' : 'Unable to serve this request');
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port > 0 && port < 65535) {
    console.log(`Port ${port} is in use. Trying ${port + 1}...`);
    server.listen(++port, '127.0.0.1');
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
server.on('listening', () => {
  console.log(`mini-react: http://localhost:${server.address().port}`);
  console.log('修改文件后刷新页面；Ctrl+C 停止服务。');
});
server.listen(port, '127.0.0.1');
