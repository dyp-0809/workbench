import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@appica/ui-react/button';
import { Input } from '@appica/ui-react/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';
import { Badge } from '@appica/ui-react/badge';
import { api, Chart, Empty, LoadingButton, NumberRoller, SectionCard } from '@personal-workbench/core';

const MARKET_COLUMNS = [
  {
    title: '市场风险与核心指数',
    charts: [
      { symbol: 'UVXY', title: 'UVXY · 波动率代理', description: 'VIX 无现货报价时，使用追踪短期 VIX 期货的 UVXY 作为高波动风险情绪代理。' },
      { symbol: 'VOO', title: 'VOO · 标普 500 ETF', description: '观察美国大盘股整体表现。' },
      { symbol: 'QQQ', title: 'QQQ · 纳斯达克 100 ETF', description: '观察大型科技与成长股表现。' }
    ]
  },
  {
    title: '美元、利率与避险资产',
    charts: [
      { symbol: 'UUP', title: 'UUP · 美元指数 ETF', description: '观察美元相对主要货币的强弱。' },
      { symbol: 'TLT', title: 'TLT · 长期美债 ETF', description: '观察长期美国国债定价与利率预期。' },
      { symbol: 'GLD', title: 'GLD · 黄金 ETF', description: '观察避险情绪、实际利率与通胀预期。' }
    ]
  }
];

const MAGNIFICENT_SEVEN_CHARTS = [
  { symbol: 'AAPL', title: 'AAPL · Apple', description: '消费电子与服务生态。' },
  { symbol: 'MSFT', title: 'MSFT · Microsoft', description: '云计算、企业软件与 AI 基础设施。' },
  { symbol: 'GOOGL', title: 'GOOGL · Alphabet', description: '搜索广告、云服务与 AI 产品商业化。' },
  { symbol: 'AMZN', title: 'AMZN · Amazon', description: '电商、云计算与消费需求。' },
  { symbol: 'META', title: 'META · Meta', description: '数字广告、社交平台与 AI 应用效率。' },
  { symbol: 'NVDA', title: 'NVDA · NVIDIA', description: 'AI 算力、半导体周期与数据中心资本开支。' },
  { symbol: 'TSLA', title: 'TSLA · Tesla', description: '电动车、储能与高波动成长资产。' }
];

const UPCOMING_EARNINGS_CHARTS = [
  { symbol: 'NVDA', title: 'NVDA · 英伟达', description: 'AI 算力龙头，重点观察财报前后的价格变化。' },
  { symbol: 'CRM', title: 'CRM · Salesforce', description: '企业软件与 AI 应用商业化代表。' },
  { symbol: 'CRWD', title: 'CRWD · CrowdStrike', description: '网络安全行业代表。' }
];

const ALL_MARKET_CHARTS = [...MARKET_COLUMNS.flatMap((column) => column.charts), ...UPCOMING_EARNINGS_CHARTS, ...MAGNIFICENT_SEVEN_CHARTS];

function MarketGauge({ quote }) {
  const changePercent = Number(quote?.changePercent) || 0;
  const positive = changePercent >= 0;
  const color = positive ? '#16a34a' : '#dc2626';
  const option = {
    animation: false,
    series: [{
      type: 'gauge', min: -10, max: 10, startAngle: 210, endAngle: -30, center: ['50%', '58%'], radius: '92%',
      pointer: { show: true, length: '62%', width: 5, itemStyle: { color } },
      progress: { show: true, width: 12, itemStyle: { color } },
      axisLine: { lineStyle: { width: 12, color: [[0.5, '#fee2e2'], [1, '#dcfce7']] } },
      axisTick: { distance: -17, splitNumber: 2, lineStyle: { color: '#94a3b8', width: 1 } },
      splitLine: { distance: -17, length: 7, lineStyle: { color: '#64748b', width: 2 } },
      axisLabel: { distance: -29, color: '#64748b', fontSize: 10, formatter: (value) => value === -10 ? '下跌' : value === 10 ? '上涨' : '' },
      detail: { offsetCenter: [0, '24%'], valueAnimation: false, color, fontSize: 20, fontWeight: 700, formatter: (value) => `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%` },
      data: [{ value: Math.max(-10, Math.min(10, changePercent)) }]
    }]
  };
  return <Chart option={option} height={145} />;
}

