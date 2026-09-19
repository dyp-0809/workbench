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

function StockStatsPage({ positions: externalPositions, soldPositions: externalSoldPositions, loading: externalLoading } = {}) {
  const [positions, setPositions] = useState([]);
  const [soldPositions, setSoldPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const positionsForView = externalPositions ?? positions;
  const soldPositionsForView = externalSoldPositions ?? soldPositions;
  const loadingForView = externalLoading ?? loading;
  useEffect(() => {
    if (externalPositions !== undefined) return;
    const load = async () => {
      try {
        const settings = await api('/finnhub-settings');
        if (settings.configured) await api('/stock-positions/refresh-prices', { method: 'POST', body: '{}' });
        const [positionData, soldData] = await Promise.all([api('/stock-positions'), api('/stock-sold-positions')]);
        setPositions(positionData.positions);
        setSoldPositions(soldData.soldPositions);
      } catch {
        const [positionData, soldData] = await Promise.all([
          api('/stock-positions').catch(() => ({ positions: [] })),
          api('/stock-sold-positions').catch(() => ({ soldPositions: [] }))
        ]);
        setPositions(positionData.positions);
        setSoldPositions(soldData.soldPositions);
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
    const activePnl = totalValue - totalCost;
    const soldCost = soldPositionsForView.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
    const realizedPnl = soldPositionsForView.reduce((sum, item) => sum + item.realizedPnl, 0);
    const totalPnlIncludingSold = activePnl + realizedPnl;
    const totalCostIncludingSold = totalCost + soldCost;
    const sorted = [...enriched].sort((a, b) => b.pnlPercent - a.pnlPercent);
    return {
      totalCost,
      totalValue,
      activePnl,
      activePnlPercent: totalCost > 0 ? activePnl / totalCost : 0,
      soldCost,
      realizedPnl,
      totalPnlIncludingSold,
      totalPnlIncludingSoldPercent: totalCostIncludingSold > 0 ? totalPnlIncludingSold / totalCostIncludingSold : 0,
      sorted
    };
  }, [positionsForView, soldPositionsForView]);

  if (loadingForView) return <p className="text-foreground-muted">正在加载统计…</p>;
  if (!positionsForView.length && !soldPositionsForView.length) {
    return (
      <div className="py-16">
        <Empty description="还没有持仓或卖出记录。先在「仓位管理」添加第一笔。" />
      </div>
    );
  }

  const activeUp = model.activePnl >= 0;
  const totalUp = model.totalPnlIncludingSold >= 0;
  const activeAccent = activeUp ? 'var(--profit)' : 'var(--loss)';
  const totalAccent = totalUp ? 'var(--profit)' : 'var(--loss)';

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-8">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">持仓总盈亏</h3>
            <div className="mt-3 flex items-baseline gap-4">
              <span className="text-[46px] font-bold leading-none tracking-tight tabular-nums" style={{ color: activeAccent }}><AnimatedSigned value={model.activePnl} /></span>
              <span className="text-[20px] font-semibold tabular-nums" style={{ color: activeAccent }}><AnimatedSigned value={model.activePnlPercent * 100} suffix="%" /></span>
            </div>
            <p className="mt-3 text-sm text-foreground-muted tabular-nums">
              成本 <NumberRoller value={model.totalCost} format={formatMoney} /> · 市值 <NumberRoller value={model.totalValue} format={formatMoney} /> · 持仓 <NumberRoller value={positionsForView.length} />
            </p>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">总盈亏（包含卖出的）</h3>
            <div className="mt-3 flex items-baseline gap-4">
              <span className="text-[46px] font-bold leading-none tracking-tight tabular-nums" style={{ color: totalAccent }}><AnimatedSigned value={model.totalPnlIncludingSold} /></span>
              <span className="text-[20px] font-semibold tabular-nums" style={{ color: totalAccent }}><AnimatedSigned value={model.totalPnlIncludingSoldPercent * 100} suffix="%" /></span>
            </div>
            <p className="mt-3 text-sm text-foreground-muted tabular-nums">
              持仓浮盈 <AnimatedSigned value={model.activePnl} /> · 已实现 <AnimatedSigned value={model.realizedPnl} /> · 卖出成本 <NumberRoller value={model.soldCost} format={formatMoney} />
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-border px-4 pb-5 pt-4">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-semibold">持仓盈亏光谱</h3>
          <span className="text-[11px] text-foreground-muted">按盈亏幅度排序 · 线上盈利，线下亏损</span>
        </div>
        {model.sorted.length ? (
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
        ) : <p className="py-12 text-center text-sm text-foreground-muted">暂无未平仓持仓盈亏数据。</p>}
      </section>
    </div>
  );
}

export { StockStatsPage };
