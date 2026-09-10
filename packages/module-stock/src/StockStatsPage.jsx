import { useEffect, useMemo, useState } from 'react';
import { api, Empty, NumberRoller } from '@personal-workbench/core';

function formatMoney(value) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function signed(value, fractionDigits = 2) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(Math.abs(value))}`;
}

function AnimatedSigned({ value, fractionDigits = 2, suffix = '' }) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return <NumberRoller value={Math.abs(value)} format={(number) => `${sign}${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(number)}${suffix}`} />;
}

function StockStatsPage({ positions: externalPositions, loading: externalLoading } = {}) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const positionsForView = externalPositions ?? positions;
  const loadingForView = externalLoading ?? loading;
  useEffect(() => {
    if (externalPositions !== undefined) return;
    const load = async () => {
      try {
        const settings = await api('/finnhub-settings');
        if (settings.configured) await api('/stock-positions/refresh-prices', { method: 'POST', body: '{}' });
        const data = await api('/stock-positions');
        setPositions(data.positions);
      } catch {
        const data = await api('/stock-positions').catch(() => ({ positions: [] }));
        setPositions(data.positions);
      } finally { setLoading(false); }
    };
    load();
  }, [externalPositions]);

  const model = useMemo(() => {
    const enriched = positionsForView.map((item) => {
      const cost = item.quantity * item.costPrice;
      const value = item.quantity * item.currentPrice;
      const pnl = value - cost;
      return { ...item, cost, value, pnl, pnlPercent: cost > 0 ? pnl / cost : 0 };
    });
    const totalCost = enriched.reduce((sum, item) => sum + item.cost, 0);
    const totalValue = enriched.reduce((sum, item) => sum + item.value, 0);
    const totalPnl = totalValue - totalCost;
    const sorted = [...enriched].sort((a, b) => b.pnlPercent - a.pnlPercent);
    return { totalCost, totalValue, totalPnl, pnlPercent: totalCost > 0 ? totalPnl / totalCost : 0, sorted };
  }, [positionsForView]);

  if (loadingForView) return <p className="text-foreground-muted">正在加载统计…</p>;
  if (!positionsForView.length) {
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
          <span className="text-[46px] font-bold leading-none tracking-tight tabular-nums" style={{ color: accent }}><AnimatedSigned value={model.totalPnl} /></span>
          <span className="text-[20px] font-semibold tabular-nums" style={{ color: accent }}><AnimatedSigned value={model.pnlPercent * 100} suffix="%" /></span>
        </div>
        <p className="text-sm text-foreground-muted tabular-nums">
          成本 <NumberRoller value={model.totalCost} format={formatMoney} /> · 市值 <NumberRoller value={model.totalValue} format={formatMoney} /> · 持仓 <NumberRoller value={positionsForView.length} />
        </p>
      </header>

      {/* 盈亏光谱：成本基线，线上盈利、线下亏损 */}
      <section className="rounded-xl border border-border px-4 pb-5 pt-4">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-semibold">持仓盈亏光谱</h3>
          <span className="text-[11px] text-foreground-muted">按盈亏幅度排序 · 线上盈利，线下亏损</span>
        </div>
        <div className="relative" style={{ height: '14rem', overflowX: 'auto' }}>
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
          <span className="absolute right-0 top-1/2 z-10 -translate-y-1/2 bg-background pl-1 text-[10px] text-foreground-muted">0%</span>
          <div className="relative flex" style={{ height: '14rem', minWidth: `${Math.max(model.sorted.length * 5, 20)}rem` }}>
            {model.sorted.map((item) => {
              const itemUp = item.pnl >= 0;
              const height = Math.max(8, Math.min(Math.abs(item.pnlPercent) * 240, 88));
              const barStyle = itemUp
                ? { left: '24%', right: '24%', bottom: '50%', height: `${height}px`, background: 'var(--profit)' }
                : { left: '24%', right: '24%', top: '50%', height: `${height}px`, background: 'var(--loss)' };
              const tagStyle = itemUp
                ? { bottom: `calc(50% + ${height + 24}px)` }
                : { top: `calc(50% + ${height + 24}px)` };
              return (
                <div key={item.id} className="relative min-w-0 flex-1">
                  <div className="absolute" style={{ ...barStyle, borderTopLeftRadius: 'var(--radius-sm)', borderTopRightRadius: 'var(--radius-sm)' }} />
                  <span className="absolute inset-x-0 text-center text-[11px] font-bold leading-tight" style={{ ...tagStyle, color: itemUp ? 'var(--profit)' : 'var(--loss)' }}>
                    {item.symbol}<br />
                    <span className="font-semibold tabular-nums"><AnimatedSigned value={item.pnlPercent * 100} fractionDigits={1} suffix="%" /></span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

    </div>
  );
}

export { StockStatsPage };
