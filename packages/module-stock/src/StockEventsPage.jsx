import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@appica/ui-react/badge';
import { Button } from '@appica/ui-react/button';
import { Card } from '@appica/ui-react/card';
import { Skeleton } from '@appica/ui-react/skeleton';
import { api, Empty, LoadingButton, SectionCard } from '@personal-workbench/core';

const IMPACT_LABELS = { high: '高影响', medium: '中影响', low: '低影响' };
const IMPACT_VARIANTS = { high: 'error', medium: 'warning', low: 'secondary' };

function dateValue(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function addDays(dateKey, amount) {
  const date = dateValue(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}


function formatBeijingDate(dateKey) {
  const formatted = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'short' }).format(dateValue(dateKey));
  return formatted.replace(/(\d+\/\d+)(周)/, '$1 $2');
}

function formatMarketDate(event) {
  if (event.endDate && event.endDate !== event.marketDate) return `${event.marketDate} 至 ${event.endDate}`;
  return event.marketDate;
}

function EventCard({ event }) {
  return (
    <Card render={<article />} contentProps={{ className: 'gap-3 p-4' }}>
      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-pretty text-sm font-semibold text-foreground-intense">{event.title}</h3>
          <p className="mt-1 text-sm font-medium tabular-nums text-foreground-intense">
            {formatBeijingDate(event.beijingDate)}{event.beijingTime ? ` ${event.beijingTime}` : ''}（北京时间）
          </p>
          <p className="mt-1 break-words text-xs tabular-nums text-foreground-muted">
            美东：{formatMarketDate(event)}{event.marketTime ? ` ${event.marketTime}` : ''}
          </p>
        </div>
        <Badge className="shrink-0" variant={IMPACT_VARIANTS[event.impactLevel] || 'secondary'}>{IMPACT_LABELS[event.impactLevel] || '待评估'}</Badge>
      </div>
      <p className="break-words text-sm leading-6 text-foreground-muted">{event.impact}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
        <span>{event.status === 'occurred' ? '已发生' : '即将发生'}</span>
        <span className="break-words">{`来源：${event.source}`}</span>
        {event.updatedAt && <span className="break-words">{`更新：${new Date(event.updatedAt).toLocaleString('zh-CN')}`}</span>}
        {event.sourceUrl && <a className="underline underline-offset-2 hover:text-foreground-intense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={event.sourceUrl} target="_blank" rel="noopener noreferrer">查看来源</a>}
      </div>
    </Card>
  );
}

function LoadingEvents() {
  return <div className="grid gap-4 md:grid-cols-2" aria-hidden="true" aria-busy="true">{[1, 2, 3, 4].map((item) => <Skeleton key={item} effect="shimmer" className="h-44" />)}</div>;
}

function sourceNotice(sources) {
  if (sources?.external?.status === 'partial') return `官方宏观日历部分可用：${sources.external.error} 当前仍展示可用官方事件与本地核心事件。`;
  if (sources?.external?.status === 'error') return `官方宏观日历暂不可用：${sources.external.error} 当前仍展示本地核心事件。`;
  if (sources?.external?.status === 'unavailable') return '未配置官方宏观日历数据源：当前仅展示本地核心事件。';
  return '宏观日历来源为 BLS 与 BEA 官方发布日历；事件日期按美东市场日归属，展示时间转换为北京时间；影响说明仅用于风险提示，不代表涨跌预测。';
}
function StockEventsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const nextData = await api('/stock-events');
      if (currentRequestId === requestId.current) setData(nextData);
    } catch (nextError) {
      if (currentRequestId === requestId.current) setError(nextError.message);
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => { requestId.current += 1; };
  }, [load]);

  const weeks = useMemo(() => {
    if (!data?.window) return [];
    return Array.from({ length: 4 }, (_, index) => addDays(data.window.from, index * 7));
  }, [data]);
  const eventsByWeek = useMemo(() => {
    const grouped = new Map(weeks.map((week) => [week, []]));
    for (const event of data?.events || []) {
      if (grouped.has(event.marketWeek)) grouped.get(event.marketWeek).push(event);
    }
    return grouped;
  }, [data, weeks]);
  const liveMessage = loading ? '正在刷新事件…' : error ? `事件加载失败：${error}` : data ? `事件已更新，共 ${data.events?.length || 0} 项。` : '';

  return (
    <div className="flex flex-col gap-6 pb-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-foreground-muted">本周与未来三周的美股市场风险日历</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground-muted">聚焦 FOMC、通胀、就业、增长、季度期权到期和美国大选等可能改变市场预期的事件。</p>
        </div>
        <LoadingButton loading={loading} onClick={load} variant="primary">{loading ? '刷新事件…' : '刷新事件'}</LoadingButton>
      </section>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>
      {error && <SectionCard title="事件日历暂时无法加载" titleAs="h2"><div className="flex min-w-0 flex-wrap items-center justify-between gap-3" role="alert"><p className="min-w-0 break-words text-sm text-error-emphasis">{error}</p><Button variant="outline" onClick={load}>重试</Button></div></SectionCard>}
      {loading && !data ? <LoadingEvents /> : data && (
        <>
          <p className="break-words text-pretty text-sm text-foreground-muted" aria-live="polite">{sourceNotice(data.sources)}</p>
          {weeks.map((week, index) => {
            const events = eventsByWeek.get(week) || [];
            const end = addDays(week, 6);
            return (
              <SectionCard key={week} title={index === 0 ? '本周' : `未来第 ${index} 周`} titleAs="h2">
                <div className="mb-4 text-xs tabular-nums text-foreground-muted">{week} 至 {end}（美东市场周）</div>
                {events.length ? <div className="grid gap-4 md:grid-cols-2">{events.map((event) => <EventCard key={event.id} event={event} />)}</div> : <Empty className="py-4" description="本周暂无已收录的重要事件。" />}
              </SectionCard>
            );
          })}
          <div className="flex flex-wrap justify-between gap-2 text-xs text-foreground-muted">
            <span>{data.sources.local.label || '本地规则'}：{data.sources.local.updatedAt ? `更新于 ${new Date(data.sources.local.updatedAt).toLocaleString('zh-CN')}` : '可用'}</span>
            <span>数据刷新：{data.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-CN') : '—'}</span>
          </div>
        </>
      )}
    </div>
  );
}

export { StockEventsPage };
