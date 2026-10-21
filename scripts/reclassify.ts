/**
 * 全量重算存量条目：用最新的三条件硬筛选 + 六维加权评分刷新数据库。
 * 只重算规则可确定的字段（score / passed_filter / relevance_level / recommend_reason / signal_tags），
 * 不覆盖已有的中文标题/摘要与 7 维分析；对新进入精选但缺分析的条目补一版降级分析。
 *
 * 用法：node --import tsx scripts/reclassify.ts
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
  const { data: items, error } = await db
    .from('items')
    .select('id,title,summary,category,published_at')
    .order('published_at', { ascending: false });
  if (error) throw new Error(`读取条目失败: ${error.message}`);
  const rows = (items ?? []) as Array<{
    id: string;
    title: string;
    summary: string | null;
    category: string | null;
    published_at: string | null;
  }>;
  console.log(`待重算 ${rows.length} 条`);

  // 动态加载避免脚本启动期开销
  const { classify } = await import('../src/lib/news/rules');
  const { buildFallbackAnalysis } = await import('../src/lib/news/analysis');

  let passedCount = 0;
  for (const row of rows) {
    const c = classify({
      url: '',
      title: row.title,
      summary: row.summary ?? '',
      publishedAt: row.published_at,
      category: row.category,
    });
    if (c.passed) passedCount += 1;

    const signalTags = [...c.matchedEventZh, ...c.matchedProcessZh, ...c.matchedProductZh]
      .map((t) => t.split('/')[0].replace(/（.*?）/, '').trim())
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .slice(0, 4);

    // 更新条目主字段
    const { error: upErr } = await db
      .from('items')
      .update({
        score: c.score,
        passed_filter: c.passed,
        relevance_level: c.level,
        recommend_reason: c.reason,
        signal_tags: signalTags,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (upErr) {
      console.warn(`更新条目失败 ${row.id}: ${upErr.message}`);
      continue;
    }

    // 对精选条目：若无 7 维分析则补一版降级分析
    if (c.passed) {
      const { data: ex } = await db.from('item_analyses').select('item_id').eq('item_id', row.id).maybeSingle();
      if (!ex) {
        const analysis = buildFallbackAnalysis(row.title, row.summary ?? '', c);
        await db.from('item_analyses').upsert(
          {
            item_id: row.id,
            dimensions: analysis.dimensions,
            business_need: analysis.businessNeed,
            need_direction: analysis.needDirection,
          },
          { onConflict: 'item_id' },
        );
      }
    }
  }

  console.log(`重算完成：精选 ${passedCount} / 全部 ${rows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('重算失败:', err);
    process.exit(1);
  });
