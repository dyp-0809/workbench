import { useEffect, useMemo, useState } from 'react';
import { Button } from '@appica/ui-react/button';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { NumberField } from '@appica/ui-react/number-field';
import { DatePicker } from '@appica/ui-react/date-picker';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@appica/ui-react/table';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Badge } from '@appica/ui-react/badge';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogClose } from '@appica/ui-react/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';
import { Plus } from '@appica/icons-react';
import { Autocomplete, AutocompleteInput, AutocompleteContent, AutocompleteEmpty, AutocompleteList, AutocompleteItem } from '@appica/ui-react/autocomplete';
import { api, SectionCard, Empty, LoadingButton, statusTagVariant, statusTagLabel } from '@personal-workbench/core';

function ExpiringForm({ value, onChange, tags = [] }) {
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel><span className="text-error">*</span> 名称</FieldLabel>
        <Input required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel>标签</FieldLabel>
        <Autocomplete items={tags} value={value.category} onValueChange={(category) => onChange({ ...value, category })} clearable>
          <AutocompleteInput placeholder="输入或选择标签（可选）" />
          <AutocompleteContent>
            <AutocompleteEmpty>无匹配标签，输入即新建</AutocompleteEmpty>
            <AutocompleteList>
              {(tag) => <AutocompleteItem key={tag} value={tag}>{tag}</AutocompleteItem>}
            </AutocompleteList>
          </AutocompleteContent>
        </Autocomplete>
      </Field>
      <Field>
        <FieldLabel><span className="text-error">*</span> 模式</FieldLabel>
        <Select items={{ once: '单次提醒', 'recurring-auto': '周期自动滚动', 'recurring-manual': '周期手动确认' }} value={value.mode} onValueChange={(mode) => onChange({ ...value, mode })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="once">单次提醒</SelectItem>
            <SelectItem value="recurring-auto">周期自动滚动</SelectItem>
            <SelectItem value="recurring-manual">周期手动确认</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel><span className="text-error">*</span> {value.mode === 'once' ? '到期时间' : '开始时间'}</FieldLabel>
        <DatePicker showTime value={value.dueAt ?? undefined} onValueChange={(date) => onChange({ ...value, dueAt: date ?? null })} />
      </Field>
      {value.mode !== 'once' && (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>周期数值</FieldLabel>
            <NumberField min={1} value={value.intervalValue} onValueChange={(intervalValue) => onChange({ ...value, intervalValue: intervalValue ?? 1 })} />
          </Field>
          <Field>
            <FieldLabel>周期单位</FieldLabel>
            <Select items={{ day: '天', week: '周', month: '月', year: '年' }} value={value.intervalUnit} onValueChange={(intervalUnit) => onChange({ ...value, intervalUnit })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">天</SelectItem>
                <SelectItem value="week">周</SelectItem>
                <SelectItem value="month">月</SelectItem>
                <SelectItem value="year">年</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>提前提醒量</FieldLabel>
          <NumberField min={0} value={value.advanceValue} onValueChange={(advanceValue) => onChange({ ...value, advanceValue: advanceValue ?? 0 })} />
        </Field>
        <Field>
          <FieldLabel>提前单位</FieldLabel>
          <Select items={{ minute: '分钟', hour: '小时', day: '天' }} value={value.advanceUnit} onValueChange={(advanceUnit) => onChange({ ...value, advanceUnit })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="minute">分钟</SelectItem>
              <SelectItem value="hour">小时</SelectItem>
              <SelectItem value="day">天</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field>
        <FieldLabel>备注</FieldLabel>
        <Textarea rows={2} value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="补充说明（可选）" />
      </Field>
    </div>
  );
}

function ExpiringItemsPage({ focusId = null }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bark, setBark] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [input, setInput] = useState({ name: '', notes: '', category: '', mode: 'once', dueAt: null, intervalValue: 1, intervalUnit: 'day', advanceValue: 0, advanceUnit: 'day' });
  const load = async () => { setLoading(true); try { setItems((await api('/expiring-items')).items); } finally { setLoading(false); } };
  useEffect(() => { load().catch(() => setItems([])); api('/bark-settings').then(setBark).catch(() => {}); }, []);

  useEffect(() => {
    if (!focusId || loading) return;
    document.querySelector('[data-focus-target="expiring"]')?.scrollIntoView({ block: 'center' });
  }, [focusId, loading, items]);
  const save = async () => { setSaving(true); try { const body = { name: input.name, notes: input.notes, category: input.category, mode: input.mode, dueAt: input.dueAt ? input.dueAt.toISOString() : undefined, advanceValue: input.advanceValue, advanceUnit: input.advanceUnit }; if (input.mode !== 'once') { body.intervalValue = input.intervalValue; body.intervalUnit = input.intervalUnit; } await api('/expiring-items', { method: 'POST', body: JSON.stringify(body) }); setInput({ name: '', notes: '', category: '', mode: 'once', dueAt: null, intervalValue: 1, intervalUnit: 'day', advanceValue: 0, advanceUnit: 'day' }); setCreateOpen(false); await load(); } finally { setSaving(false); } };
  const confirm = async (id) => { await api(`/expiring-items/${id}/confirm`, { method: 'POST' }); await load(); };
  const remove = async (id) => { await api(`/expiring-items/${id}`, { method: 'DELETE' }); await load(); };
  const toggle = async (item) => { await api(`/expiring-items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !item.enabled }) }); await load(); };
  const modeLabel = { once: '单次', 'recurring-auto': '周期自动', 'recurring-manual': '周期手动' };
  const intervalUnitLabel = { day: '天', week: '周', month: '月', year: '年' };
  const advanceUnitLabel = { minute: '分钟', hour: '小时', day: '天' };
  const tags = useMemo(() => [...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const [editingItem, setEditingItem] = useState(null);
  const [editingInput, setEditingInput] = useState({ name: '', mode: 'once', dueAt: null, intervalValue: 1, intervalUnit: 'day', advanceValue: 0, advanceUnit: 'day', notes: '', category: '' });
  const [editing, setEditing] = useState(false);
  const openEdit = (item) => { setEditingInput({ name: item.name, mode: item.mode, dueAt: item.dueAt ? new Date(item.dueAt) : null, intervalValue: item.intervalValue ?? 1, intervalUnit: item.intervalUnit ?? 'day', advanceValue: item.advanceValue, advanceUnit: item.advanceUnit, notes: item.notes || '', category: item.category || '' }); setEditingItem(item); };
  const saveEdit = async () => { setEditing(true); try { const body = { name: editingInput.name, mode: editingInput.mode, dueAt: editingInput.dueAt ? editingInput.dueAt.toISOString() : undefined, advanceValue: editingInput.advanceValue, advanceUnit: editingInput.advanceUnit, notes: editingInput.notes, category: editingInput.category }; if (editingInput.mode !== 'once') { body.intervalValue = editingInput.intervalValue; body.intervalUnit = editingInput.intervalUnit; } await api(`/expiring-items/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(body) }); setEditingItem(null); await load(); } finally { setEditing(false); } };

  return (
    <SectionCard title="到期与提醒">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Button onClick={() => setCreateOpen(true)}><Plus data-icon="start" />新增</Button>
        <p className="text-sm text-foreground-muted">Bark 通知：{bark ? (bark.configured ? '已配置' : '未配置，请在设置页配置') : '检查中…'}</p>
      </div>
      {loading ? <p className="text-foreground-muted">正在加载到期项…</p> : items.length ? (
        <Table hoverableRows>
          <TableHeader>
            <TableRow><TableHead>项目</TableHead><TableHead>模式</TableHead><TableHead>周期 / 提前</TableHead><TableHead>到期时间</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} data-focus-target={focusId === item.id ? 'expiring' : undefined}>
                <TableCell>
                  <div className="flex items-center gap-2 font-medium">{item.name}{item.category && <Badge variant="outline" size="sm">{item.category}</Badge>}</div>
                  {item.notes && <div className="mt-0.5 text-xs text-foreground-muted">{item.notes}</div>}
                </TableCell>
                <TableCell>{modeLabel[item.mode] || item.mode}</TableCell>
                <TableCell>{item.intervalValue ? `${item.intervalValue} ${intervalUnitLabel[item.intervalUnit] || item.intervalUnit} · 提前 ${item.advanceValue} ${advanceUnitLabel[item.advanceUnit]}` : `提前 ${item.advanceValue} ${advanceUnitLabel[item.advanceUnit]}`}</TableCell>
                <TableCell>{item.dueAt ? new Date(item.dueAt).toLocaleString() : '—'}</TableCell>
                <TableCell><Badge variant={statusTagVariant[item.reminderStatus] || 'outline'}>{statusTagLabel[item.reminderStatus] || item.reminderStatus}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {item.reminderStatus === 'pending' && <Button size="sm" onClick={() => confirm(item.id)}>确认完成</Button>}
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>编辑</Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(item)}>{item.enabled ? '停用' : '恢复'}</Button>
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button size="sm" variant="destructive">删除</Button>} />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>永久删除此到期项？</AlertDialogTitle>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogClose render={<Button variant="soft">取消</Button>} />
                          <AlertDialogClose render={<Button variant="destructive" onClick={() => remove(item.id)}>删除</Button>} />
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : <Empty description="没有到期项" />}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:w-110">
          <DialogHeader>
            <DialogTitle>新增到期项</DialogTitle>
            <DialogDescription>设置提醒时间与模式，到点后通过 Bark 推送到手机。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ExpiringForm value={input} onChange={setInput} tags={tags} />
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="soft">取消</Button>} />
            <LoadingButton loading={saving} disabled={!input.name || !input.dueAt} onClick={save}>保存</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingItem !== null} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="sm:w-110">
          <DialogHeader>
            <DialogTitle>编辑到期项</DialogTitle>
            <DialogDescription>修改名称、模式与提醒时间后，按新的模式继续执行。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ExpiringForm value={editingInput} onChange={setEditingInput} tags={tags} />
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="soft">取消</Button>} />
            <LoadingButton loading={editing} disabled={!editingInput.name || !editingInput.dueAt} onClick={saveEdit}>保存</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

export { ExpiringItemsPage };
