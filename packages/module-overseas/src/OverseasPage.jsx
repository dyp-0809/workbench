import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@appica/ui-react/button';
import { Card } from '@appica/ui-react/card';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Switch } from '@appica/ui-react/switch';
import { DatePicker } from '@appica/ui-react/date-picker';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Badge } from '@appica/ui-react/badge';
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@appica/ui-react/alert-dialog';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@appica/ui-react/dialog';
import { Check, CreditCard, DeviceMobile, ExternalLink, Plus, World } from '@appica/icons-react';
import { api, Empty, LoadingButton } from '@personal-workbench/core';
const TYPE_LABEL = { vpn: 'VPN', sim: '手机卡', finance: '银行金融' };
const EMPTY = { type: 'vpn', name: '', url: '', areaCode: '', phoneNumber: '', purchasedAt: null, planDetails: '', expiresAt: null, notes: '', purpose: '', owned: false, cardColor: null };
const FINANCE_CARD_THEMES = {
  primary: { label: '主色', card: 'bg-primary-muted border-primary', option: 'bg-primary-muted border-primary' },
  info: { label: '信息', card: 'bg-info-muted border-info', option: 'bg-info-muted border-info' },
  success: { label: '成功', card: 'bg-success-muted border-success', option: 'bg-success-muted border-success' },
  warning: { label: '提醒', card: 'bg-warning-muted border-warning', option: 'bg-warning-muted border-warning' }
};
const FINANCE_CARD_COLORS = Object.keys(FINANCE_CARD_THEMES);

function toDate(value) { return value ? new Date(value) : null; }
function dateText(value) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '未设置'; }
function formValue(item) { return item ? { ...item, purchasedAt: toDate(item.purchasedAt), expiresAt: toDate(item.expiresAt) } : EMPTY; }
function expiryStatus(value) {
  if (!value) return { label: '未设置到期日', variant: 'outline' };
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: '已到期', variant: 'error' };
  if (days <= 30) return { label: `${days} 天内到期`, variant: 'warning' };
  return { label: '有效', variant: 'success' };
}

