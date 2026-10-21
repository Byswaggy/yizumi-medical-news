/**
 * 种子数据：在无法联网抓取或需要演示时，灌入一批覆盖 A/B 类的典型条目。
 * node --import tsx scripts/seed.ts
 * 幂等：按 url 去重（与抓取链路相同），重复执行不会产生重复数据。
 */
import { syncSources, findExistingUrls, insertItem, upsertAnalysis, getRecentItems, updateCluster, isDbConfigured } from '../src/storage/database/repo';
import { enrichEntry } from '../src/lib/news/enrich';
import { generateReportForDate } from '../src/lib/news/reports';
import type { RawEntry } from '../src/lib/news/types';

const now = Date.now();
const hoursAgo = (h: number): string => new Date(now - h * 3600 * 1000).toISOString();

const SEED: { slug: string; entries: RawEntry[] }[] = [
  {
    slug: 'mti',
    entries: [
      {
        url: 'https://med-techinsights.com/seed/peek-implant-cleanroom-expansion/',
        title: 'Medical PEEK implant maker opens new cleanroom injection molding facility',
        summary:
          'A medical device contract manufacturer opened a 12,000 m² ISO Class 8 cleanroom plant dedicated to implant-grade PEEK injection molding, adding 18 all-electric machines and automated assembly lines to support spinal and trauma device volume.',
        publishedAt: hoursAgo(3),
        category: 'Medical Plastics',
      },
      {
        url: 'https://med-techinsights.com/seed/lsr-micro-molding-diagnostics/',
        title: 'LSR and micro molding demand surges for point-of-care diagnostic consumables',
        summary:
          'Demand for liquid silicone rubber (LSR) seals and micro-molded fluidic components is rising rapidly in point-of-care diagnostic cartridges, driving orders for precision all-electric micro molding machines and multi-cavity tooling.',
        publishedAt: hoursAgo(9),
        category: 'Medical Plastics',
      },
      {
        url: 'https://med-techinsights.com/seed/pre-filled-syringe-high-speed/',
        title: 'High-speed thin-wall molding line doubles pre-filled syringe barrel capacity',
        summary:
          'A pharma packaging producer commissioned a high-speed thin-wall injection molding line for COP/COC pre-filled syringe barrels, targeting 300 million units per year with cycle times below 6 seconds and full camera inspection.',
        publishedAt: hoursAgo(20),
        category: 'Consumables',
      },
      {
        url: 'https://med-techinsights.com/seed/iso13485-validation-traceability/',
        summary:
          'Under the latest EU MDR expectations, medical molders are investing in process validation, UDI traceability and cleanroom certification, creating demand for machines with full production data logging.',
        publishedAt: hoursAgo(30),
        title: 'ISO 13485 and MDR traceability push molders toward validated smart production',
        category: 'Regulatory',
      },
    ],
  },
  {
    slug: 'mdo',
    entries: [
      {
        url: 'https://www.medicaldesignandoutsourcing.com/seed/cdmo-greenfield-investment/',
        title: 'Medical device CDMO invests $85M in greenfield injection molding campus',
        summary:
          'A top-20 medtech CDMO announced an $85 million greenfield campus with 40 injection molding presses, cleanroom assembly and automation, focused on drug delivery devices and surgical instruments, with production starting in 14 months.',
        publishedAt: hoursAgo(6),
        category: 'Manufacturing',
      },
      {
        url: 'https://www.medicaldesignandoutsourcing.com/seed/arburg-medical-cleanroom-press/',
        title: 'Arburg showcases electric cleanroom press for medical micro components at trade show',
        summary:
          'Arburg presented a new all-electric cleanroom-ready injection molding machine aimed at medical micro components and LSR, emphasizing low particle emission, IQ/OQ/PQ support and integrated robotics.',
        publishedAt: hoursAgo(14),
        category: 'Equipment',
      },
      {
        url: 'https://www.medicaldesignandoutsourcing.com/seed/multishot-insert-wearable-injector/',
        title: 'Two-shot and insert molding enable next-gen wearable drug delivery devices',
        summary:
          'Wearable injector programs increasingly combine two-shot soft-touch overmolding with metal insert molding, requiring multi-component presses and tight process control for biocompatible PC and TPE.',
        publishedAt: hoursAgo(26),
        category: 'Technology',
      },
      {
        url: 'https://www.medicaldesignandoutsourcing.com/seed/biotech-stock-rating/',
        title: 'Analysts upgrade biotech stock after strong quarterly earnings',
        summary:
          'Shares rose after the company beat quarterly earnings estimates and raised its full-year revenue guidance; management discussed clinical pipeline and reimbursement discussions.',
        publishedAt: hoursAgo(34),
        category: 'Business',
      },
    ],
  },
  {
    slug: 'mddi',
    entries: [
      {
        url: 'https://www.mddionline.com/seed/engel-cap-summit-case/',
        title: 'Engel wins multi-machine order for blood collection tube production',
        summary:
          'A diagnostics manufacturer ordered a fleet of Engel all-electric high-speed machines for PET blood collection tubes, citing energy efficiency and fast delivery; commissioning spans two new cleanroom lines.',
        publishedAt: hoursAgo(11),
        category: 'Equipment',
      },
      {
        url: 'https://www.mddionline.com/seed/medical-grade-tpe-tpu-materials/',
        title: 'New medical-grade TPE and TPU grades target overmolded surgical components',
        summary:
          'Material suppliers launched medical-grade TPE and TPU grades optimized for overmolding PP and PC in surgical instrument handles and respiratory masks, with ISO 10993 biocompatibility data.',
        publishedAt: hoursAgo(22),
        category: 'Materials',
      },
      {
        url: 'https://www.mddionline.com/seed/samd-ai-diagnostics-app/',
        title: 'FDA clears AI-powered SaMD platform for imaging triage',
        summary:
          'The software-as-a-medical-device uses a cloud platform and deep learning algorithms to triage radiology images; the clearance has no connection to device manufacturing or plastics.',
        publishedAt: hoursAgo(40),
        category: 'Digital Health',
      },
      {
        url: 'https://www.mddionline.com/seed/drug-phase3-trial/',
        title: 'Phase 3 trial meets primary endpoint for new small molecule drug',
        summary:
          'The pharma company reported positive Phase 3 results for its small molecule candidate and plans a new drug application; manufacturing discussions center on fill-finish, not injection molding equipment.',
        publishedAt: hoursAgo(46),
        category: 'Pharma',
      },
    ],
  },
];

