/**
 * 冒烟测试入口，验收命令：`node scripts/smoke.ts`
 *
 * 纯 Node 无法解析 TS 的无扩展名/路径别名导入，因此本文件只做引导（不含任何类型注解，
 * 可被 Node 原生 type-stripping 直接执行）：用子进程以 tsx 加载器运行实际检查逻辑
 * scripts/smoke-run.ts，并透传退出码。
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, 'smoke-run.ts');

const result = spawnSync(process.execPath, ['--import', 'tsx', target], {
  stdio: 'inherit',
  cwd: path.join(here, '..'),
});

process.exit(result.status ?? 1);