function OverseasForm({ value, onChange, error }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return <div className="flex flex-col gap-4">
    {error && <p className="rounded-[var(--radius-md)] border border-error bg-error-muted px-3 py-2 text-sm text-error-emphasis" role="alert">{error}</p>}
    <Field><FieldLabel><span className="text-error">*</span> 名称</FieldLabel><Input name="overseas-name" autoComplete="off" required value={value.name} onChange={(event) => set({ name: event.target.value })} placeholder="服务或机构名称…" /></Field>
    {value.type === 'vpn' && <>
      <Field><FieldLabel><span className="text-error">*</span> 服务链接</FieldLabel><Input name="vpn-url" type="url" autoComplete="off" required value={value.url} onChange={(event) => set({ url: event.target.value })} placeholder="https://…" /></Field>
      <Field><FieldLabel>备注</FieldLabel><Textarea name="vpn-notes" autoComplete="off" rows={3} value={value.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="套餐、账号提示或使用场景…" /></Field>
    </>}
    {value.type === 'sim' && <>
      <div className="grid grid-cols-2 gap-3"><Field><FieldLabel>区号</FieldLabel><Input name="sim-area-code" autoComplete="off" value={value.areaCode} onChange={(event) => set({ areaCode: event.target.value })} placeholder="如 +1…" /></Field><Field><FieldLabel>手机号</FieldLabel><Input name="sim-phone-number" type="tel" autoComplete="off" value={value.phoneNumber} onChange={(event) => set({ phoneNumber: event.target.value })} placeholder="号码…" /></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field><FieldLabel>购买日期</FieldLabel><DatePicker value={value.purchasedAt ?? undefined} onValueChange={(date) => set({ purchasedAt: date ?? null })} /></Field><Field><FieldLabel>套餐到期时间</FieldLabel><DatePicker value={value.expiresAt ?? undefined} onValueChange={(date) => set({ expiresAt: date ?? null })} /></Field></div>
      <Field><FieldLabel>套餐详情</FieldLabel><Textarea name="sim-plan-details" autoComplete="off" rows={3} value={value.planDetails} onChange={(event) => set({ planDetails: event.target.value })} placeholder="流量、通话、续费方式等…" /></Field>
      <Field><FieldLabel>备注</FieldLabel><Textarea name="sim-notes" autoComplete="off" rows={2} value={value.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="补充说明（可选）…" /></Field>
    </>}
    {value.type === 'finance' && <>
      <Field><FieldLabel>作用</FieldLabel><Input name="finance-purpose" autoComplete="off" value={value.purpose} onChange={(event) => set({ purpose: event.target.value })} placeholder="如日常消费、收款、投资…" /></Field>
      <Field><FieldLabel>官网链接</FieldLabel><Input name="finance-url" type="url" autoComplete="off" value={value.url} onChange={(event) => set({ url: event.target.value })} placeholder="https://…" /></Field>
      <Field><FieldLabel>是否拥有</FieldLabel><div className="flex h-10 items-center gap-3"><Switch checked={value.owned} onCheckedChange={(owned) => set({ owned })} /><span className="text-sm text-foreground-muted">{value.owned ? '已拥有' : '暂未拥有'}</span></div></Field>
      <Field><FieldLabel>卡片颜色</FieldLabel><div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="卡片颜色">{FINANCE_CARD_COLORS.map((color) => { const theme = FINANCE_CARD_THEMES[color]; const selected = (value.cardColor || 'primary') === color; return <Button key={color} type="button" size="sm" variant={selected ? 'outline' : 'soft'} className={`justify-start ${theme.option}`} aria-pressed={selected} onClick={() => set({ cardColor: color })}>{selected && <Check aria-hidden="true" data-icon="start" />}{theme.label}</Button>; })}</div><p className="mt-2 text-xs text-foreground-muted">新增时自动轮换，也可在此手动指定。</p></Field>
      <Field><FieldLabel>备注</FieldLabel><Textarea name="finance-notes" autoComplete="off" rows={2} value={value.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="补充说明（可选）…" /></Field>
    </>}
  </div>;
}

function ItemActions({ item, onEdit, onDelete }) {
  return <div className="flex shrink-0 items-center gap-2">
    <Button size="sm" variant="outline" onClick={() => onEdit(item)}>维护</Button>
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline">删除</Button>} />
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除「{item.name}」？</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogClose render={<Button variant="soft">取消</Button>} /><Button variant="destructive" onClick={() => onDelete(item.id)}>删除</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}

function LaneHeader({ Icon, title, description, count, onCreate }) {
  return <header className="mb-5 flex items-start justify-between gap-4">
    <div className="flex min-w-0 items-start gap-3"><Icon aria-hidden="true" className="mt-0.5 shrink-0 text-primary" /><div className="min-w-0"><h3 className="text-base font-semibold text-foreground-intense">{title}</h3><p className="mt-1 text-sm leading-5 text-foreground-muted">{description}</p></div></div>
    <Button size="sm" variant="outline" onClick={onCreate}><Plus aria-hidden="true" data-icon="start" />新增</Button>
  </header>;
}

function HoverDetails({ children, details }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] };
  return <article className="relative border-t border-border py-4 first:border-t-0 first:pt-0 hover:z-10 focus-within:z-10" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    {children}
    <AnimatePresence initial={false}>{open && <motion.div className="absolute inset-x-0 top-full z-10 -mt-2 rounded-[var(--radius-md)] border border-border bg-background p-3" initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -2 }} transition={transition}>{details}</motion.div>}</AnimatePresence>
  </article>;
}

