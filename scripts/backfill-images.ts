/**
 * 回填文章配图：对库内缺图条目，抓取其详情页 HTML 提取 <meta property="og:image">，
 * 更新到 items.image_url。行业媒体 RSS 多为纯文字摘要，文章配图以详情页 og:image 为准。
 * 幂等，仅更新 image_url 为空的条目；详情页抓取失败/无 og:image 的条目保持无图（前端自动跳过）。
 *
 * 用法：node --import tsx scripts/backfill-images.ts
 */
import { createClient } from '@supabase/supabase-js';
import { fetchArticleImage } from '../src/lib/news/feeds';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { data: rows, error } = await db.from('items').select('id,url,title').is('image_url', null);
  if (error) throw new Error(`查询缺图条目失败: ${error.message}`);
  const missing = (rows ?? []) as { id: string; url: string; title: string }[];
  console.log(`库内缺图条目 ${missing.length} 条，开始抓取详情页 og:image…`);

  let updated = 0;
  let failed = 0;
  for (const row of missing) {
    const img = await fetchArticleImage(row.url);
    if (!img) {
      failed++;
      continue;
    }
    const { error: upErr } = await db.from('items').update({ image_url: img }).eq('id', row.id);
    if (upErr) {
      console.warn(`更新失败 ${row.url}: ${upErr.message}`);
      failed++;
      continue;
    }
    updated++;
    await sleep(150); // 轻微限速，避免触发目标站防护
  }
  console.log(`回填完成：成功 ${updated} 条，无图/失败 ${failed} 条（保持跳过）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
