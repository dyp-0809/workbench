import { useEffect, useState } from 'react';
import { Button } from '@appica/ui-react/button';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { DatePicker } from '@appica/ui-react/date-picker';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@appica/ui-react/table';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Badge } from '@appica/ui-react/badge';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogClose } from '@appica/ui-react/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';
import { Plus } from '@appica/icons-react';
import dayjs from 'dayjs';
import { api, SectionCard, Empty, LoadingButton } from '@x-assistant/core';

function TaskPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('open');
  const [input, setInput] = useState({ title: '', notes: '', category: '', dueDate: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const load = async () => { setLoading(true); try { setTasks((await api(`/tasks?status=${status}`)).tasks); } finally { setLoading(false); } };
  useEffect(() => { load().catch(() => setTasks([])); }, [status]);
  const save = async () => { setSaving(true); try { await api('/tasks', { method: 'POST', body: JSON.stringify(input) }); setInput({ title: '', notes: '', category: '', dueDate: '' }); setCreateOpen(false); await load(); } finally { setSaving(false); } };
  const update = async (id, nextStatus) => { await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) }); await load(); };
  const remove = async (id) => { await api(`/tasks/${id}`, { method: 'DELETE' }); await load(); };

  return (
    <SectionCard title="待办">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Button onClick={() => setCreateOpen(true)}><Plus data-icon="start" />新增</Button>
        <Select items={{ open: '未完成', completed: '已完成', all: '全部' }} value={status} onValueChange={setStatus}>
          <SelectTrigger className="min-w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">未完成</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {loading ? <p className="text-foreground-muted">正在加载待办…</p> : tasks.length ? (
        <Table hoverableRows>
          <TableHeader>
            <TableRow><TableHead>标题</TableHead><TableHead>分类</TableHead><TableHead>截止</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">{task.title}</TableCell>
                <TableCell>{task.category ? <Badge variant="outline">{task.category}</Badge> : null}</TableCell>
                <TableCell>{task.dueDate || '未安排'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => update(task.id, task.status === 'open' ? 'completed' : 'open')}>{task.status === 'open' ? '完成' : '重新打开'}</Button>
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button size="sm" variant="destructive">删除</Button>} />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>永久删除此待办？</AlertDialogTitle>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogClose render={<Button variant="soft">取消</Button>} />
                          <AlertDialogClose render={<Button variant="destructive" onClick={() => remove(task.id)}>删除</Button>} />
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : <Empty description={status === 'completed' ? '没有已完成待办' : '没有待办'} />}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:w-110">
          <DialogHeader>
            <DialogTitle>新增待办</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field>
              <FieldLabel><span className="text-error">*</span> 标题</FieldLabel>
              <Input required value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel>备注</FieldLabel>
              <Textarea rows={3} value={input.notes} onChange={(event) => setInput({ ...input, notes: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel>分类</FieldLabel>
              <Input value={input.category} onChange={(event) => setInput({ ...input, category: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel>截止日期</FieldLabel>
              <DatePicker value={input.dueDate ? dayjs(input.dueDate).toDate() : undefined} onValueChange={(date) => setInput({ ...input, dueDate: date ? dayjs(date).format('YYYY-MM-DD') : '' })} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="soft">取消</Button>} />
            <LoadingButton loading={saving} disabled={!input.title} onClick={save}>保存</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

export { TaskPage };
