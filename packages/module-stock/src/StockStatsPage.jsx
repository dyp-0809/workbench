import { useEffect, useMemo, useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@appica/ui-react/table';
import { api, Empty } from '@personal-workbench/core';

const MARKET_LABEL = { US: '美股', HK: '港股', CN: 'A 股' };

function formatMoney(value) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function signed(value, fractionDigits = 2) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(Math.abs(value))}`;
}

function StockStatsPage() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api('/stock-positions').then((data) => setPositions(data.positions)).catch(() => setPositions([])).finally(() => setLoading(false)); }, []);

  const model = useMemo(() => {
    const enriched = positions.map((item) => {
      const cost = item.quantity * item.costPrice;
      const value = item.quantity * item.currentPrice;
      const pnl = value - cost;
      return { ...item, cost, value, pnl, pnlPercent: cost > 0 ? pnl / cost : 0 };
    });
    const totalCost = enriched.reduce((sum, item) => sum + item.cost, 0);
    const totalValue = enriched.reduce((sum, item) => sum + item.value, 0);
    const totalPnl = totalValue - totalCost;
    const byMarket = Object.entries(enriched.reduce((acc, item) => {
      const entry = acc[item.market] || { value: 0, cost: 0 };
      entry.value += item.value;
      entry.cost += item.cost;
      acc[item.market] = entry;
      return acc;
    }, {})).map(([market, data]) => ({ market, ...data })).sort((a, b) => b.value - a.value);
    const sorted = [...enriched].sort((a, b) => b.pnlPercent - a.pnlPercent);
    return { enriched, totalCost, totalValue, totalPnl, pnlPercent: totalCost > 0 ? totalPnl / totalCost : 0, byMarket, sorted };
  }, [positions]);

  if (loading) return <p className="text-foreground-muted">正在加载统计…</p>;
  if (!positions.length) {
    return (
      <div className="py-16">
        <Empty description="还没有持仓。先在「仓位管理」添加第一笔，这里会显示整体盈亏。" />
      </div>
    );
  }

  const up = model.totalPnl >= 0;
  const accent = up ? 'var(--profit)' : 'var(--loss)';

  return (
    <div className="flex flex-col gap-8">
      {/* 总盈亏：页面的结论 */}
      <header className="flex flex-col gap-3">
        <p className="text-[11px] font-extrabold tracking-[0.14em]" style={{ color: accent }}>总盈亏</p>
        <div className="flex items-baseline gap-4">
          <span className="text-[46px] font-bold leading-none tracking-tight tabular-nums" style={{ color: accent }}>{signed(model.totalPnl)}</span>
          <span className="text-[20px] font-semibold tabular-nums" style={{ color: accent }}>{signed(model.pnlPercent * 100, 2)}%</span>
        </div>
        <p className="text-sm text-foreground-muted tabular-nums">
          成本 {formatMoney(model.totalCost)} · 市值 {formatMoney(model.totalValue)} · 持仓 {positions.length}
        </p>
      </header>

      {/* 盈亏光谱：成本基线，线上盈利、线下亏损 */}
      <section className="rounded-xl border border-border px-4 pb-5 pt-4">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-semibold">持仓盈亏光谱</h3>
          <span className="text-[11px] text-foreground-muted">按盈亏幅度排序 · 线上盈利，线下亏损</span>
        </div>
        <div className="relative flex h-56">
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
          <span className="absolute right-0 top-1/2 -translate-y-1/2 bg-background pl-1 text-[10px] text-foreground-muted">0%</span>
          {model.sorted.map((item) => {
            const itemUp = item.pnl >= 0;
            const height = Math.max(8, Math.min(Math.abs(item.pnlPercent) * 240, 88));
            const barStyle = itemUp
              ? { bottom: '50%', height: `${height}px`, background: 'var(--profit)' }
              : { top: '50%', height: `${height}px`, background: 'var(--loss)' };
            const tagStyle = itemUp
              ? { bottom: `calc(50% + ${height + 24}px)` }
              : { top: `calc(50% + ${height + 24}px)` };
            return (
              <div key={item.id} className="relative min-w-0 flex-1">
                <div className="absolute inset-x-[24%] rounded-t-sm" style={barStyle} />
                <span className="absolute inset-x-0 text-center text-[11px] font-bold leading-tight" style={{ ...tagStyle, color: itemUp ? 'var(--profit)' : 'var(--loss)' }}>
                  {item.symbol}<br />
                  <span className="font-semibold tabular-nums">{signed(item.pnlPercent * 100, 1)}%</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 市场分布：克制的横向条 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">市场分布</h3>
        {model.byMarket.map((entry) => (
          <div key={entry.market} className="flex items-center gap-3">
            <span className="w-12 text-sm text-foreground-muted">{MARKET_LABEL[entry.market] || entry.market}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/60">
              <div className="h-full rounded-full" style={{ width: `${(entry.value / model.totalValue) * 100}%`, background: 'linear-gradient(90deg, #7665ff, #39d8ff)' }} />
            </div>
            <span className="w-24 text-right text-sm tabular-nums">{formatMoney(entry.value)}</span>
          </div>
        ))}
      </section>

      {/* 持仓明细 */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">持仓明细</h3>
        <Table hoverableRows>
          <TableHeader>
            <TableRow>
              <TableHead>代码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>市场</TableHead>
              <TableHead className="text-right">市值</TableHead>
              <TableHead className="text-right">成本</TableHead>
              <TableHead className="text-right">盈亏</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.enriched.map((item) => {
              const itemUp = item.pnl >= 0;
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.symbol}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-foreground-muted">{MARKET_LABEL[item.market] || item.market}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.value)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground-muted">{formatMoney(item.cost)}</TableCell>
                  <TableCell className="text-right tabular-nums" style={{ color: itemUp ? 'var(--profit)' : 'var(--loss)' }}>{signed(item.pnl)}（{signed(item.pnlPercent * 100, 1)}%）</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

export { StockStatsPage };
