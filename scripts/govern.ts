/**
 * 手动触发数据治理（幂等）：清理种子假数据、全量重算、重建日报、补全中文标题。
 * 用法：node --import tsx scripts/govern.ts
 */
import { runGovernanceIfNeeded } from '../src/lib/news/governance';

runGovernanceIfNeeded()
  .then(() => {
    console.log('治理执行完毕');
    process.exit(0);
  })
  .catch((e) => {
    console.error('治理失败:', e);
    process.exit(1);
  });
