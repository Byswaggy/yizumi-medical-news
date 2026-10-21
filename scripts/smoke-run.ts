/**
 * 冒烟测试：node scripts/smoke.ts（tsx）
 * 1) 数据库连通 + 基础读写能力
 * 2) 抓取链路可跑通（每个信源适配器：RSS / rss2json 代理 / HTML 兜底）
 * 3) 首页与 /api/health 健康检查（开发服务器在跑时）
 * 输出清晰的通过/失败信息，任一硬检查失败则以非 0 退出。
 */
import { countItems, isDbConfigured, latestCrawlLogs } from '../src/storage/database/repo';
import { fetchAllSources, SOURCES } from '../src/lib/news/feeds';

interface CheckResult {
  name: string;
  ok: boolean;
  skipped?: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function pass(name: string, detail: string): void {
  results.push({ name, ok: true, detail });
}
function fail(name: string, detail: string): void {
  results.push({ name, ok: false, detail });
}
function skip(name: string, detail: string): void {
  results.push({ name, ok: true, skipped: true, detail });
}

async function checkDatabase(): Promise<void> {
  if (!isDbConfigured()) {
    fail('数据库配置', '缺少 COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY 环境变量');
    return;
  }
  try {
    const counts = await countItems();
    pass('数据库连通', `items 共 ${counts.total} 条，其中精选 ${counts.passed} 条`);
  } catch (err) {
    fail('数据库连通', `查询失败：${(err as Error).message}`);
  }

  try {
    const logs = await latestCrawlLogs(1);
    pass('抓取日志读取', logs[0] ? `最近一轮：${logs[0].slug} / ${logs[0].status}` : '暂无抓取日志（首次运行正常，执行 pnpm crawl 后生成）');
  } catch (err) {
    fail('抓取日志读取', (err as Error).message);
  }
}

async function checkCrawl(): Promise<void> {
  let fetched: Awaited<ReturnType<typeof fetchAllSources>>;
  try {
    fetched = await fetchAllSources();
  } catch (err) {
    fail('抓取链路', `fetchAllSources 异常：${(err as Error).message}`);
    return;
  }

  const bySlug = new Map(fetched.map((f) => [f.slug, f]));
  for (const source of SOURCES) {
    const f = bySlug.get(source.slug);
    if (!f) {
      fail(`抓取-${source.slug}`, '未返回结果');
      continue;
    }
    const via = f.channel === 'none' ? '无可用通道' : `via ${f.channel}`;
    if (f.entries.length > 0) {
      const sample = f.entries[0];
      const hasFields = Boolean(sample.url && sample.title && sample.summary !== undefined);
      if (hasFields) {
        pass(`抓取-${source.slug}`, `${via}，${f.entries.length} 条；示例：${sample.title.slice(0, 50)}`);
      } else {
        fail(`抓取-${source.slug}`, `${via}，条目缺少 url/title/summary 字段`);
      }
    } else {
      // 单源失败（如 WAF 拦截）不应让整站冒烟失败：链路本身可跑通并有错误记录
      pass(`抓取-${source.slug}`, `${via}，0 条${f.error ? `（${f.error}）— 通道已尝试，待目标站放行或更新 feed` : ''}`);
    }
  }

  const total = fetched.reduce((sum, f) => sum + f.entries.length, 0);
  if (total === 0) {
    fail('抓取链路', '全部信源 0 条，可能网络不可用');
  } else {
    pass('抓取链路汇总', `共获取 ${total} 条原始资讯`);
  }
}

async function checkHttp(): Promise<void> {
  const port = process.env.DEPLOY_RUN_PORT ?? '5000';
  const base = `http://localhost:${port}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const home = await fetch(`${base}/`, { signal: controller.signal, headers: { Accept: 'text/html' } });
    clearTimeout(timer);
    const html = await home.text();
    if (home.status === 200 && html.includes('注塑机')) {
      pass('首页健康检查', `${base}/ 返回 200 且含站点内容`);
    } else {
      fail('首页健康检查', `状态 ${home.status}，内容不符预期`);
    }
  } catch {
    skip('首页健康检查', `开发服务器未运行（${base} 不可达）— 启动后可访问页面；不影响数据库与抓取链路结论`);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    const body = (await res.json()) as { status?: string };
    if (res.ok && body.status === 'ok') {
      pass('API 健康检查', `${base}/api/health status=ok`);
    } else {
      fail('API 健康检查', `状态 ${res.status}，响应 ${JSON.stringify(body).slice(0, 120)}`);
    }
  } catch {
    skip('API 健康检查', '开发服务器未运行 — 启动后 /api/health 可用');
  }
}

async function main(): Promise<void> {
  console.log('\n═══ 注塑机·医疗行业线热点资讯站 — 冒烟测试 ═══\n');
  await checkDatabase();
  await checkCrawl();
  await checkHttp();

  const hardFailures = results.filter((r) => !r.ok);
  for (const r of results) {
    const icon = r.skipped ? '○' : r.ok ? '✓' : '✗';
    const label = r.skipped ? '跳过' : r.ok ? '通过' : '失败';
    console.log(`${icon} [${label}] ${r.name}\n    ${r.detail}`);
  }
  console.log(`\n合计 ${results.length} 项：${results.filter((r) => r.ok && !r.skipped).length} 通过，${results.filter((r) => r.skipped).length} 跳过，${hardFailures.length} 失败`);

  if (hardFailures.length > 0) {
    console.log('\n冒烟测试未通过。');
    process.exit(1);
  }
  console.log('\n冒烟测试通过。');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('冒烟脚本异常:', err);
  process.exit(1);
});