function AnimatedMoney({ value }) {
  if (!Number.isFinite(Number(value))) return <span>—</span>;
  return <><span className="dashboard-currency-symbol">$</span><NumberRoller value={Math.abs(Number(value))} format={(number) => number.toFixed(2)} /></>;
}

function AnimatedSigned({ value, suffix = '' }) {
  if (!Number.isFinite(Number(value))) return <span>—</span>;
  const number = Number(value);
  return <><span>{number > 0 ? '+' : number < 0 ? '-' : ''}</span><NumberRoller value={Math.abs(number)} format={(current) => `${current.toFixed(2)}${suffix}`} /></>;
}

function FinnhubQuoteCard({ chart, quote }) {
  const failed = quote?.error;
  const changePositive = Number(quote?.changePercent) >= 0;
  return (
    <SectionCard title={chart.title} className="overflow-hidden">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground-muted">{chart.description}</p>
        {failed ? (
          <div className="rounded-md border border-border bg-background-muted/30 px-4 py-5 text-sm text-foreground-muted">
            Finnhub 暂无该标的行情：{failed}
          </div>
        ) : (
          <>
            <MarketGauge quote={quote} />
            <div className="grid gap-3 rounded-md border border-border bg-background-muted/20 p-4">
              <div className="grid gap-x-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground-muted">最新价</div>
                  <div className="mt-1 flex items-center whitespace-nowrap text-2xl font-semibold tabular-nums text-foreground-intense"><AnimatedMoney value={quote?.currentPrice} /></div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="flex justify-end text-xs font-medium text-foreground-muted">开盘</div>
                  <div className="mt-1 flex items-center justify-end whitespace-nowrap text-sm font-medium tabular-nums text-foreground-intense"><AnimatedMoney value={quote?.open} /></div>
                </div>
              </div>
              <div className="h-px bg-border" aria-hidden="true" />
              <div className="flex items-baseline justify-between gap-4">
                <div className="text-xs font-medium text-foreground-muted">日内涨跌幅</div>
                <div className="flex items-center justify-end whitespace-nowrap text-lg font-semibold tabular-nums" style={{ color: changePositive ? 'var(--profit)' : 'var(--loss)' }}><AnimatedSigned value={quote?.changePercent} suffix="%" /></div>
              </div>
            </div>
          </>
        )}
        <div className="text-xs text-foreground-muted">数据源：Finnhub · {chart.symbol}</div>
      </div>
    </SectionCard>
  );
}

function QuoteSkeleton() {
  return <div className="animate-pulse rounded-md border border-border bg-background-muted/20 p-4"><div className="h-3 w-24 rounded bg-border" /><div className="mt-4 h-8 w-32 rounded bg-border" /><div className="mt-5 h-3 w-full rounded bg-border" /><div className="mt-2 h-3 w-2/3 rounded bg-border" /></div>;
}