async function main(): Promise<void> {
  if (!isDbConfigured()) {
    console.error('[seed] 数据库未配置');
    process.exit(1);
  }
  const sourceMap = await syncSources();
  let inserted = 0;

  for (const group of SEED) {
    const sourceId = sourceMap.get(group.slug)?.id;
    if (!sourceId) {
      console.warn(`[seed] 未找到信源 ${group.slug}，跳过`);
      continue;
    }
    const existing = await findExistingUrls(group.entries.map((e) => e.url));
    const recent = await getRecentItems(24 * 30, 'id,title,published_at,cluster_id');
    const targets = recent.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      published_at: (r.published_at as string | null) ?? null,
    }));

    for (const entry of group.entries) {
      if (existing.has(entry.url)) {
        console.log(`  · 已存在，跳过: ${entry.title.slice(0, 48)}`);
        continue;
      }
      const enrichment = await enrichEntry(entry);
      const id = await insertItem(sourceId, { entry, enrichment });
      if (enrichment.analysis) await upsertAnalysis(id, enrichment.analysis, enrichment.llmModel);
      targets.push({ id, title: entry.title, published_at: entry.publishedAt });
      inserted++;
      console.log(`  + [${enrichment.score}] ${entry.title.slice(0, 60)}`);
    }
  }

  // 种子条目之间无跨源重复，簇信源数保持 1
  const all = await getRecentItems(24 * 30, 'id,cluster_id');
  for (const r of all) {
    if (r.cluster_id) await updateCluster(String(r.id), String(r.cluster_id), 1);
  }

  const dates = [new Date().toISOString().slice(0, 10), new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)];
  for (const d of dates) {
    try {
      await generateReportForDate(d);
    } catch (err) {
      console.warn(`[seed] 日报 ${d} 生成失败:`, (err as Error).message);
    }
  }
  console.log(`[seed] 完成，新增 ${inserted} 条；已尝试生成 ${dates.join('、')} 日报。`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[seed] 失败:', err);
  process.exit(1);
});
