import { useEffect, useState } from 'react';
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
import { Plus } from '@appica/icons-react';
import { api, reportApiError, Empty, LoadingButton, SectionCard, NumberRoller } from '@personal-workbench/core';

const MARKET_LABEL = { US: '美股', HK: '港股', CN: 'A 股' };
const MARKET_CURRENCY = { US: '$', HK: 'HK$', CN: '¥' };
const EMPTY_PLAN = { symbol: '', name: '', market: 'US', entryPrice: 0, targetPercent: null, notes: '' };

function formatMoney(value, market = 'US') {
  const amount = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return `${MARKET_CURRENCY[market] || '$'}${amount}`;
}

function formatMultiple(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

function AnimatedMoney({ value, market = 'US' }) {
  return <><span>{MARKET_CURRENCY[market] || '$'}</span><NumberRoller value={Math.abs(value)} format={(number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)} /></>;
}

function AnimatedMultiple({ value }) {
  return Number.isFinite(value) ? <NumberRoller value={value} format={(number) => number.toFixed(2)} /> : '—';
}

function EntryPlanForm({ value, onChange, symbols, symbolListId }) {
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
          <Input required list={symbolListId} value={value.symbol} onChange={updateSymbol} placeholder="输入或选择代码，如 NVDA" />
          <datalist id={symbolListId}>{symbols.map((item) => <option key={item.symbol} value={item.symbol} label={`${item.name} · ${MARKET_LABEL[item.market] || item.market}`} />)}</datalist>
          <p className="text-xs text-foreground-muted">保存新代码后，会自动加入股票代码列表。</p>
        </Field>
        <Field>
          <FieldLabel><span className="text-error">*</span> 名称</FieldLabel>
          <Input required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="如 英伟达" />
        </Field>
      </div>
      <Field>
        <FieldLabel><span className="text-error">*</span> 市场</FieldLabel>
        <Select items={MARKET_LABEL} value={value.market} onValueChange={(market) => onChange({ ...value, market })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="US">美股</SelectItem><SelectItem value="HK">港股</SelectItem><SelectItem value="CN">A 股</SelectItem></SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel><span className="text-error">*</span> 开仓位置（{MARKET_CURRENCY[value.market] || '$'}）</FieldLabel>
          <NumberField min={0} step={0.01} value={value.entryPrice} onValueChange={(entryPrice) => onChange({ ...value, entryPrice: entryPrice ?? 0 })} />
        </Field>
        <Field>
          <FieldLabel>目标仓位（%）</FieldLabel>
          <NumberField min={0} max={100} step={0.1} value={value.targetPercent ?? undefined} onValueChange={(targetPercent) => onChange({ ...value, targetPercent: targetPercent ?? null })} />
        </Field>
      </div>
      <Field>
        <FieldLabel>备注</FieldLabel>
        <Textarea rows={2} value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="记录等待条件或开仓逻辑（可选）" />
      </Field>
    </div>
  );
}

function StockEntryPlansPage() {
  const [plans, setPlans] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [input, setInput] = useState(EMPTY_PLAN);
  const [saving, setSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editingInput, setEditingInput] = useState(EMPTY_PLAN);
  const [editing, setEditing] = useState(false);
  const [openingPlan, setOpeningPlan] = useState(null);
  const [openingInput, setOpeningInput] = useState({ quantity: 1, costPrice: 0, targetPercent: null, notes: '' });
  const [opening, setOpening] = useState(false);
  const [marketData, setMarketData] = useState({});
  const [marketRefreshing, setMarketRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [planData, symbolData] = await Promise.all([api('/stock-entry-plans'), api('/stock-symbols')]);
      setPlans(planData.plans);
      setMarketData(Object.fromEntries(planData.plans.map((plan) => [plan.id, {
        currentPrice: plan.currentPrice,
        trailingPE: plan.trailingPE,
        forwardPE: plan.forwardPE,
        status: plan.marketStatus,
        priceUpdatedAt: plan.marketUpdatedAt,
        error: plan.marketError,
        valuationError: plan.marketError
      }])));
      setSymbols(symbolData.symbols);
      return planData;
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    } finally { setLoading(false); }
  };
  const refreshMarketData = async () => {
    setMarketRefreshing(true);
    try {
      const response = await api('/stock-entry-plans/refresh-market-data', { method: 'POST' });
      const nextData = Object.fromEntries([
        ...(response.updated || []).map((item) => [item.id, item]),
        ...(response.failed || []).map((item) => [item.id, { error: item.reason }]),
        ...(response.skipped || []).map((item) => [item.id, { skipped: item.reason }])
      ]);
      setMarketData((current) => ({ ...current, ...nextData }));
      const failures = response.failed || [];
      if (failures.length) reportApiError(new Error(`以下代码行情刷新失败：${[...new Set(failures.map((item) => item.symbol))].join('、')}。`));
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    } finally { setMarketRefreshing(false); }
  };

  useEffect(() => {
    const initialize = async () => {
      await load();
      try {
        const settings = await api('/finnhub-settings');
        if (settings.configured) await refreshMarketData();
      } catch { /* 保留 SQLite 中的最近成功缓存。 */ }
    };
    initialize();
  }, []);

  const create = async () => { setSaving(true); try { await api('/stock-entry-plans', { method: 'POST', body: JSON.stringify(input) }); setInput(EMPTY_PLAN); setCreateOpen(false); await load(); await refreshMarketData(); } catch {
   // API 错误由应用壳的全局 Toast 统一展示。
 } finally { setSaving(false); } };
  const edit = (plan) => { setEditingPlan(plan); setEditingInput({ symbol: plan.symbol, name: plan.name, market: plan.market, entryPrice: plan.entryPrice, targetPercent: plan.targetPercent, notes: plan.notes || '' }); };
  const saveEdit = async () => { setEditing(true); try { await api(`/stock-entry-plans/${editingPlan.id}`, { method: 'PATCH', body: JSON.stringify(editingInput) }); setEditingPlan(null); await load(); } catch {
   // API 错误由应用壳的全局 Toast 统一展示。
 } finally { setEditing(false); } };
  const remove = async (id) => { try { await api(`/stock-entry-plans/${id}`, { method: 'DELETE' }); await load(); } catch {
    // API 错误由应用壳的全局 Toast 统一展示。
  } };
  const startOpening = (plan) => { setOpeningPlan(plan); setOpeningInput({ quantity: 1, costPrice: plan.entryPrice, targetPercent: plan.targetPercent, notes: plan.notes || '' }); };
  const openPosition = async () => {
    setOpening(true);
    try {
      await api(`/stock-entry-plans/${openingPlan.id}/open-position`, { method: 'POST', body: JSON.stringify(openingInput) });
      setOpeningPlan(null); await load();
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    } finally { setOpening(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="待开仓股票">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div><p className="m-0 text-sm text-foreground-muted">记录关注股票及计划开仓位置；实际建仓后可一键转入仓位管理。</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={marketRefreshing} onClick={refreshMarketData}>{marketRefreshing ? '正在刷新…' : '刷新美股行情'}</Button><Button onClick={() => { setInput(EMPTY_PLAN); setCreateOpen(true); }}><Plus data-icon="start" />新增待开仓股票</Button></div>
        </div>
        {loading ? <p className="text-foreground-muted">正在加载待开仓股票…</p> : plans.length ? (
          <Table hoverableRows>
            <TableHeader><TableRow><TableHead>代码</TableHead><TableHead>开仓位置</TableHead><TableHead>当前市价</TableHead><TableHead>开仓状态</TableHead><TableHead>市盈率（TTM）</TableHead><TableHead>前瞻市盈率</TableHead><TableHead>目标仓位</TableHead><TableHead>备注</TableHead><TableHead className="w-[14rem] whitespace-nowrap text-center">操作</TableHead></TableRow></TableHeader>
            <TableBody>
              {plans.map((plan) => {
                const quote = marketData[plan.id];
                const forwardPEColor = quote?.forwardPE > 30 ? 'var(--loss)' : quote?.forwardPE < 30 ? 'var(--profit)' : undefined;
                return <TableRow key={plan.id}>
                  <TableCell><div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{plan.symbol}</span><Badge variant="outline" size="sm">{MARKET_LABEL[plan.market] || plan.market}</Badge></div>{plan.name && <div className="text-xs text-foreground-muted">{plan.name}</div>}</TableCell>
                  <TableCell className="font-medium tabular-nums"><AnimatedMoney value={plan.entryPrice} market={plan.market} /></TableCell>
                  <TableCell className="tabular-nums">{quote?.currentPrice ? <><div><AnimatedMoney value={quote.currentPrice} market={plan.market} /></div>{quote.priceUpdatedAt && <div className="text-xs text-foreground-muted">{new Date(quote.priceUpdatedAt).toLocaleString('zh-CN', { hour12: false })}</div>}</> : '—'}</TableCell>
                  <TableCell>{quote?.status === 'openable' ? <span className="font-medium" style={{ color: 'var(--profit)' }}>可开仓</span> : quote?.status === 'waiting' ? <span className="font-medium" style={{ color: 'var(--loss)' }}>等待回落</span> : <span className="text-foreground-muted" title={quote?.error || quote?.skipped || quote?.valuationError || ''}>—</span>}</TableCell>
                  <TableCell className="tabular-nums"><AnimatedMultiple value={quote?.trailingPE} /></TableCell>
                  <TableCell className="font-medium tabular-nums" style={{ color: forwardPEColor }} title={quote?.valuationError || ''}><AnimatedMultiple value={quote?.forwardPE} /></TableCell>
                  <TableCell className="tabular-nums">{plan.targetPercent === null || plan.targetPercent === undefined ? '—' : <NumberRoller value={plan.targetPercent} format={(number) => `${number}%`} />}</TableCell>
                  <TableCell className="max-w-56 truncate text-foreground-muted" title={plan.notes}>{plan.notes || '—'}</TableCell>
                  <TableCell className="w-[14rem] whitespace-nowrap text-center"><div className="flex justify-center gap-1"><Button size="sm" onClick={() => startOpening(plan)}>添加至仓位管理</Button><Button size="sm" variant="outline" onClick={() => edit(plan)}>编辑</Button><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="destructive">删除</Button>} /><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这只待开仓股票？</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogClose render={<Button variant="soft">取消</Button>} /><AlertDialogClose render={<Button variant="destructive" onClick={() => remove(plan.id)}>删除</Button>} /></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        ) : <Empty description="暂无待开仓股票，点击「新增待开仓股票」开始维护" />}
      </SectionCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="sm:w-110"><DialogHeader><DialogTitle>新增待开仓股票</DialogTitle><DialogDescription>记录预期开仓位置和目标仓位；此处不会创建真实持仓。</DialogDescription></DialogHeader><DialogBody><EntryPlanForm value={input} onChange={setInput} symbols={symbols} symbolListId="create-entry-plan-symbols" /></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={saving} disabled={!input.symbol.trim() || !input.name.trim()} onClick={create}>保存</LoadingButton></DialogFooter></DialogContent></Dialog>

      <Dialog open={editingPlan !== null} onOpenChange={(open) => { if (!open) setEditingPlan(null); }}><DialogContent className="sm:w-110"><DialogHeader><DialogTitle>编辑待开仓股票</DialogTitle><DialogDescription>可修改开仓位置、目标仓位和记录说明。</DialogDescription></DialogHeader><DialogBody><EntryPlanForm value={editingInput} onChange={setEditingInput} symbols={symbols} symbolListId="edit-entry-plan-symbols" /></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={editing} disabled={!editingInput.symbol.trim() || !editingInput.name.trim()} onClick={saveEdit}>保存</LoadingButton></DialogFooter></DialogContent></Dialog>

      <Dialog open={openingPlan !== null} onOpenChange={(open) => { if (!open) setOpeningPlan(null); }}><DialogContent className="sm:w-110"><DialogHeader><DialogTitle>添加至仓位管理</DialogTitle><DialogDescription>{openingPlan ? `将 ${openingPlan.symbol} 转入真实持仓；美股会自动获取最新现价。` : ''}</DialogDescription></DialogHeader><DialogBody><div className="grid grid-cols-2 gap-3"><Field><FieldLabel><span className="text-error">*</span> 持仓数量</FieldLabel><NumberField min={1} value={openingInput.quantity} onValueChange={(quantity) => setOpeningInput({ ...openingInput, quantity: quantity ?? 1 })} /></Field><Field><FieldLabel><span className="text-error">*</span> 成本价（{MARKET_CURRENCY[openingPlan?.market] || '$'}）</FieldLabel><NumberField min={0} step={0.01} value={openingInput.costPrice} onValueChange={(costPrice) => setOpeningInput({ ...openingInput, costPrice: costPrice ?? 0 })} /></Field><Field><FieldLabel>目标仓位（%）</FieldLabel><NumberField min={0} max={100} step={0.1} value={openingInput.targetPercent ?? undefined} onValueChange={(targetPercent) => setOpeningInput({ ...openingInput, targetPercent: targetPercent ?? null })} /></Field><Field><FieldLabel>备注</FieldLabel><Input value={openingInput.notes} onChange={(event) => setOpeningInput({ ...openingInput, notes: event.target.value })} /></Field></div></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={opening} disabled={!openingInput.quantity} onClick={openPosition}>确认添加</LoadingButton></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

export { StockEntryPlansPage };
