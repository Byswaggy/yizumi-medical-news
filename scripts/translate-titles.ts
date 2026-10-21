/**
 * 补全中文标题与摘要：对所有 title_zh 为空的条目调用 LLM 翻译，更新 title_zh / summary_zh。
 * 幂等，仅处理缺失项；LLM 不可用时跳过并保留原文（不伪造翻译）。
 *
 * 用法：node --import tsx scripts/translate-titles.ts [--all]
 *   默认仅处理精选条目；--all 处理库内全部条目。
 */
import { createClient } from '@supabase/supabase-js';
import { llmChat } from '../src/lib/news/llm';

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

const SYSTEM_PROMPT = `你是医疗器械制造行业的专业翻译，服务注塑机厂商的中文情报站。
把给定的英文资讯标题与摘要翻译成中文。只输出一个 JSON 对象，不要解释、不要 markdown 代码块：
{"title_zh":"简洁专业的中文标题，20-40字，保留品牌名/公司名/型号原文","summary_zh":"中文摘要，60-120字，只陈述事实"}`;

function extractJson(raw: string): Record<string, unknown> | null {
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface Row {
  id: string;
  title: string;
  summary: string | null;
}

async function main(): Promise<void> {
  const all = process.argv.includes('--all');
  let query = db.from('items').select('id,title,summary').or('title_zh.is.null,title_zh.eq.');
  if (!all) query = query.eq('passed_filter', true);
  const { data, error } = await query.order('score', { ascending: false }).limit(all ? 100 : 30);
  if (error) throw new Error(`读取失败: ${error.message}`);
  const rows = (data ?? []) as Row[];
  console.log(`待翻译 ${rows.length} 条（范围：${all ? '全部' : '精选'}）`);
  if (rows.length === 0) {
    console.log('无缺失，标题已全部为中文。');
    return;
  }

  let ok = 0;
  let skipped = 0;
  for (const row of rows) {
    const user = `标题: ${row.title}\n摘要: ${(row.summary ?? '').slice(0, 500) || '（无）'}`;
    const r = await llmChat(SYSTEM_PROMPT, user);
    const obj = r ? extractJson(r.content) : null;
    const titleZh = typeof obj?.title_zh === 'string' ? (obj.title_zh as string).trim() : '';
    const summaryZh = typeof obj?.summary_zh === 'string' ? (obj.summary_zh as string).trim() : '';
    if (!titleZh) {
      skipped += 1;
      console.log(`· 跳过（LLM 不可用或返回异常）: ${row.title.slice(0, 50)}`);
      continue;
    }
    const update: Record<string, string> = { title_zh: titleZh.slice(0, 80) };
    if (summaryZh) update.summary_zh = summaryZh.slice(0, 300);
    const { error: upErr } = await db.from('items').update(update).eq('id', row.id);
    if (upErr) {
      skipped += 1;
      console.log(`· 更新失败: ${upErr.message}`);
      continue;
    }
    ok += 1;
    console.log(`✓ ${titleZh.slice(0, 44)}`);
  }
  console.log(`完成：翻译 ${ok}，跳过 ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