function MarketDashboardSummary({ quotes }) {
  const values = Object.values(quotes).filter((quote) => Number.isFinite(Number(quote.currentPrice)));
  const rising = values.filter((quote) => Number(quote.changePercent) > 0).length;
  const falling = values.filter((quote) => Number(quote.changePercent) < 0).length;
  const strongest = values.reduce((best, quote) => Number(quote.changePercent) > Number(best?.changePercent ?? -Infinity) ? quote : best, null);
  const weakest = values.reduce((worst, quote) => Number(quote.changePercent) < Number(worst?.changePercent ?? Infinity) ? quote : worst, null);
  const metricItems = [
    { label: '已加载标的', value: <><NumberRoller value={values.length} format={(number) => `${number}`} /> 个</>, hint: 'Finnhub 返回有效行情' },
    { label: '上涨 / 下跌', value: <><NumberRoller value={rising} format={(number) => `${number}`} /> / <NumberRoller value={falling} format={(number) => `${number}`} /></>, hint: '当前日内涨跌方向' },
    { label: '最强表现', value: strongest ? <span className="text-success-emphasis">{strongest.symbol} <AnimatedSigned value={strongest.changePercent} suffix="%" /></span> : '—', hint: '日内涨跌幅最高' },
    { label: '最弱表现', value: weakest ? <span className="text-error-emphasis">{weakest.symbol} <AnimatedSigned value={weakest.changePercent} suffix="%" /></span> : '—', hint: '日内涨跌幅最低' }
  ];
  return <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>{metricItems.map((item) => <div key={item.label} className="rounded-lg border border-border bg-background-muted/20 p-4"><div className="text-xs text-foreground-muted">{item.label}</div><div className="mt-2 flex min-h-7 items-center text-xl font-semibold tabular-nums text-foreground-intense">{item.value}</div><div className="mt-1 text-xs text-foreground-muted">{item.hint}</div></div>)}</div>;
}

function LoadingDashboard() {
  return <div className="flex flex-col gap-6" aria-live="polite" aria-busy="true"><div className="grid grid-cols-1 gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <QuoteSkeleton key={item} />)}</div><div className="grid grid-cols-2 gap-6">{[1, 2, 3, 4, 5, 6].map((item) => <QuoteSkeleton key={item} />)}</div><p className="text-center text-sm text-foreground-muted">正在从 Finnhub 加载市场数据…</p></div>;
}

function MarketSection({ title, description, charts, quotes, columns = 3 }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-foreground-intense">{title}</h3>
        {description && <p className="mt-1 text-sm text-foreground-muted">{description}</p>}
      </div>
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {charts.map((chart) => <FinnhubQuoteCard key={`${title}-${chart.symbol}`} chart={chart} quote={quotes[chart.symbol]} />)}
      </div>
    </section>
  );
}

