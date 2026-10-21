/**
 * 回填 MPO 系列（wp-json 通道）条目的 featured_media 配图。
 * 背景：MPO 整站 HTML 被 Cloudflare 拦截，文章详情页 og:image 抓不到；
 * 改用官方开放的 /wp-json/wp/v2/media 端点按 featured_media id 换图（直连可达）。
 * 用法：node --import tsx scripts/backfill-wp-images.ts
 */
import { SOURCES, fetchSource } from '../src/lib/news/feeds';
import { getSupabaseClient } from '../src/storage/database/supabase-client';
import { normalizeUrl } from '../src/lib/news/dedup';

const WP_SLUGS = ['mpo', 'mpo-breaking-news', 'mpo-features', 'mpo-exclusives', 'mpo-columns'];

async function main(): Promise<void> {
  const client = getSupabaseClient();
  let totalUpdated = 0;
  for (const slug of WP_SLUGS) {
    const src = SOURCES.find((s) => s.slug === slug);
    if (!src) {
      console.log(`${slug}: 未在 SOURCES 配置，跳过`);
      continue;
    }
    const { data: srow } = await client.from('sources').select('id').eq('slug', slug).single();
    if (!srow?.id) {
      console.log(`${slug}: sources 表无此行，跳过`);
      continue;
    }
    let result;
    try {
      result = await fetchSource(src);
    } catch (e) {
      console.log(`${slug}: 抓取失败 ${(e as Error).message}`);
      continue;
    }
    const imgByUrl = new Map<string, string>();
    for (const e of result.entries) {
      // 库内 url 已经 normalizeUrl 规范化（去 www/尾斜杠），key 需对齐
      if (e.imageUrl) imgByUrl.set(normalizeUrl(e.url), e.imageUrl);
    }
    const { data: items } = await client
      .from('items')
      .select('id,url')
      .eq('source_id', srow.id)
      .is('image_url', null);
    let updated = 0;
    for (const item of items ?? []) {
      const img = imgByUrl.get(item.url as string);
      if (img) {
        const { error } = await client.from('items').update({ image_url: img }).eq('id', item.id);
        if (!error) updated++;
      }
    }
    totalUpdated += updated;
    console.log(
      `${slug}: 抓到带图 ${imgByUrl.size}/${result.entries.length}，库内无图 ${items?.length ?? 0}，回填 ${updated}`,
    );
  }
  console.log(`完成：共回填 ${totalUpdated} 张配图`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
