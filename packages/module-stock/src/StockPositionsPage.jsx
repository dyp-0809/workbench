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
import { Plus } from '@appica/icons-react';
import { api, SectionCard, Empty, LoadingButton, Chart, donutOption } from '@personal-workbench/core';

const MARKET_LABEL = { US: '美股', HK: '港股', CN: 'A 股' };
const EMPTY_INPUT = { symbol: '', name: '', market: 'US', quantity: 1, costPrice: 0, currentPrice: 0, targetPercent: null, notes: '' };

function formatMoney(value) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function StockPositionForm({ value, onChange }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel><span className="text-error">*</span> 代码</FieldLabel>
          <Input required value={value.symbol} onChange={(event) => onChange({ ...value, symbol: event.target.value })} placeholder="如 AAPL" />
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
      <div className="grid grid-cols-3 gap-3">
        <Field>
          <FieldLabel><span className="text-error">*</span> 数量</FieldLabel>
          <NumberField min={1} value={value.quantity} onValueChange={(quantity) => onChange({ ...value, quantity: quantity ?? 1 })} />
        </Field>
        <Field>
          <FieldLabel><span className="text-error">*</span> 成本价</FieldLabel>
          <NumberField min={0} step={0.01} value={value.costPrice} onValueChange={(costPrice) => onChange({ ...value, costPrice: costPrice ?? 0 })} />
        </Field>
        <Field>
          <FieldLabel><span className="text-error">*</span> 现价</FieldLabel>
          <NumberField min={0} step={0.01} value={value.currentPrice} onValueChange={(currentPrice) => onChange({ ...value, currentPrice: currentPrice ?? 0 })} />
        </Field>
      </div>
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
  const [assetsInput, setAssetsInput] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAssets, setSavingAssets] = useState(false);
  const [editing, setEditing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [input, setInput] = useState(EMPTY_INPUT);
  const [editingInput, setEditingInput] = useState(EMPTY_INPUT);

  const load = async () => {
    setLoading(true);
    try {
      const [posData, settingsData] = await Promise.all([api('/stock-positions'), api('/stock-settings')]);
      setPositions(posData.positions);
      setTotalAssets(settingsData.settings.totalAssets);
      setAssetsInput(settingsData.settings.totalAssets);
    } finally { setLoading(false); }
  };
  useEffect(() => { load().catch(() => { setPositions([]); setTotalAssets(0); }); }, []);

  const totalMarketValue = useMemo(() => positions.reduce((sum, item) => sum + item.quantity * item.currentPrice, 0), [positions]);
  const cash = totalAssets - totalMarketValue;
  const investedPercent = totalAssets > 0 ? Math.min(100, (totalMarketValue / totalAssets) * 100) : 0;
  const cashPercent = 100 - investedPercent;
  const chartOption = useMemo(() => donutOption([{ name: '持仓', value: Math.round(totalMarketValue) }, { name: '现金', value: Math.max(Math.round(cash), 0) }], ['#16a34a', '#7665ff']), [totalMarketValue, cash]);

  const save = async () => { setSaving(true); try { await api('/stock-positions', { method: 'POST', body: JSON.stringify(input) }); setInput(EMPTY_INPUT); setCreateOpen(false); await load(); } finally { setSaving(false); } };
  const saveAssets = async () => { setSavingAssets(true); try { const result = await api('/stock-settings', { method: 'PUT', body: JSON.stringify({ totalAssets: assetsInput }) }); setTotalAssets(result.settings.totalAssets); setAssetsInput(result.settings.totalAssets); } finally { setSavingAssets(false); } };
  const openEdit = (item) => { setEditingInput({ symbol: item.symbol, name: item.name, market: item.market, quantity: item.quantity, costPrice: item.costPrice, currentPrice: item.currentPrice, targetPercent: item.targetPercent, notes: item.notes || '' }); setEditingItem(item); };
  const saveEdit = async () => { setEditing(true); try { await api(`/stock-positions/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(editingInput) }); setEditingItem(null); await load(); } finally { setEditing(false); } };
  const remove = async (id) => { await api(`/stock-positions/${id}`, { method: 'DELETE' }); await load(); };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="总资产">
        <div className="flex items-center gap-6">
          <div className="shrink-0" style={{ width: '40%' }}>
            <Chart option={chartOption} height={220} />
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-foreground-muted">总资产 · USD</p>
              <p className="text-[30px] font-bold leading-none tabular-nums">${formatMoney(totalAssets)}</p>
              <div className="mt-1 flex flex-col gap-1.5 text-sm">
                <span className="flex justify-between"><span className="text-foreground-muted">持仓</span><strong className="tabular-nums" style={{ color: 'var(--profit)' }}>${formatMoney(totalMarketValue)}</strong></span>
                <span className="flex justify-between"><span className="text-foreground-muted">现金</span><strong className="tabular-nums" style={{ color: cash < 0 ? 'var(--loss)' : 'inherit' }}>${formatMoney(cash)}</strong></span>
              </div>
            </div>
            <div className="flex items-end gap-3">
              <Field style={{ width: 200 }}>
                <FieldLabel>总资产金额（USD）</FieldLabel>
                <NumberField min={0} step={0.01} value={assetsInput} onValueChange={(value) => setAssetsInput(value ?? 0)} />
              </Field>
              <LoadingButton loading={savingAssets} onClick={saveAssets}>保存</LoadingButton>
            </div>
            {totalAssets <= 0 && <p className="text-xs text-foreground-muted">设置总资产后，才能计算每笔现有仓位与现金占比。</p>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="仓位管理">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Button onClick={() => setCreateOpen(true)}><Plus data-icon="start" />新增持仓</Button>
          <p className="text-sm text-foreground-muted">现价需手动更新，系统不自动拉取行情。</p>
        </div>
        {loading ? <p className="text-foreground-muted">正在加载持仓…</p> : positions.length ? (
          <Table hoverableRows>
            <TableHeader>
              <TableRow><TableHead>代码</TableHead><TableHead>市场</TableHead><TableHead className="text-right">市值 / 成本</TableHead><TableHead className="text-right">现有仓位</TableHead><TableHead className="text-right">目标仓位</TableHead><TableHead className="text-right">盈亏</TableHead><TableHead>操作</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((item) => {
                const marketValue = item.quantity * item.currentPrice;
                const cost = item.quantity * item.costPrice;
                const pnl = marketValue - cost;
                const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;
                const currentPercent = totalAssets > 0 ? (marketValue / totalAssets) * 100 : null;
                const positive = pnl >= 0;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.symbol}</div>
                      {item.name && <div className="text-xs text-foreground-muted">{item.name}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" size="sm">{MARKET_LABEL[item.market] || item.market}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-medium">{formatMoney(marketValue)}</div>
                      <div className="text-xs text-foreground-muted">{formatMoney(cost)}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{currentPercent === null ? '—' : `${currentPercent.toFixed(2)}%`}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.targetPercent === null || item.targetPercent === undefined ? '—' : `${item.targetPercent}%`}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums" style={{ color: positive ? 'var(--profit)' : 'var(--loss)' }}>{positive ? '+' : ''}{pnlPercent.toFixed(2)}%</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
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
        ) : <Empty description="暂无持仓，点击「新增持仓」添加第一笔" />}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:w-110">
            <DialogHeader>
              <DialogTitle>新增持仓</DialogTitle>
              <DialogDescription>录入持仓数量、成本价与现价，可选设置目标仓位比例。</DialogDescription>
            </DialogHeader>
            <DialogBody><StockPositionForm value={input} onChange={setInput} /></DialogBody>
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
            <DialogBody><StockPositionForm value={editingInput} onChange={setEditingInput} /></DialogBody>
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