function AlertRulesDialog({ open, onOpenChange, rules, onSave, saving, triggeredAlerts, deliveryErrors }) {
  const [draft, setDraft] = useState([]);
  useEffect(() => { if (open) setDraft(rules.map((rule) => ({ ...rule }))); }, [open, rules]);
  const update = (index, field, value) => setDraft((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:w-160"><DialogHeader><DialogTitle>市场预警</DialogTitle><DialogDescription>修改后保存到本机。行情刷新时按规则判断，命中后推送到已有的 Bark 配置。</DialogDescription></DialogHeader><DialogBody className="max-h-[70vh] overflow-y-auto"><div className="flex flex-col gap-4">{draft.map((rule, index) => <div key={rule.id} className="rounded-md border border-border p-4"><div className="flex items-center justify-between gap-3"><strong>{rule.level}</strong><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.enabled !== false} onChange={(event) => update(index, 'enabled', event.target.checked)} />启用</label></div><div className="mt-3 grid grid-cols-3 gap-3"><label className="text-sm">UVXY 当日涨幅 ≥<Input type="number" step="0.1" value={rule.uvxyThreshold} onChange={(event) => update(index, 'uvxyThreshold', event.target.value)} /></label><label className="text-sm">VOO 或 QQQ ≤<Input type="number" step="0.1" value={rule.marketThreshold} onChange={(event) => update(index, 'marketThreshold', event.target.value)} /></label><label className="text-sm">两日累计 ≥<Input type="number" step="0.1" placeholder="不启用" value={rule.twoDayThreshold ?? ''} onChange={(event) => update(index, 'twoDayThreshold', event.target.value)} /></label></div><label className="mt-3 block text-sm">面向用户提示<Input value={rule.message} onChange={(event) => update(index, 'message', event.target.value)} /></label></div>)}{triggeredAlerts.length > 0 && <div className="rounded-md border border-warning-emphasis/40 bg-warning-subtle p-3"><div className="mb-2 font-semibold">本次已触发</div>{triggeredAlerts.map((alert) => <div key={alert.id} className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="warning" size="sm">{alert.level}</Badge><span>{alert.message}</span><span className="text-foreground-muted">{alert.pushed ? '已推送 Bark' : '待推送'}</span></div>)}</div>}{deliveryErrors.length > 0 && <div className="text-sm text-error-emphasis">Bark 推送未完成：{deliveryErrors.map((item) => item.error).join('；')}</div>}</div></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={saving} onClick={() => onSave(draft)}>保存预警规则</LoadingButton></DialogFooter></DialogContent></Dialog>;
}

function StockMarketPage() {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [alertRules, setAlertRules] = useState([]);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [deliveryErrors, setDeliveryErrors] = useState([]);
  const symbols = useMemo(() => ALL_MARKET_CHARTS.map((chart) => chart.symbol), []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/stock-market?symbols=${encodeURIComponent(symbols.join(','))}`);
      setQuotes(Object.fromEntries((data.quotes || []).map((quote) => [quote.symbol, quote])));
      setLastUpdated(data.updatedAt || null);
      setTriggeredAlerts(data.alerts?.triggered || []);
      setDeliveryErrors(data.alerts?.deliveryErrors || []);
    } finally {
      setLoading(false);
    }
  }, [symbols]);
  const loadAlertRules = useCallback(async () => { const data = await api('/stock-market/alerts'); setAlertRules(data.rules || []); }, []);
  const saveAlertRules = async (rules) => { setAlertSaving(true); try { const data = await api('/stock-market/alerts', { method: 'PUT', body: JSON.stringify({ rules }) }); setAlertRules(data.rules || rules); setAlertOpen(false); } finally { setAlertSaving(false); } };

  useEffect(() => { load(); loadAlertRules().catch(() => {}); }, [load, loadAlertRules]);

  return (
    <div className="flex flex-col gap-6 pb-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <a className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-white transition-colors hover:opacity-85" style={{ backgroundColor: '#0f172a', color: '#ffffff' }} href="https://cn.tradingview.com/markets/usa/" target="_blank" rel="noopener noreferrer">TradingView 美股</a>
          <a className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-white transition-colors hover:opacity-85" style={{ backgroundColor: '#2563eb', color: '#ffffff' }} href="https://client.schwab.com/Areas/Access/Login?chinese=y" target="_blank" rel="noopener noreferrer">Schwab 登录</a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" style={{ borderColor: '#fbbf24', color: '#b45309' }} className="hover:bg-amber-50" onClick={() => setAlertOpen(true)}>预警{triggeredAlerts.length ? ` · ${triggeredAlerts.length}` : ''}</Button>
          <LoadingButton loading={loading} onClick={load} variant="primary">刷新行情</LoadingButton>
        </div>
      </section>
      {loading ? <LoadingDashboard /> : !Object.keys(quotes).length ? <Empty title="暂无行情数据" description="请先在设置中配置 Finnhub API Key。" /> : (
        <>
          <MarketDashboardSummary quotes={quotes} />
          {MARKET_COLUMNS.map((column) => <MarketSection key={column.title} title={column.title} charts={column.charts} quotes={quotes} columns={3} />)}
          <MarketSection title="未来一周财报" description="重点标的行情快照，财报日期需结合官方公告核对。" charts={UPCOMING_EARNINGS_CHARTS} quotes={quotes} columns={5} />
          <MarketSection title="美股七姐妹" description="跟踪大型科技股的个股走势与行业相对强弱。" charts={MAGNIFICENT_SEVEN_CHARTS} quotes={quotes} columns={5} />
        </>
      )}
      {lastUpdated && <div className="text-xs text-foreground-muted">最近更新：{new Date(lastUpdated).toLocaleString('zh-CN')}</div>}
      <AlertRulesDialog open={alertOpen} onOpenChange={setAlertOpen} rules={alertRules} onSave={saveAlertRules} saving={alertSaving} triggeredAlerts={triggeredAlerts} deliveryErrors={deliveryErrors} />
    </div>
  );
}

export { StockMarketPage };
