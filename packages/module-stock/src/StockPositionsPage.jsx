import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@appica/ui-react/button';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { NumberField } from '@appica/ui-react/number-field';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@appica/ui-react/table';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Badge } from '@appica/ui-react/badge';
import { Card } from '@appica/ui-react/card';
import { Tabs, TabsList, TabsTrigger } from '@appica/ui-react/tabs';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogClose } from '@appica/ui-react/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';
import { Plus, SortAscending, SortDescending } from '@appica/icons-react';
import { api, SectionCard, Empty, LoadingButton, Chart, donutOption, NumberRoller } from '@personal-workbench/core';
import { StockStatsPage } from './StockStatsPage.jsx';

const MARKET_LABEL = { US: '美股', HK: '港股', CN: 'A 股', CRYPTO: '加密货币' };
const MARKET_CURRENCY = { US: '$', HK: 'HK$', CN: '¥', CRYPTO: '$' };
const EMPTY_INPUT = { symbol: '', name: '', market: 'US', assetType: 'stock', quantity: 1, costPrice: 0, targetPercent: null, notes: '' };
const EMPTY_SELL_INPUT = { quantity: 1, sellPrice: 0, notes: '' };
const EMPTY_DEPOSIT_INPUT = { amount: 0, notes: '' };
const VALUATION_FILTER_LABEL = { all: '全部', 'has-pe': '已有数据', 'no-pe': '暂无数据' };
const TARGET_FILTER_LABEL = { all: '全部', tracked: '已设定', overweight: '高于计划', underweight: '低于计划' };

