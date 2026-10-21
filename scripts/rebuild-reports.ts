/**
 * 重建行业日报：对所有存在精选条目的发布日期（UTC）各生成一期。
 * 仅基于真实入库的精选条目，不写入任何演示/占位数据。
 *
 * 用法：node --import tsx scripts/rebuild-reports.ts
 */
import { createClient } from '@supabase/supabase-js';

const url =
  process.env.COZE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const serviceKey =
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  '';
if (!url || !serviceKey) {
  console.error('缺少 SUPABASE 环境变量');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main(): Promise<void> {
  const { data, error } = await db.from('items').select('published_at').eq('passed_filter', true);
  if (error) throw new Error(`读取精选条目失败: ${error.message}`);
  const dates = [...new Set(
    (data ?? [])
      .map((r: { published_at: string | null }) => r.published_at)
      .filter((p): p is string => Boolean(p))
      .map((p) => new Date(p).toISOString().slice(0, 10)),
  )].sort();
  console.log(`精选发布日期（UTC）: ${dates.join(', ') || '无'}`);

  const { generateReportForDate } = await import('../src/lib/news/reports');
  let built = 0;
  for (const d of dates) {
    const ok = await generateReportForDate(d);
    if (ok) built += 1;
    console.log(`${ok ? '✓' : '·'} ${d}${ok ? ' 已生成' : ' 无内容'}`);
  }
  console.log(`完成：生成 ${built}/${dates.length} 期日报`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
