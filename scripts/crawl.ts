/**
 * 抓取入口：node --import tsx scripts/crawl.ts
 * 拉取全部信源 → 去重 → AI 评分/7 维分析 → 入库 → 聚类 → 生成日报。
 * 建议 cron 每 2-4 小时执行一次。
 */
import { runCrawl } from '../src/lib/news/crawl';
import { isDbConfigured } from '../src/storage/database/repo';

async function main(): Promise<void> {
  if (!isDbConfigured()) {
    console.error('[crawl] 数据库未配置：缺少 COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY');
    process.exit(1);
  }
  const started = Date.now();
  console.log(`[crawl] 开始抓取 @ ${new Date().toISOString()}`);
  const summary = await runCrawl();
  console.log('─'.repeat(56));
  for (const s of summary.sources) {
    const mark = s.status === 'success' ? '✓' : '✗';
    console.log(
      ` ${mark} ${s.slug.padEnd(6)} [${s.channel.padEnd(8)}] 抓取 ${String(s.fetched).padStart(3)}  新增 ${String(s.new).padStart(3)}  精选 ${String(s.passed).padStart(3)}` +
        (s.error ? `  错误: ${s.error}` : ''),
    );
  }
  console.log('─'.repeat(56));
  console.log(
    `[crawl] 完成：共抓取 ${summary.totalFetched}，新增 ${summary.totalNew}，通过筛选 ${summary.totalPassed}，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[crawl] 致命错误:', err);
  process.exit(1);
});
