import { createServer } from 'node:http';
import { serveExampleAsset } from './example-assets.js';

let port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535.');
}
const server = createServer((request, response) => {
  if (new URL(request.url, 'http://localhost').pathname === '/') request.url = '/examples/index.html';
  return serveExampleAsset(request, response);
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