function FinanceCardStack({ items, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const collapsedOffset = 56;
  const expandedOffset = 84;
  const stackHeight = 176 + Math.max(items.length - 1, 0) * collapsedOffset;
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] };
  return <div className="relative overflow-visible" style={{ height: stackHeight }} onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)} onFocusCapture={() => setExpanded(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}>
    {items.map((item, index) => { const theme = FINANCE_CARD_THEMES[item.cardColor] || FINANCE_CARD_THEMES.primary; return <motion.button
      key={item.id}
      type="button"
      initial={false}
      className={`absolute inset-x-0 flex h-44 flex-col justify-between overflow-hidden rounded-[var(--radius-lg)] border p-5 text-left outline-ring transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.card}`}
      style={{ zIndex: items.length - index }}
      animate={{ y: index * (expanded ? expandedOffset : collapsedOffset) }}
      transition={transition}
      onClick={() => onSelect(item)}
      aria-label={`查看${item.name}详情`}
    >
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-semibold text-foreground-intense">{item.name}</p><p className="mt-1 truncate text-sm text-foreground-muted">{item.purpose || '未填写用途'}</p></div><Badge variant={item.owned ? 'success' : 'outline'} size="sm">{item.owned ? '已拥有' : '待开通'}</Badge></div>
      <div className="flex items-end justify-between gap-3 border-t border-border pt-3"><span className="text-xs text-foreground-muted">点击查看详情</span><CreditCard aria-hidden="true" className="shrink-0 text-foreground-muted" /></div>
    </motion.button>; })}
  </div>;
}

function FinanceDetailsDialog({ item, onClose, onEdit, onDelete }) {
  if (!item) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{item.name}</DialogTitle><DialogDescription>{item.owned ? '已拥有的支付通道' : '待开通的支付通道'}</DialogDescription></DialogHeader><DialogBody><div className="flex flex-col gap-5"><div><p className="text-xs font-medium text-foreground-muted">主要作用</p><p className="mt-1 text-sm leading-6 text-foreground-intense">{item.purpose || '未填写'}</p></div>{item.url && <div><p className="text-xs font-medium text-foreground-muted">官网</p><a className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-primary hover:underline" href={item.url} target="_blank" rel="noreferrer"><span className="truncate">打开官网</span><ExternalLink aria-hidden="true" className="shrink-0" /></a></div>}{item.notes && <div><p className="text-xs font-medium text-foreground-muted">备注</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground-intense">{item.notes}</p></div>}</div></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">关闭</Button>} /><Button variant="outline" onClick={() => { onClose(); onEdit(item); }}>维护</Button><AlertDialog><AlertDialogTrigger render={<Button variant="destructive">删除</Button>} /><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除「{item.name}」？</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogClose render={<Button variant="soft">取消</Button>} /><AlertDialogClose render={<Button variant="destructive" onClick={() => { onClose(); onDelete(item.id); }}>删除</Button>} /></AlertDialogFooter></AlertDialogContent></AlertDialog></DialogFooter></DialogContent></Dialog>;
}

function OverseasPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editing, setEditing] = useState(null);
  const [input, setInput] = useState(EMPTY);
  const [selectedFinance, setSelectedFinance] = useState(null);
  const load = async () => { setLoading(true); try { setItems((await api('/overseas-items')).items); } finally { setLoading(false); } };
  useEffect(() => { load().catch(() => setItems([])); }, []);
  const grouped = useMemo(() => Object.fromEntries(Object.keys(TYPE_LABEL).map((type) => [type, items.filter((item) => item.type === type)])), [items]);
  const openCreate = (type) => { setInput({ ...EMPTY, type, cardColor: type === 'finance' ? FINANCE_CARD_COLORS[grouped.finance.length % FINANCE_CARD_COLORS.length] : null }); setSaveError(''); setCreating(true); };
  const openEdit = (item) => { setInput(formValue(item)); setSaveError(''); setEditing(item); };
  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api(editing ? `/overseas-items/${editing.id}` : '/overseas-items', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ ...input, purchasedAt: input.purchasedAt?.toISOString() || null, expiresAt: input.expiresAt?.toISOString() || null }) });
      setCreating(false);
      setEditing(null);
      await load();
    } catch (error) { setSaveError(error.message || '保存失败，请检查输入后重试。'); } finally { setSaving(false); }
  };
  const remove = async (id) => { await api(`/overseas-items/${id}`, { method: 'DELETE' }); await load(); };
  const dialogOpen = creating || editing !== null;

  return <div className="flex flex-col gap-4">
    <Card>
      <div className="p-4">
      <div className="grid grid-cols-1 divide-y divide-border border-y border-border min-[900px]:grid-cols-3 min-[900px]:divide-x min-[900px]:divide-y-0">
        <section className="min-w-0 px-5 py-5">
          <LaneHeader Icon={World} title="网络通道" description="VPN 服务与快速打开入口" count={grouped.vpn.length} onCreate={() => openCreate('vpn')} />
          {loading ? <p className="py-6 text-sm text-foreground-muted">正在读取网络服务…</p> : !grouped.vpn.length ? <Empty description="还没有 VPN 服务" className="py-6" /> : <div>{grouped.vpn.map((item) => <HoverDetails key={item.id} details={<div><a className="inline-flex max-w-full items-center gap-1 text-sm text-primary hover:underline" href={item.url} target="_blank" rel="noreferrer" title={item.url}><span className="truncate">快速打开</span><ExternalLink aria-hidden="true" className="shrink-0" /></a>{item.notes && <p className="mt-2 wrap-break-word whitespace-pre-wrap text-sm leading-5 text-foreground-muted">{item.notes}</p>}</div>}><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate font-medium text-foreground-intense" title={item.name}>{item.name}</p><ItemActions item={item} onEdit={openEdit} onDelete={remove} /></div></HoverDetails>)}</div>}
        </section>

        <section className="min-w-0 px-5 py-5">
          <LaneHeader Icon={DeviceMobile} title="通信凭证" description="号码、套餐与到期状态" count={grouped.sim.length} onCreate={() => openCreate('sim')} />
          {loading ? <p className="py-6 text-sm text-foreground-muted">正在读取通信服务…</p> : !grouped.sim.length ? <Empty description="还没有手机卡" className="py-6" /> : <div>{grouped.sim.map((item) => { const status = expiryStatus(item.expiresAt); return <HoverDetails key={item.id} details={<div><dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><div><dt className="text-foreground-muted">购买日期</dt><dd className="mt-1 tabular-nums text-foreground-intense">{dateText(item.purchasedAt)}</dd></div><div><dt className="text-foreground-muted">套餐到期</dt><dd className="mt-1 tabular-nums text-foreground-intense">{dateText(item.expiresAt)}</dd></div></dl>{item.planDetails && <p className="mt-3 wrap-break-word whitespace-pre-wrap text-sm leading-5 text-foreground-muted">{item.planDetails}</p>}{item.notes && <p className="mt-2 wrap-break-word whitespace-pre-wrap text-xs leading-5 text-foreground-muted">{item.notes}</p>}</div>}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="min-w-0 truncate font-medium text-foreground-intense" title={item.name}>{item.name}</p><Badge variant={status.variant} size="sm">{status.label}</Badge></div><p className="mt-2 text-sm tabular-nums text-foreground-intense">{item.areaCode} {item.phoneNumber || '未填写号码'}</p></div><ItemActions item={item} onEdit={openEdit} onDelete={remove} /></div></HoverDetails>; })}</div>}
        </section>

        <section className="min-w-0 px-5 py-5">
          <LaneHeader Icon={CreditCard} title="支付通道" description="银行与金融服务以卡片堆叠展示" count={grouped.finance.length} onCreate={() => openCreate('finance')} />
          {loading ? <p className="py-6 text-sm text-foreground-muted">正在读取支付服务…</p> : !grouped.finance.length ? <Empty description="还没有银行金融服务" className="py-6" /> : <FinanceCardStack items={grouped.finance} onSelect={setSelectedFinance} />}
        </section>
      </div>
      </div>
    </Card>
    <FinanceDetailsDialog item={selectedFinance} onClose={() => setSelectedFinance(null)} onEdit={openEdit} onDelete={remove} />
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); setSaveError(''); } }}><DialogContent className="sm:w-130"><DialogHeader><DialogTitle>{editing ? `维护${TYPE_LABEL[input.type]}` : `新增${TYPE_LABEL[input.type]}`}</DialogTitle><DialogDescription>{input.type === 'vpn' ? '维护可快速打开的网络服务入口。' : input.type === 'sim' ? '维护号码、套餐与到期信息。' : '维护支付、收款与金融服务信息。'}</DialogDescription></DialogHeader><DialogBody><OverseasForm value={input} onChange={setInput} error={saveError} /></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={saving} disabled={!input.name.trim() || (input.type === 'vpn' && !input.url.trim())} onClick={save}>保存</LoadingButton></DialogFooter></DialogContent></Dialog>
  </div>;
}

export { OverseasPage };
