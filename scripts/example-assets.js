import { readFile, cp } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// standalone server 和 VitePress 共用原生 ESM 示例资源，不复制第二份实现。
export async function serveExampleAsset(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const filePath = resolve(projectRoot, `.${pathname}`);
    const localPath = relative(projectRoot, filePath);
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
}

// 使用 Vite 官方 configureServer hook，让 iframe 原样运行浏览器示例。
export function exampleAssetsPlugin() {
  return {
    name: 'mini-react-example-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname.startsWith('/examples/') || pathname.startsWith('/src/')) {
          return serveExampleAsset(request, response);
        }
        next();
      });
    },
  };
}

// VitePress buildEnd 将相同资源带进输出目录，使静态预览也可运行示例。
export async function copyExampleAssets(outDir) {
  for (const directory of ['src', 'examples']) {
    await cp(resolve(projectRoot, directory), resolve(outDir, directory), { recursive: true });
  }
}