function formatMoney(value, market = 'US') {
  const amount = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return `${MARKET_CURRENCY[market] || '$'}${amount}`;
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function premiumRate(item) {
  return item.market === 'CN' && item.iopv > 0 ? (item.currentPrice / item.iopv) - 1 : null;
}

function AnimatedMoney({ value, market = 'US' }) {
  const currency = MARKET_CURRENCY[market] || '$';
  return <><span>{value < 0 ? '-' : ''}{currency}</span><NumberRoller value={Math.abs(value)} format={(number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)} /></>;
}

function AnimatedPercent({ value, fractionDigits = 2 }) {
  return <NumberRoller value={Math.abs(value)} format={(number) => `${value < 0 ? '-' : ''}${number.toFixed(fractionDigits)}%`} />;
}
function AssetMetric({ label, children, detail, color, valueClassName = 'text-lg' }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <div className={`mt-1 font-semibold leading-tight tabular-nums ${valueClassName}`} style={color ? { color } : undefined}>{children}</div>
      {detail && <p className="mt-1 text-xs text-foreground-muted tabular-nums">{detail}</p>}
    </div>
  );
}
function AllocationDeviation({ item, currentPercent }) {
  const targetPercent = item.targetPercent ?? 0;
  const difference = currentPercent - targetPercent;
  const isOverweight = difference >= 0;
  const maxPercent = Math.max(currentPercent, targetPercent, 1);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold">{item.symbol}</span>
          <span className="shrink-0 text-xs font-medium tabular-nums" style={{ color: isOverweight ? 'var(--loss)' : 'var(--profit)' }}>
            {isOverweight ? '高于' : '低于'}目标 {Math.abs(difference).toFixed(1)} 个百分点
          </span>
        </div>
        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${item.symbol} 当前仓位 ${formatPercent(currentPercent)}，目标仓位 ${formatPercent(targetPercent)}`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${(currentPercent / maxPercent) * 100}%` }} />
          <span className="absolute inset-y-0 w-px bg-foreground" style={{ left: `${(targetPercent / maxPercent) * 100}%` }} aria-hidden="true" />
        </div>
      </div>
      <div className="text-right text-xs leading-5 tabular-nums">
        <p className="font-semibold text-foreground-intense">当前 {formatPercent(currentPercent)}</p>
        <p className="text-foreground-muted">目标 {formatPercent(targetPercent)}</p>
      </div>
    </div>
  );
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
  const isCrypto = value.assetType === 'crypto';
  const updateSymbol = (event) => {
    const symbol = event.target.value.toUpperCase();
    const selected = isCrypto ? null : symbols.find((item) => item.symbol === symbol);
    onChange({ ...value, symbol, ...(selected ? { name: selected.name, market: selected.market } : {}) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel><span className="text-error">*</span> 代码</FieldLabel>
          <Input required name="stock-symbol" autoComplete="off" spellCheck={false} list={isCrypto ? undefined : symbolListId} value={value.symbol} onChange={updateSymbol} placeholder={isCrypto ? '输入币种代码，如 BTC…' : '输入或选择代码，如 AAPL…'} />
          {!isCrypto && <><datalist id={symbolListId}>
            {symbols.map((item) => <option key={item.symbol} value={item.symbol} label={`${item.name} · ${MARKET_LABEL[item.market] || item.market}`} />)}
          </datalist>
          <p className="text-xs text-foreground-muted">内置美股七姐妹；保存新代码后会自动加入此列表。</p></>}
          {isCrypto && <p className="text-xs text-foreground-muted">按 USDT 交易对从 Binance 获取现价，例如 BTC、ETH。</p>}
        </Field>
        <Field>
          <FieldLabel><span className="text-error">*</span> 名称</FieldLabel>
          <Input required name="stock-name" autoComplete="off" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="如 苹果…" />
        </Field>
      </div>
      {!isCrypto && <Field>
        <FieldLabel><span className="text-error">*</span> 市场</FieldLabel>
        <Select items={MARKET_LABEL} value={value.market} onValueChange={(market) => onChange({ ...value, market })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="US">美股</SelectItem>
            <SelectItem value="HK">港股</SelectItem>
            <SelectItem value="CN">A 股</SelectItem>
          </SelectContent>
        </Select>
      </Field>}
      <div className={`grid gap-3 ${allowCurrentPrice ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Field>
          <FieldLabel><span className="text-error">*</span> {isCrypto ? '持有数量' : '数量'}</FieldLabel>
          <NumberField min={isCrypto ? 0.00000001 : 1} step={isCrypto ? 0.00000001 : 1} value={value.quantity} onValueChange={(quantity) => onChange({ ...value, quantity: quantity ?? (isCrypto ? 0.00000001 : 1) })} />
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
      {!allowCurrentPrice && <p className="text-xs text-foreground-muted">{isCrypto ? '保存时按 USDT 交易对从 Binance 自动获取现价。' : '美股保存时通过 Finnhub、A 股保存时通过东方财富自动获取现价；港股可在保存后手动维护现价。'}</p>}
      <Field>
        <FieldLabel>目标仓位（%）</FieldLabel>
        <NumberField min={0} max={100} step={0.1} value={value.targetPercent ?? undefined} onValueChange={(targetPercent) => onChange({ ...value, targetPercent: targetPercent ?? null })} />
      </Field>
      <Field>
        <FieldLabel>备注</FieldLabel>
        <Textarea name="stock-notes" autoComplete="off" rows={2} value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="补充说明（可选）…" />
      </Field>
    </div>
  );
}

function StockPositionsPage() {
  const [positions, setPositions] = useState([]);
  const [soldPositions, setSoldPositions] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [cnTotalAssets, setCnTotalAssets] = useState(0);
  const [cryptoTotalAssets, setCryptoTotalAssets] = useState(0);
  const [assetsInput, setAssetsInput] = useState('0');
  const [market, setMarket] = useState('US');
  const [stockSymbols, setStockSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAssets, setSavingAssets] = useState(false);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [priceRefreshMessage, setPriceRefreshMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositInput, setDepositInput] = useState(EMPTY_DEPOSIT_INPUT);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [sellingItem, setSellingItem] = useState(null);
  const [input, setInput] = useState(EMPTY_INPUT);
  const [editingInput, setEditingInput] = useState(EMPTY_INPUT);
  const [sellingInput, setSellingInput] = useState(EMPTY_SELL_INPUT);
  const [positionSort, setPositionSort] = useState(null);
  const [valuationFilter, setValuationFilter] = useState('all');
  const [targetFilter, setTargetFilter] = useState('all');
  const [detailItem, setDetailItem] = useState(null);
  const [overviewPanel, setOverviewPanel] = useState(null);
  const reduceMotion = useReducedMotion();

  const load = async () => {
    setLoading(true);
    try {
      const [posData, soldData, depositsData, settingsData, symbolsData] = await Promise.all([api('/stock-positions'), api('/stock-sold-positions'), api('/stock-deposits'), api('/stock-settings'), api('/stock-symbols')]);
      setPositions(posData.positions);
      setSoldPositions(soldData.soldPositions);
      setDeposits(depositsData.deposits);
      setTotalAssets(settingsData.settings.totalAssets);
      setCnTotalAssets(settingsData.settings.cnTotalAssets);
      setCryptoTotalAssets(settingsData.settings.cryptoTotalAssets);
      setAssetsInput(String(market === 'CN' ? settingsData.settings.cnTotalAssets : market === 'CRYPTO' ? settingsData.settings.cryptoTotalAssets : settingsData.settings.totalAssets));
      setStockSymbols(symbolsData.symbols);
    } finally { setLoading(false); }
  };
  useEffect(() => { load().catch(() => { setPositions([]); setSoldPositions([]); setDeposits([]); setTotalAssets(0); setCnTotalAssets(0); setCryptoTotalAssets(0); setAssetsInput('0'); setStockSymbols([]); }); }, []);
  useEffect(() => { setAssetsInput(String(market === 'CN' ? cnTotalAssets : market === 'CRYPTO' ? cryptoTotalAssets : totalAssets)); }, [market, totalAssets, cnTotalAssets, cryptoTotalAssets]);

  const marketPositions = useMemo(() => positions.filter((item) => market === 'CRYPTO' ? item.assetType === 'crypto' : item.market === market && item.assetType !== 'crypto'), [positions, market]);
  const marketSoldPositions = useMemo(() => soldPositions.filter((item) => market === 'CRYPTO' ? item.assetType === 'crypto' : item.market === market && item.assetType !== 'crypto'), [soldPositions, market]);
  const marketDeposits = useMemo(() => deposits.filter((deposit) => deposit.market === market), [deposits, market]);
  const marketTotalAssets = market === 'CN' ? cnTotalAssets : market === 'CRYPTO' ? cryptoTotalAssets : totalAssets;
  const totalDeposits = marketDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
  const capitalBase = marketTotalAssets + totalDeposits;
  const marketName = MARKET_LABEL[market];
  const portfolioAssets = useMemo(() => {
    const totalMarketValue = marketPositions.reduce((sum, item) => sum + item.quantity * item.currentPrice, 0);
    const totalCost = marketPositions.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
    const realizedPnl = marketSoldPositions.reduce((sum, item) => sum + item.realizedPnl, 0);
    const cash = capitalBase + realizedPnl - totalCost;
    return { totalMarketValue, totalCost, realizedPnl, cash, currentTotalAssets: cash + totalMarketValue };
  }, [marketPositions, marketSoldPositions, capitalBase]);
  const { totalMarketValue, totalCost, realizedPnl, cash, currentTotalAssets } = portfolioAssets;
  const activePnl = totalMarketValue - totalCost;
  const activePnlPercent = totalCost > 0 ? (activePnl / totalCost) * 100 : 0;
  const totalPnl = activePnl + realizedPnl;
  const totalPnlPercent = capitalBase > 0 ? (totalPnl / capitalBase) * 100 : 0;
  const investedPercent = currentTotalAssets > 0 ? (totalMarketValue / currentTotalAssets) * 100 : 0;
  const cashPercent = currentTotalAssets > 0 ? (cash / currentTotalAssets) * 100 : 0;
  const allocationData = useMemo(() => [
    { name: '持仓', value: Math.max(Math.round(totalMarketValue), 0), percent: investedPercent },
    { name: '现金', value: Math.max(Math.round(cash), 0), percent: cashPercent }
  ], [totalMarketValue, cash, investedPercent, cashPercent]);
  const chartOption = useMemo(() => donutOption(allocationData, ['#16a34a', '#7665ff'], {
    legendFormatter: (item) => `${item.name} ${formatMoney(item.value, market)} (${formatPercent(item.percent)})`
  }), [allocationData, market]);
  const allocationDeviations = useMemo(() => marketPositions
    .filter((item) => item.targetPercent !== null && item.targetPercent !== undefined)
    .map((item) => {
      const currentPercent = currentTotalAssets > 0 ? ((item.quantity * item.currentPrice) / currentTotalAssets) * 100 : 0;
      return { item, currentPercent, difference: currentPercent - item.targetPercent };
    })
    .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference)), [marketPositions, currentTotalAssets]);
  const trackedAllocationPercent = allocationDeviations.reduce((sum, entry) => sum + entry.currentPercent, 0);
  const largestPosition = useMemo(() => marketPositions.reduce((largest, item) => {
    if (!largest || item.quantity * item.currentPrice > largest.quantity * largest.currentPrice) return item;
    return largest;
  }, null), [marketPositions]);
  const largestPositionPercent = largestPosition && currentTotalAssets > 0
    ? ((largestPosition.quantity * largestPosition.currentPrice) / currentTotalAssets) * 100
    : 0;
  const togglePositionSort = (key) => {
    setPositionSort((current) => current?.key === key
      ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
      : { key, direction: 'desc' });
  };
  const filteredPositions = useMemo(() => marketPositions.filter((item) => {
    const hasValuation = item.trailingPE !== null || item.forwardPE !== null;
    if (valuationFilter === 'has-pe' && !hasValuation) return false;
    if (valuationFilter === 'no-pe' && hasValuation) return false;
    const currentPercent = currentTotalAssets > 0 ? ((item.quantity * item.currentPrice) / currentTotalAssets) * 100 : 0;
    if (targetFilter === 'tracked' && (item.targetPercent === null || item.targetPercent === undefined)) return false;
    if (targetFilter === 'overweight' && (item.targetPercent === null || item.targetPercent === undefined || currentPercent <= item.targetPercent)) return false;
    if (targetFilter === 'underweight' && (item.targetPercent === null || item.targetPercent === undefined || currentPercent >= item.targetPercent)) return false;
    return true;
  }), [marketPositions, valuationFilter, targetFilter, currentTotalAssets]);
  const sortedPositions = useMemo(() => {
    if (!positionSort) return filteredPositions;
    const getValue = (item) => {
      const marketValue = item.quantity * item.currentPrice;
      if (positionSort.key === 'current') return currentTotalAssets > 0 ? (marketValue / currentTotalAssets) * 100 : null;
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
  }, [filteredPositions, positionSort, currentTotalAssets]);

  const save = async () => { setSaving(true); try { await api('/stock-positions', { method: 'POST', body: JSON.stringify(input) }); setInput({ ...EMPTY_INPUT, market: market === 'CRYPTO' ? 'US' : market, assetType: market === 'CRYPTO' ? 'crypto' : 'stock' }); setCreateOpen(false); await load(); } finally { setSaving(false); } };
  const saveAssets = async () => { setSavingAssets(true); try { const field = market === 'CN' ? 'cnTotalAssets' : market === 'CRYPTO' ? 'cryptoTotalAssets' : 'totalAssets'; const result = await api('/stock-settings', { method: 'PUT', body: JSON.stringify({ [field]: Number(assetsInput) }) }); setTotalAssets(result.settings.totalAssets); setCnTotalAssets(result.settings.cnTotalAssets); setCryptoTotalAssets(result.settings.cryptoTotalAssets); setAssetsInput(String(result.settings[field])); } finally { setSavingAssets(false); } };
  const updateAssetsInput = (event) => {
    const value = event.target.value;
    if (value === '' || /^\d+(?:\.\d{0,2})?$/.test(value)) setAssetsInput(value);
  };
  const openEdit = (item) => { setDetailItem(null); setEditingInput({ symbol: item.symbol, name: item.name, market: item.market, assetType: item.assetType, quantity: item.quantity, costPrice: item.costPrice, currentPrice: item.currentPrice, targetPercent: item.targetPercent, notes: item.notes || '' }); setEditingItem(item); };
  const openSell = (item) => { setDetailItem(null); setSellingInput({ quantity: item.quantity, sellPrice: item.currentPrice, notes: '' }); setSellingItem(item); };
  const saveEdit = async () => { setEditing(true); try { await api(`/stock-positions/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(editingInput) }); setEditingItem(null); await load(); } finally { setEditing(false); } };
  const sellPosition = async () => { setSelling(true); try { await api(`/stock-positions/${sellingItem.id}/sell`, { method: 'POST', body: JSON.stringify(sellingInput) }); setSellingItem(null); await load(); } finally { setSelling(false); } };
  const saveDeposit = async () => { setDepositSaving(true); try { await api('/stock-deposits', { method: 'POST', body: JSON.stringify({ ...depositInput, market }) }); setDepositInput(EMPTY_DEPOSIT_INPUT); setDepositOpen(false); await load(); setPriceRefreshMessage(`已向${marketName}账户入金 ${formatMoney(depositInput.amount, market)}。`); } finally { setDepositSaving(false); } };
  const remove = async (id) => { await api(`/stock-positions/${id}`, { method: 'DELETE' }); setDetailItem(null); await load(); };
  const refreshPrices = async ({ automatic = false, market: marketToRefresh = 'US' } = {}) => {
    setPriceRefreshing(true); if (!automatic) setPriceRefreshMessage('');
    try {
      const result = await api('/stock-positions/refresh-prices', { method: 'POST', body: JSON.stringify({ market: marketToRefresh }) });
      await load();
      if (!automatic) setPriceRefreshMessage(`已刷新 ${result.updated.length} 笔${MARKET_LABEL[marketToRefresh]}现价。`);
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
    <>
      <div className="border-b border-border">
        <Tabs value={market} onValueChange={(nextMarket) => { setMarket(nextMarket); setDetailItem(null); setOverviewPanel(null); setPriceRefreshMessage(''); }} variant="line" size="lg">
          <TabsList aria-label="持仓市场">
            <TabsTrigger value="US">美股 {positions.filter((item) => item.market === 'US' && item.assetType !== 'crypto').length}</TabsTrigger>
            <TabsTrigger value="CN">A 股 {positions.filter((item) => item.market === 'CN' && item.assetType !== 'crypto').length}</TabsTrigger>
            <TabsTrigger value="CRYPTO">加密货币 {positions.filter((item) => item.assetType === 'crypto').length}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={market}
          className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)_22rem] items-start gap-4"
          initial={reduceMotion ? false : { opacity: 0, y: 6, filter: 'blur(2px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -2, filter: 'blur(1px)' }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
      <Card>
        <div className="p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => { setInput({ ...EMPTY_INPUT, market: market === 'CRYPTO' ? 'US' : market, assetType: market === 'CRYPTO' ? 'crypto' : 'stock' }); setCreateOpen(true); }}><Plus data-icon="start" />新增{marketName}持仓</Button>
            <Button variant="outline" onClick={() => { setDepositInput(EMPTY_DEPOSIT_INPUT); setDepositOpen(true); }}>入金</Button>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <Button variant="outline" onClick={() => setOverviewPanel('sold')}>卖出记录 {marketSoldPositions.length}</Button>
            <Button variant="outline" onClick={() => setOverviewPanel('deposits')}>入金记录 {marketDeposits.length}</Button>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-3">
            {market !== 'CRYPTO' && <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
              估值
              <Select items={VALUATION_FILTER_LABEL} value={valuationFilter} onValueChange={setValuationFilter}>
                <SelectTrigger size="sm" aria-label="市盈率筛选"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">全部</SelectItem><SelectItem value="has-pe">已有数据</SelectItem><SelectItem value="no-pe">暂无数据</SelectItem></SelectContent>
              </Select>
            </label>}
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
              目标仓位
              <Select items={TARGET_FILTER_LABEL} value={targetFilter} onValueChange={setTargetFilter}>
                <SelectTrigger size="sm" aria-label="目标仓位筛选"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="tracked">已设定</SelectItem>
                  <SelectItem value="overweight">高于计划</SelectItem>
                  <SelectItem value="underweight">低于计划</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <LoadingButton variant="outline" loading={priceRefreshing} disabled={!marketPositions.length} onClick={() => refreshPrices({ market })}>刷新{marketName}现价</LoadingButton>
          </div>
        </div>
        <p className="mb-4 text-xs leading-5 text-foreground-muted">{market === 'US' ? '配置 Finnhub API Key 后可刷新美股现价。' : market === 'CN' ? 'A 股行情由东方财富公开行情接口提供，无需额外配置；ETF 同时显示实时 IOPV 与溢价率。' : '加密货币行情来自 Binance 公开 USDT 交易对，无需额外配置。'} 完整估值、价格与操作收进持仓详情。</p>
        {priceRefreshMessage && <p className="mb-3 text-sm text-success-emphasis" aria-live="polite">{priceRefreshMessage}</p>}
        {loading ? <p className="text-foreground-muted">正在加载持仓…</p> : marketPositions.length ? sortedPositions.length ? (
          <div className="w-full overflow-x-auto">
            <Table hoverableRows>
              <TableHeader>
                <TableRow>
                  <TableHead>代码</TableHead>
                  <TableHead className="text-right"><span className="inline-flex items-center gap-1">盈亏 <SortButton sort={positionSort} sortKey="pnl" label="盈亏" onClick={() => togglePositionSort('pnl')} /></span></TableHead>
                  <TableHead className="text-right">市值 / 成本</TableHead>
                  <TableHead className="text-right"><span className="inline-flex items-center gap-1">市盈率 <SortButton sort={positionSort} sortKey="trailingPE" label="市盈率" onClick={() => togglePositionSort('trailingPE')} /></span></TableHead>
                  <TableHead className="text-right"><span className="inline-flex items-center gap-1">前瞻市盈率 <SortButton sort={positionSort} sortKey="forwardPE" label="前瞻市盈率" onClick={() => togglePositionSort('forwardPE')} /></span></TableHead>
                  {market === 'CN' && <TableHead className="text-right">实时溢价</TableHead>}
                  <TableHead className="text-right">总市值 / 总成本</TableHead>
                  <TableHead className="text-right"><span className="inline-flex items-center gap-1">现有仓位 <SortButton sort={positionSort} sortKey="current" label="现有仓位" onClick={() => togglePositionSort('current')} /></span></TableHead>
                  <TableHead className="text-right"><span className="inline-flex items-center gap-1">目标仓位 <SortButton sort={positionSort} sortKey="target" label="目标仓位" onClick={() => togglePositionSort('target')} /></span></TableHead>
                  <TableHead className="w-20 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPositions.map((item) => {
                  const marketValue = item.quantity * item.currentPrice;
                  const cost = item.quantity * item.costPrice;
                  const pnl = marketValue - cost;
                  const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;
                  const currentPercent = currentTotalAssets > 0 ? (marketValue / currentTotalAssets) * 100 : null;
                  const forwardPEColor = item.forwardPE === null || item.forwardPE === undefined ? undefined : item.forwardPE >= 30 ? 'var(--loss)' : 'var(--profit)';
                  const itemPremiumRate = premiumRate(item);
                  const itemMarket = item.assetType === 'crypto' ? 'CRYPTO' : item.market;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5"><span className="font-medium">{item.symbol}</span><Badge variant="outline" size="sm">{MARKET_LABEL[itemMarket] || itemMarket}</Badge></div>
                        {item.name && <div className="text-xs text-foreground-muted">{item.name}</div>}
                        <div className="text-xs font-semibold tabular-nums text-foreground-intense"><NumberRoller value={item.quantity} />{item.assetType === 'crypto' ? '' : ' 股'}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums" style={{ color: pnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}><AnimatedPercent value={pnlPercent} /></TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="font-medium"><AnimatedMoney value={item.currentPrice} market={itemMarket} /></div>
                        <div className="text-xs text-foreground-muted"><AnimatedMoney value={item.costPrice} market={itemMarket} /></div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.trailingPE === null || item.trailingPE === undefined ? '—' : `${Number(item.trailingPE).toFixed(2)}x`}</TableCell>
                      <TableCell className="text-right tabular-nums" style={{ color: forwardPEColor }}>{item.forwardPE === null || item.forwardPE === undefined ? '—' : `${Number(item.forwardPE).toFixed(2)}x`}</TableCell>
                      {market === 'CN' && <TableCell className="text-right font-semibold tabular-nums" style={{ color: itemPremiumRate === null ? undefined : itemPremiumRate > 0 ? 'var(--loss)' : 'var(--profit)' }}>{itemPremiumRate === null ? '—' : <AnimatedPercent value={itemPremiumRate * 100} />}</TableCell>}
                      <TableCell className="text-right tabular-nums">
                        <div className="font-medium"><AnimatedMoney value={marketValue} market={itemMarket} /></div>
                        <div className="text-xs text-foreground-muted"><AnimatedMoney value={cost} market={itemMarket} /></div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{currentPercent === null ? '—' : <AnimatedPercent value={currentPercent} />}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.targetPercent === null || item.targetPercent === undefined ? '—' : <AnimatedPercent value={item.targetPercent} fractionDigits={1} />}</TableCell>
                      <TableCell className="text-center"><Button size="sm" variant="outline" onClick={() => setDetailItem(item)}>查看</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : <Empty description={`没有符合当前筛选条件的${marketName}持仓。`} /> : <Empty description={`暂无${marketName}持仓，点击「新增${marketName}持仓」添加第一笔`} />}
        </div>
      </Card>

      <aside className="flex min-w-0 flex-col gap-4">
        <SectionCard title="总盈亏">
          <div className="grid grid-cols-2 gap-4">
            <AssetMetric label="持仓浮盈" valueClassName="text-2xl" color={activePnl >= 0 ? 'var(--profit)' : 'var(--loss)'} detail={<AnimatedPercent value={activePnlPercent} />}><AnimatedMoney value={activePnl} market={market} /></AssetMetric>
            <AssetMetric label="累计盈亏" valueClassName="text-2xl" color={totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)'} detail={<AnimatedPercent value={totalPnlPercent} />}><AnimatedMoney value={totalPnl} market={market} /></AssetMetric>
          </div>
          <Button className="mt-4 w-full" variant="outline" onClick={() => setOverviewPanel('pnl')}>查看盈亏构成</Button>
        </SectionCard>

        <SectionCard title="总资产">
          <div className="grid grid-cols-2 gap-4">
            <AssetMetric label="当前总资产" valueClassName="text-2xl" color={currentTotalAssets >= capitalBase ? 'var(--profit)' : 'var(--loss)'}><AnimatedMoney value={currentTotalAssets} market={market} /></AssetMetric>
            <AssetMetric label="累计入金" valueClassName="text-2xl"><AnimatedMoney value={totalDeposits} market={market} /></AssetMetric>
            <AssetMetric label="现金" valueClassName="text-2xl" color={cash < 0 ? 'var(--loss)' : undefined} detail={<><AnimatedPercent value={cashPercent} /> 占比</>}><AnimatedMoney value={cash} market={market} /></AssetMetric>
            <AssetMetric label="持仓" valueClassName="text-2xl" color="var(--profit)" detail={<><AnimatedPercent value={investedPercent} /> 占比</>}><AnimatedMoney value={totalMarketValue} market={market} /></AssetMetric>
            <AssetMetric label="初始资金" valueClassName="text-2xl"><AnimatedMoney value={marketTotalAssets} market={market} /></AssetMetric>
          </div>
          <Button className="mt-4 w-full" variant="outline" onClick={() => setOverviewPanel('assets')}>查看资金分配</Button>
        </SectionCard>

        <SectionCard title="目标仓位偏差">
          {loading ? <p className="text-sm text-foreground-muted">正在计算仓位偏差…</p> : allocationDeviations.length ? (
            <div className="flex flex-col gap-3">
              {allocationDeviations.slice(0, 2).map(({ item, currentPercent }) => <AllocationDeviation key={item.id} item={item} currentPercent={currentPercent} />)}
              <Button className="mt-1 w-full" variant="outline" onClick={() => setOverviewPanel('allocation')}>查看全部偏差</Button>
            </div>
          ) : <Empty description="设置目标仓位后显示偏差。" />}
        </SectionCard>
      </aside>
        </motion.div>
      </AnimatePresence>
      <Dialog open={overviewPanel !== null} onOpenChange={(open) => { if (!open) setOverviewPanel(null); }}>
        <DialogContent className={overviewPanel === 'pnl' ? 'sm:w-3/4 sm:max-w-none' : 'sm:max-w-3xl'}>
          <DialogHeader>
            <DialogTitle>{overviewPanel === 'pnl' ? '盈亏构成' : overviewPanel === 'assets' ? '资金分配' : overviewPanel === 'allocation' ? '目标仓位偏差' : overviewPanel === 'deposits' ? '入金记录' : '已卖出股票'}</DialogTitle>
            <DialogDescription>{overviewPanel === 'pnl' ? '浮动盈亏、已实现盈亏与单笔贡献。' : overviewPanel === 'assets' ? '初始资金、累计入金、现金与持仓市值。' : overviewPanel === 'allocation' ? '按实际仓位与目标仓位的偏离程度排序。' : overviewPanel === 'deposits' ? '入金会在初始资金之外计入当前账户本金。' : '已完成卖出的历史记录。'}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {overviewPanel === 'pnl' && <StockStatsPage positions={marketPositions} soldPositions={marketSoldPositions} loading={loading} />}
            {overviewPanel === 'assets' && (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)] items-center gap-6">
                <Chart option={chartOption} height={260} />
                <div className="flex min-w-0 flex-col gap-5">
                  <Field>
                    <FieldLabel>初始资金金额（{MARKET_CURRENCY[market]}）</FieldLabel>
                    <Input name="total-assets" autoComplete="off" inputMode="decimal" value={assetsInput} onChange={updateAssetsInput} placeholder="请输入初始资金金额…" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4 border-y border-border py-4">
                    <AssetMetric label="持仓" color="var(--profit)"><AnimatedMoney value={totalMarketValue} market={market} /></AssetMetric>
                    <AssetMetric label="现金" color={cash < 0 ? 'var(--loss)' : undefined}><AnimatedMoney value={cash} market={market} /></AssetMetric>
                    <AssetMetric label="当前总资产"><AnimatedMoney value={currentTotalAssets} market={market} /></AssetMetric>
                    <AssetMetric label="初始资金"><AnimatedMoney value={marketTotalAssets} market={market} /></AssetMetric>
                    <AssetMetric label="累计入金"><AnimatedMoney value={totalDeposits} market={market} /></AssetMetric>
                    <AssetMetric label="账户本金"><AnimatedMoney value={capitalBase} market={market} /></AssetMetric>
                  </div>
                </div>
              </div>
            )}
            {overviewPanel === 'allocation' && (allocationDeviations.length ? <div className="flex flex-col gap-4">{allocationDeviations.map(({ item, currentPercent }) => <AllocationDeviation key={item.id} item={item} currentPercent={currentPercent} />)}</div> : <Empty description="暂无已设目标仓位的持仓。" />)}
            {overviewPanel === 'deposits' && <><div className="mb-4 grid grid-cols-2 gap-4 border-b border-border pb-4"><AssetMetric label="初始资金"><AnimatedMoney value={marketTotalAssets} market={market} /></AssetMetric><AssetMetric label="累计入金"><AnimatedMoney value={totalDeposits} market={market} /></AssetMetric></div><Table hoverableRows><TableHeader><TableRow><TableHead>来源</TableHead><TableHead className="text-right">金额</TableHead><TableHead>备注</TableHead><TableHead>时间</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell><Badge variant="outline" size="sm">初始资金</Badge></TableCell><TableCell className="text-right font-semibold tabular-nums"><AnimatedMoney value={marketTotalAssets} market={market} /></TableCell><TableCell>账户起始本金</TableCell><TableCell className="whitespace-nowrap text-sm text-foreground-muted">—</TableCell></TableRow>{marketDeposits.map((deposit) => <TableRow key={deposit.id}><TableCell><Badge variant="outline" size="sm">入金</Badge></TableCell><TableCell className="text-right font-semibold tabular-nums"><AnimatedMoney value={deposit.amount} market={market} /></TableCell><TableCell>{deposit.notes || '—'}</TableCell><TableCell className="whitespace-nowrap text-sm">{new Date(deposit.createdAt).toLocaleString('zh-CN', { hour12: false })}</TableCell></TableRow>)}</TableBody></Table></>}
            {overviewPanel === 'sold' && (marketSoldPositions.length ? (
              <Table hoverableRows>
                <TableHeader><TableRow><TableHead>资产</TableHead><TableHead className="text-right">数量</TableHead><TableHead className="text-right">成本 / 卖出</TableHead><TableHead className="text-right">实现盈亏</TableHead><TableHead>卖出时间</TableHead></TableRow></TableHeader>
                <TableBody>{marketSoldPositions.map((item) => <TableRow key={item.id}>
                  <TableCell><div className="font-medium">{item.symbol}</div><div className="text-xs text-foreground-muted">{item.name || '—'}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}{item.assetType === 'crypto' ? '' : ' 股'}</TableCell>
                  <TableCell className="text-right tabular-nums"><div>{formatMoney(item.costPrice, item.assetType === 'crypto' ? 'CRYPTO' : item.market)}</div><div className="text-xs text-foreground-muted">{formatMoney(item.sellPrice, item.assetType === 'crypto' ? 'CRYPTO' : item.market)}</div></TableCell>
                  <TableCell className="text-right font-semibold tabular-nums" style={{ color: item.realizedPnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{formatMoney(item.realizedPnl, item.assetType === 'crypto' ? 'CRYPTO' : item.market)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{new Date(item.soldAt).toLocaleString('zh-CN', { hour12: false })}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            ) : <Empty description="暂无卖出记录。" />)}
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="soft">关闭</Button>} />
            {overviewPanel === 'assets' && <LoadingButton loading={savingAssets} disabled={!assetsInput} onClick={saveAssets}>保存初始资金</LoadingButton>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="sm:w-110">
          <DialogHeader>
            <DialogTitle>向{marketName}账户入金</DialogTitle>
            <DialogDescription>入金会在初始资金之外计入账户本金，并保留一笔记录。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <Field><FieldLabel><span className="text-error">*</span> 入金金额（{MARKET_CURRENCY[market]}）</FieldLabel><NumberField min={0.01} step={0.01} value={depositInput.amount} onValueChange={(amount) => setDepositInput({ ...depositInput, amount: amount ?? 0 })} /></Field>
              <Field><FieldLabel>备注</FieldLabel><Textarea name="stock-deposit-notes" autoComplete="off" rows={2} value={depositInput.notes} onChange={(event) => setDepositInput({ ...depositInput, notes: event.target.value })} placeholder="如月度追加资金（可选）…" /></Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="soft">取消</Button>} />
            <LoadingButton loading={depositSaving} disabled={depositInput.amount <= 0} onClick={saveDeposit}>确认入金</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailItem && (() => {
        const marketValue = detailItem.quantity * detailItem.currentPrice;
        const cost = detailItem.quantity * detailItem.costPrice;
        const pnl = marketValue - cost;
        const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;
        const currentPercent = currentTotalAssets > 0 ? (marketValue / currentTotalAssets) * 100 : 0;
        const itemPremiumRate = premiumRate(detailItem);
        const detailMarket = detailItem.assetType === 'crypto' ? 'CRYPTO' : detailItem.market;
        return (
          <Dialog open onOpenChange={(open) => { if (!open) setDetailItem(null); }}>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{detailItem.symbol} · {detailItem.name}</DialogTitle>
                <DialogDescription>{MARKET_LABEL[detailMarket] || detailMarket} · 持有 {detailItem.quantity}{detailItem.assetType === 'crypto' ? '' : ' 股'}{detailItem.priceUpdatedAt ? ` · 现价更新于 ${new Date(detailItem.priceUpdatedAt).toLocaleString('zh-CN', { hour12: false })}` : ''}</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="grid grid-cols-3 gap-x-6 gap-y-5">
                  <AssetMetric label="浮动盈亏" color={pnl >= 0 ? 'var(--profit)' : 'var(--loss)'} detail={<AnimatedPercent value={pnlPercent} />}><AnimatedMoney value={pnl} market={detailMarket} /></AssetMetric>
                  <AssetMetric label="市值 / 成本" detail={<AnimatedMoney value={cost} market={detailMarket} />}><AnimatedMoney value={marketValue} market={detailMarket} /></AssetMetric>
                  <AssetMetric label="现价 / 成本价" detail={<AnimatedMoney value={detailItem.costPrice} market={detailMarket} />}><AnimatedMoney value={detailItem.currentPrice} market={detailMarket} /></AssetMetric>
                  <AssetMetric label="当前仓位" detail={<>目标 {detailItem.targetPercent === null || detailItem.targetPercent === undefined ? '—' : formatPercent(detailItem.targetPercent)}</>}><AnimatedPercent value={currentPercent} /></AssetMetric>
                  <AssetMetric label="市盈率">{detailItem.trailingPE === null || detailItem.trailingPE === undefined ? '—' : `${Number(detailItem.trailingPE).toFixed(2)}x`}</AssetMetric>
                  <AssetMetric label="前瞻市盈率" color={detailItem.forwardPE >= 30 ? 'var(--loss)' : 'var(--profit)'}>{detailItem.forwardPE === null || detailItem.forwardPE === undefined ? '—' : `${Number(detailItem.forwardPE).toFixed(2)}x`}</AssetMetric>
                  {detailItem.market === 'CN' && <><AssetMetric label="IOPV 实时估值">{detailItem.iopv ? <AnimatedMoney value={detailItem.iopv} market="CN" /> : '—'}</AssetMetric><AssetMetric label="实时溢价" color={itemPremiumRate === null ? undefined : itemPremiumRate > 0 ? 'var(--loss)' : 'var(--profit)'}>{itemPremiumRate === null ? '—' : <AnimatedPercent value={itemPremiumRate * 100} />}</AssetMetric></>}
                </div>
                <div className="mt-6 border-t border-border pt-4">
                  <p className="text-xs font-medium text-foreground-muted">备注</p>
                  <p className="mt-1 text-sm leading-6 text-foreground-intense">{detailItem.notes || '暂无备注。'}</p>
                </div>
              </DialogBody>
              <DialogFooter>
                <DialogClose render={<Button variant="soft">关闭</Button>} />
                <Button variant="outline" onClick={() => openSell(detailItem)}>卖出</Button>
                <Button variant="outline" onClick={() => openEdit(detailItem)}>编辑</Button>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="destructive">删除</Button>} />
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>删除这笔持仓？</AlertDialogTitle></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogClose render={<Button variant="soft">取消</Button>} /><AlertDialogClose render={<Button variant="destructive" onClick={() => remove(detailItem.id)}>删除</Button>} /></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:w-130">
            <DialogHeader>
              <DialogTitle>新增持仓</DialogTitle>
              <DialogDescription>{market === 'CRYPTO' ? '录入币种、持有数量与成本价；按 USDT 交易对通过 Binance 自动获取现价。' : '录入持仓数量与成本价；美股通过 Finnhub、A 股通过东方财富自动获取现价。'}</DialogDescription>
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

        <Dialog open={sellingItem !== null} onOpenChange={(open) => { if (!open) setSellingItem(null); }}>
          <DialogContent className="sm:w-130">
            <DialogHeader>
              <DialogTitle>卖出持仓</DialogTitle>
              <DialogDescription>{sellingItem ? `${sellingItem.symbol} · 当前持有 ${sellingItem.quantity}${sellingItem.assetType === 'crypto' ? '' : ' 股'}` : '输入卖出数量与价格。'}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel><span className="text-error">*</span> 卖出数量</FieldLabel>
                    <NumberField min={0.0001} max={sellingItem?.quantity ?? 0} step={0.0001} value={sellingInput.quantity} onValueChange={(quantity) => setSellingInput({ ...sellingInput, quantity: quantity ?? 0 })} />
                  </Field>
                  <Field>
                    <FieldLabel><span className="text-error">*</span> 卖出价格（{sellingItem?.assetType === 'crypto' ? '$' : MARKET_CURRENCY[sellingItem?.market] || '$'}）</FieldLabel>
                    <NumberField min={0} step={0.01} value={sellingInput.sellPrice} onValueChange={(sellPrice) => setSellingInput({ ...sellingInput, sellPrice: sellPrice ?? 0 })} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>备注</FieldLabel>
                  <Textarea name="sell-notes" autoComplete="off" rows={2} value={sellingInput.notes} onChange={(event) => setSellingInput({ ...sellingInput, notes: event.target.value })} placeholder="记录卖出原因或策略（可选）…" />
                </Field>
                {sellingItem && <p className="text-sm text-foreground-muted">预计实现盈亏：<strong className="tabular-nums" style={{ color: (sellingInput.sellPrice - sellingItem.costPrice) * sellingInput.quantity >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{formatMoney((sellingInput.sellPrice - sellingItem.costPrice) * sellingInput.quantity, sellingItem.assetType === 'crypto' ? 'CRYPTO' : sellingItem.market)}</strong></p>}
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose render={<Button variant="soft">取消</Button>} />
              <LoadingButton loading={selling} disabled={!sellingItem || sellingInput.quantity <= 0 || sellingInput.quantity > sellingItem.quantity || sellingInput.sellPrice < 0} onClick={sellPosition}>确认卖出</LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  );
}

export { StockPositionsPage };
