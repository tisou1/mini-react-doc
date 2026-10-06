import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !['cache', 'dist', 'node_modules'].includes(entry.name)) {
      files.push(...await javascriptFiles(path));
    }
    else if (entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

const files = (await Promise.all(
  ['src', 'scripts', 'examples', 'docs/.vitepress'].map(directory => javascriptFiles(join(projectRoot, directory))),
)).flat().sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    console.error(`Syntax check failed: ${relative(projectRoot, file)}`);
    console.error(result.error ?? result.stderr);
    process.exit(1);
  }
}

const entries = ['mini-react', 'mini-react/jsx-runtime', 'mini-react/jsx-dev-runtime',
  'mini-react/react-dom', 'mini-react/react-dom/client'];
for (const name of entries) await import(name);
console.log(`通过：${files.length} 个 JavaScript 文件语法、${entries.length} 个公共入口导入。`);
console.log('此命令不执行测试、构建或浏览器检查。');
