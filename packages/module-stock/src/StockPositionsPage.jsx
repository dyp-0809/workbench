import { useEffect, useMemo, useState } from 'react';
import { Button } from '@appica/ui-react/button';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { NumberField } from '@appica/ui-react/number-field';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@appica/ui-react/table';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Badge } from '@appica/ui-react/badge';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogClose } from '@appica/ui-react/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';
import { Plus, SortAscending, SortDescending } from '@appica/icons-react';
import { api, SectionCard, Empty, LoadingButton, Chart, donutOption, NumberRoller } from '@personal-workbench/core';
import { StockStatsPage } from './StockStatsPage.jsx';

const MARKET_LABEL = { US: '美股', HK: '港股', CN: 'A 股' };
const MARKET_CURRENCY = { US: '$', HK: 'HK$', CN: '¥' };
const EMPTY_INPUT = { symbol: '', name: '', market: 'US', quantity: 1, costPrice: 0, targetPercent: null, notes: '' };

function formatMoney(value, market = 'US') {
  const amount = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return `${MARKET_CURRENCY[market] || '$'}${amount}`;
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function AnimatedMoney({ value, market = 'US' }) {
  const currency = MARKET_CURRENCY[market] || '$';
  return <><span>{value < 0 ? '-' : ''}{currency}</span><NumberRoller value={Math.abs(value)} format={(number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)} /></>;
}

function AnimatedPercent({ value, fractionDigits = 2 }) {
  return <NumberRoller value={Math.abs(value)} format={(number) => `${value < 0 ? '-' : ''}${number.toFixed(fractionDigits)}%`} />;
}

function SortButton({ sort, sortKey, label, onClick }) {
  const active = sort?.key === sortKey;
  const direction = active ? sort.direction : 'desc';
  const directionLabel = direction === 'asc' ? '升序' : '降序';
  return (
    <Button size="sm" variant="ghost" className="h-6 px-1" onClick={onClick} aria-label={`${label}${directionLabel}`} title={`${label}${directionLabel}`}>
      {direction === 'asc' ? <SortAscending /> : <SortDescending />}
    </Button>
  );
}

function StockPositionForm({ value, onChange, symbols, symbolListId, allowCurrentPrice = false }) {
  const updateSymbol = (event) => {
    const symbol = event.target.value.toUpperCase();
    const selected = symbols.find((item) => item.symbol === symbol);
    onChange({ ...value, symbol, ...(selected ? { name: selected.name, market: selected.market } : {}) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel><span className="text-error">*</span> 代码</FieldLabel>
          <Input required list={symbolListId} value={value.symbol} onChange={updateSymbol} placeholder="输入或选择代码，如 AAPL" />
          <datalist id={symbolListId}>
            {symbols.map((item) => <option key={item.symbol} value={item.symbol} label={`${item.name} · ${MARKET_LABEL[item.market] || item.market}`} />)}
          </datalist>
          <p className="text-xs text-foreground-muted">内置美股七姐妹；保存新代码后会自动加入此列表。</p>
        </Field>
        <Field>
          <FieldLabel><span className="text-error">*</span> 名称</FieldLabel>
          <Input required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="如 苹果" />
        </Field>
      </div>
      <Field>
        <FieldLabel><span className="text-error">*</span> 市场</FieldLabel>
        <Select items={MARKET_LABEL} value={value.market} onValueChange={(market) => onChange({ ...value, market })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="US">美股</SelectItem>
            <SelectItem value="HK">港股</SelectItem>
            <SelectItem value="CN">A 股</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className={`grid gap-3 ${allowCurrentPrice ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Field>
          <FieldLabel><span className="text-error">*</span> 数量</FieldLabel>
          <NumberField min={1} value={value.quantity} onValueChange={(quantity) => onChange({ ...value, quantity: quantity ?? 1 })} />
        </Field>
        <Field>
          <FieldLabel><span className="text-error">*</span> 成本价（{MARKET_CURRENCY[value.market] || '$'}）</FieldLabel>
          <NumberField min={0} step={0.01} value={value.costPrice} onValueChange={(costPrice) => onChange({ ...value, costPrice: costPrice ?? 0 })} />
        </Field>
        {allowCurrentPrice && (
          <Field>
            <FieldLabel><span className="text-error">*</span> 现价（{MARKET_CURRENCY[value.market] || '$'}）</FieldLabel>
            <NumberField min={0} step={0.01} value={value.currentPrice} onValueChange={(currentPrice) => onChange({ ...value, currentPrice: currentPrice ?? 0 })} />
          </Field>
        )}
      </div>
      {!allowCurrentPrice && <p className="text-xs text-foreground-muted">美股保存时将通过 Finnhub 自动获取现价；港股与 A 股可在保存后通过“编辑持仓”手动维护现价。</p>}
      <Field>
        <FieldLabel>目标仓位（%）</FieldLabel>
        <NumberField min={0} max={100} step={0.1} value={value.targetPercent ?? undefined} onValueChange={(targetPercent) => onChange({ ...value, targetPercent: targetPercent ?? null })} />
      </Field>
      <Field>
        <FieldLabel>备注</FieldLabel>
        <Textarea rows={2} value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="补充说明（可选）" />
      </Field>
    </div>
  );
}

function StockPositionsPage() {
  const [positions, setPositions] = useState([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [assetsInput, setAssetsInput] = useState('0');
  const [stockSymbols, setStockSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAssets, setSavingAssets] = useState(false);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [priceRefreshMessage, setPriceRefreshMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [input, setInput] = useState(EMPTY_INPUT);
  const [editingInput, setEditingInput] = useState(EMPTY_INPUT);
  const [positionSort, setPositionSort] = useState(null);
  const [valuationFilter, setValuationFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [posData, settingsData, symbolsData] = await Promise.all([api('/stock-positions'), api('/stock-settings'), api('/stock-symbols')]);
      setPositions(posData.positions);
      setTotalAssets(settingsData.settings.totalAssets);
      setAssetsInput(String(settingsData.settings.totalAssets));
      setStockSymbols(symbolsData.symbols);
    } finally { setLoading(false); }
  };
  useEffect(() => { load().catch(() => { setPositions([]); setTotalAssets(0); setAssetsInput('0'); setStockSymbols([]); }); }, []);

  const totalMarketValue = useMemo(() => positions.reduce((sum, item) => sum + item.quantity * item.currentPrice, 0), [positions]);
  const cash = totalAssets - totalMarketValue;
  const investedPercent = totalAssets > 0 ? Math.min(100, (totalMarketValue / totalAssets) * 100) : 0;
  const cashPercent = 100 - investedPercent;
  const allocationData = useMemo(() => [
    { name: '持仓', value: Math.round(totalMarketValue), percent: investedPercent },
    { name: '现金', value: Math.max(Math.round(cash), 0), percent: cashPercent }
  ], [totalMarketValue, cash, investedPercent, cashPercent]);
  const chartOption = useMemo(() => donutOption(allocationData, ['#16a34a', '#7665ff'], {
    legendFormatter: (item) => `${item.name} ${formatMoney(item.value)} (${formatPercent(item.percent)})`
  }), [allocationData]);
  const togglePositionSort = (key) => {
    setPositionSort((current) => current?.key === key
      ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
      : { key, direction: 'desc' });
  };
  const filteredPositions = useMemo(() => positions.filter((item) => {
    if (valuationFilter === 'has-pe') return item.trailingPE !== null || item.forwardPE !== null;
    if (valuationFilter === 'no-pe') return item.trailingPE === null && item.forwardPE === null;
    return true;
  }), [positions, valuationFilter]);
  const sortedPositions = useMemo(() => {
    if (!positionSort) return filteredPositions;
    const getValue = (item) => {
      const marketValue = item.quantity * item.currentPrice;
      if (positionSort.key === 'current') return totalAssets > 0 ? (marketValue / totalAssets) * 100 : null;
      if (positionSort.key === 'target') return item.targetPercent ?? null;
      if (positionSort.key === 'trailingPE') return item.trailingPE ?? null;
      if (positionSort.key === 'forwardPE') return item.forwardPE ?? null;
      const cost = item.quantity * item.costPrice;
      return cost > 0 ? ((marketValue - cost) / cost) * 100 : 0;
    };
    return [...filteredPositions].sort((left, right) => {
      const leftValue = getValue(left);
      const rightValue = getValue(right);
      if (leftValue === null && rightValue === null) return 0;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const difference = leftValue - rightValue;
      return positionSort.direction === 'desc' ? -difference : difference;
    });
  }, [filteredPositions, positionSort, totalAssets]);

  const save = async () => { setSaving(true); try { await api('/stock-positions', { method: 'POST', body: JSON.stringify(input) }); setInput(EMPTY_INPUT); setCreateOpen(false); await load(); } finally { setSaving(false); } };
  const saveAssets = async () => { setSavingAssets(true); try { const result = await api('/stock-settings', { method: 'PUT', body: JSON.stringify({ totalAssets: Number(assetsInput) }) }); setTotalAssets(result.settings.totalAssets); setAssetsInput(String(result.settings.totalAssets)); } finally { setSavingAssets(false); } };
  const updateAssetsInput = (event) => {
    const value = event.target.value;
    if (value === '' || /^\d+(?:\.\d{0,2})?$/.test(value)) setAssetsInput(value);
  };
  const openEdit = (item) => { setEditingInput({ symbol: item.symbol, name: item.name, market: item.market, quantity: item.quantity, costPrice: item.costPrice, currentPrice: item.currentPrice, targetPercent: item.targetPercent, notes: item.notes || '' }); setEditingItem(item); };
  const saveEdit = async () => { setEditing(true); try { await api(`/stock-positions/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(editingInput) }); setEditingItem(null); await load(); } finally { setEditing(false); } };
  const remove = async (id) => { await api(`/stock-positions/${id}`, { method: 'DELETE' }); await load(); };
  const refreshPrices = async ({ automatic = false } = {}) => {
    setPriceRefreshing(true); if (!automatic) setPriceRefreshMessage('');
    try {
      const result = await api('/stock-positions/refresh-prices', { method: 'POST', body: '{}' });
      await load();
      const skipped = result.skipped.length ? `；${result.skipped.length} 笔非美股持仓未刷新` : '';
      if (!automatic) setPriceRefreshMessage(`已刷新 ${result.updated.length} 笔美股现价${skipped}。`);
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    } finally { setPriceRefreshing(false); }
  };

  useEffect(() => {
    api('/finnhub-settings')
      .then((settings) => settings.configured ? refreshPrices({ automatic: true }) : null)
      .catch(() => null);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="总盈亏">
        <StockStatsPage positions={positions} loading={loading} />
      </SectionCard>
      <SectionCard title="总资产">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'nowrap' }}>
          <div style={{ flex: '0 0 calc(50% - 12px)', minWidth: 280 }}>
            <Chart option={chartOption} height={220} />
          </div>
          <div className="flex min-w-0 flex-col items-start gap-4" style={{ flex: '0 0 calc(50% - 12px)' }}>
            <div className="flex flex-col items-start gap-2">
              <Field style={{ width: 260 }}>
                <FieldLabel>总资产金额（$ / USD）</FieldLabel>
                <Input aria-describedby="total-assets-help" inputMode="decimal" value={assetsInput} onChange={updateAssetsInput} placeholder="请输入总资产金额" />
              </Field>
              <div className="mt-1 flex flex-col items-start gap-1.5 text-sm">
                <span className="inline-flex items-baseline gap-2"><span className="text-foreground-muted">持仓</span><strong className="tabular-nums" style={{ color: 'var(--profit)' }}><AnimatedMoney value={totalMarketValue} /> <span className="font-normal text-foreground-muted">(<AnimatedPercent value={investedPercent} />)</span></strong></span>
                <span className="inline-flex items-baseline gap-2"><span className="text-foreground-muted">现金</span><strong className="tabular-nums" style={{ color: cash < 0 ? 'var(--loss)' : 'inherit' }}><AnimatedMoney value={cash} /> <span className="font-normal text-foreground-muted">(<AnimatedPercent value={cashPercent} />)</span></strong></span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <LoadingButton loading={savingAssets} disabled={!assetsInput} onClick={saveAssets}>保存总资产</LoadingButton>
              <p id="total-assets-help" className="text-xs text-foreground-muted">仅可输入数字，最多保留两位小数。</p>
            </div>
            {totalAssets <= 0 && <p className="text-xs text-foreground-muted">设置总资产后，才能计算每笔现有仓位与现金占比。</p>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="仓位管理">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <Button onClick={() => { setInput(EMPTY_INPUT); setCreateOpen(true); }}><Plus data-icon="start" />新增持仓</Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select value={valuationFilter} onValueChange={setValuationFilter}>
              <SelectTrigger size="sm" aria-label="市盈率筛选"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">估值：全部</SelectItem><SelectItem value="has-pe">估值：已有数据</SelectItem><SelectItem value="no-pe">估值：暂无数据</SelectItem></SelectContent>
            </Select>
            <LoadingButton variant="outline" loading={priceRefreshing} disabled={!positions.some((item) => item.market === 'US')} onClick={refreshPrices}>刷新美股现价</LoadingButton>
            <p className="text-sm text-foreground-muted">需先在设置 → 行情数据中配置 Finnhub API Key；港股与 A 股暂保留手动现价。</p>
          </div>
        </div>
        {priceRefreshMessage && <p className="mb-3 text-sm text-success-emphasis">{priceRefreshMessage}</p>}
        {loading ? <p className="text-foreground-muted">正在加载持仓…</p> : positions.length ? (
          <div style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
            <Table hoverableRows style={{ marginInline: 'auto' }}>
            <TableHeader>
              <TableRow>
                <TableHead>代码</TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center gap-1">盈亏 <SortButton sort={positionSort} sortKey="pnl" label="盈亏" onClick={() => togglePositionSort('pnl')} /></span></TableHead>
                <TableHead className="text-right">市值 / 成本</TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center gap-1">市盈率 <SortButton sort={positionSort} sortKey="trailingPE" label="市盈率" onClick={() => togglePositionSort('trailingPE')} /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center gap-1">前瞻市盈率 <SortButton sort={positionSort} sortKey="forwardPE" label="前瞻市盈率" onClick={() => togglePositionSort('forwardPE')} /></span></TableHead>
                <TableHead className="text-right">总市值 / 总成本</TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center gap-1">现有仓位 <SortButton sort={positionSort} sortKey="current" label="现有仓位" onClick={() => togglePositionSort('current')} /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center gap-1">目标仓位 <SortButton sort={positionSort} sortKey="target" label="目标仓位" onClick={() => togglePositionSort('target')} /></span></TableHead>
                <TableHead className="w-[7rem] whitespace-nowrap text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPositions.map((item) => {
                const marketValue = item.quantity * item.currentPrice;
                const cost = item.quantity * item.costPrice;
                const pnl = marketValue - cost;
                const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;
                const currentPercent = totalAssets > 0 ? (marketValue / totalAssets) * 100 : null;
                const positive = pnl >= 0;
                const forwardPEColor = item.forwardPE === null || item.forwardPE === undefined ? undefined : item.forwardPE >= 30 ? 'var(--loss)' : 'var(--profit)';
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{item.symbol}</span><Badge variant="outline" size="sm">{MARKET_LABEL[item.market] || item.market}</Badge></div>
                      {item.name && <div className="text-xs text-foreground-muted">{item.name}</div>}
                      <div className="text-xs font-semibold tabular-nums text-foreground-intense"><NumberRoller value={item.quantity} /> 股</div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums" style={{ color: positive ? 'var(--profit)' : 'var(--loss)' }}><AnimatedPercent value={pnlPercent} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-medium"><AnimatedMoney value={item.currentPrice} market={item.market} /></div>
                      <div className="text-xs text-foreground-muted"><AnimatedMoney value={item.costPrice} market={item.market} /></div>
                      {item.priceUpdatedAt && <div className="text-xs text-foreground-muted">现价更新于 {new Date(item.priceUpdatedAt).toLocaleString('zh-CN', { hour12: false })}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.trailingPE === null || item.trailingPE === undefined ? '—' : `${Number(item.trailingPE).toFixed(2)}x`}</TableCell>
                    <TableCell className="text-right tabular-nums" style={{ color: forwardPEColor }} title={item.valuationError || ''}>{item.forwardPE === null || item.forwardPE === undefined ? '—' : `${Number(item.forwardPE).toFixed(2)}x`}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-medium"><AnimatedMoney value={marketValue} market={item.market} /></div>
                      <div className="text-xs text-foreground-muted"><AnimatedMoney value={cost} market={item.market} /></div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{currentPercent === null ? '—' : <AnimatedPercent value={currentPercent} />}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.targetPercent === null || item.targetPercent === undefined ? '—' : <AnimatedPercent value={item.targetPercent} fractionDigits={1} />}</TableCell>
                    <TableCell className="w-[7rem] whitespace-nowrap text-center">
                      <div className="flex justify-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(item)}>编辑</Button>
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button size="sm" variant="destructive">删除</Button>} />
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>删除这笔持仓？</AlertDialogTitle></AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogClose render={<Button variant="soft">取消</Button>} />
                              <AlertDialogClose render={<Button variant="destructive" onClick={() => remove(item.id)}>删除</Button>} />
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        ) : <Empty description="暂无持仓，点击「新增持仓」添加第一笔" />}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:w-110">
            <DialogHeader>
              <DialogTitle>新增持仓</DialogTitle>
              <DialogDescription>录入持仓数量与成本价；美股保存时会自动获取 Finnhub 现价。</DialogDescription>
            </DialogHeader>
            <DialogBody><StockPositionForm value={input} onChange={setInput} symbols={stockSymbols} symbolListId="create-stock-symbols" /></DialogBody>
            <DialogFooter>
              <DialogClose render={<Button variant="soft">取消</Button>} />
              <LoadingButton loading={saving} disabled={!input.symbol.trim() || !input.name.trim()} onClick={save}>保存</LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editingItem !== null} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
          <DialogContent className="sm:w-110">
            <DialogHeader>
              <DialogTitle>编辑持仓</DialogTitle>
              <DialogDescription>修改代码、数量、成本价、现价或目标仓位。</DialogDescription>
            </DialogHeader>
            <DialogBody><StockPositionForm value={editingInput} onChange={setEditingInput} symbols={stockSymbols} symbolListId="edit-stock-symbols" allowCurrentPrice /></DialogBody>
            <DialogFooter>
              <DialogClose render={<Button variant="soft">取消</Button>} />
              <LoadingButton loading={editing} disabled={!editingInput.symbol.trim() || !editingInput.name.trim()} onClick={saveEdit}>保存</LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SectionCard>
    </div>
  );
}

export { StockPositionsPage };
