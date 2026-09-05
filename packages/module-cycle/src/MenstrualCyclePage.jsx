import { useEffect, useMemo, useState } from 'react';
import { Button } from '@appica/ui-react/button';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@appica/ui-react/table';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Badge } from '@appica/ui-react/badge';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogClose } from '@appica/ui-react/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';
import { Plus } from '@appica/icons-react';
import { api, Chart, Empty, LoadingButton, SectionCard } from '@personal-workbench/core';

const EMPTY_CYCLE = { flow: 'medium', symptoms: '', notes: '' };
const EMPTY_MOOD_LOG = { loggedOn: todayDate(), mood: 3, notes: '' };
const FLOW_LABELS = { light: '少量', medium: '适中', heavy: '较多' };
const MOOD_LABELS = { 1: '低落', 2: '偏低', 3: '平稳', 4: '愉悦', 5: '很好' };

function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createEmptyCycle() {
  const startDate = todayDate();
  return { ...EMPTY_CYCLE, startDate, endDate: addDays(startDate, 5) };
}

function nextPeriodPrediction(cycles) {
  const starts = cycles.map((cycle) => cycle.startDate).sort();
  if (starts.length < 2) return null;
  const intervals = starts.slice(1).map((startDate, index) => Math.round((Date.parse(`${startDate}T00:00:00Z`) - Date.parse(`${starts[index]}T00:00:00Z`)) / 86_400_000));
  const recentIntervals = intervals.slice(-6);
  const averageCycleLength = Math.round(recentIntervals.reduce((sum, interval) => sum + interval, 0) / recentIntervals.length);
  const today = todayDate();
  let predictedDate = addDays(starts.at(-1), averageCycleLength);
  while (predictedDate < today) predictedDate = addDays(predictedDate, averageCycleLength);
  return { predictedDate, averageCycleLength, intervalCount: recentIntervals.length };
}

function cycleDuration(startDate, endDate) {
  if (!endDate) return null;
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
}

function cssLengthInPixels(value, fontSize) {
  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue)) return 0;
  return value.trim().endsWith('rem') ? numericValue * Number.parseFloat(fontSize) : numericValue;
}

function CycleForm({ value, onChange }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel><span className="text-error">*</span> 开始日期</FieldLabel>
          <Input type="date" required value={value.startDate} onChange={(event) => onChange({ ...value, startDate: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel>结束日期</FieldLabel>
          <Input type="date" min={value.startDate || undefined} value={value.endDate} onChange={(event) => onChange({ ...value, endDate: event.target.value })} />
        </Field>
      </div>
      <Field>
        <FieldLabel>经量</FieldLabel>
        <Select items={FLOW_LABELS} value={value.flow} onValueChange={(flow) => onChange({ ...value, flow })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="light">少量</SelectItem>
            <SelectItem value="medium">适中</SelectItem>
            <SelectItem value="heavy">较多</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>症状</FieldLabel>
        <Textarea rows={2} value={value.symptoms} placeholder="如：腹痛、疲劳、情绪变化（可选）" onChange={(event) => onChange({ ...value, symptoms: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel>备注</FieldLabel>
        <Textarea rows={3} value={value.notes} placeholder="记录睡眠、用药或其他需要回顾的信息（可选）" onChange={(event) => onChange({ ...value, notes: event.target.value })} />
      </Field>
    </div>
  );
}

function MoodLogForm({ value, onChange }) {
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel><span className="text-error">*</span> 记录日期</FieldLabel>
        <Input type="date" required value={value.loggedOn} onChange={(event) => onChange({ ...value, loggedOn: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel>情绪</FieldLabel>
        <Select items={MOOD_LABELS} value={String(value.mood)} onValueChange={(mood) => onChange({ ...value, mood: Number(mood) })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">低落</SelectItem>
            <SelectItem value="2">偏低</SelectItem>
            <SelectItem value="3">平稳</SelectItem>
            <SelectItem value="4">愉悦</SelectItem>
            <SelectItem value="5">很好</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>备注</FieldLabel>
        <Textarea rows={3} value={value.notes} placeholder="记录可能影响情绪的事项（可选）" onChange={(event) => onChange({ ...value, notes: event.target.value })} />
      </Field>
    </div>
  );
}

function MenstrualCyclePage() {
  const [cycles, setCycles] = useState([]);
  const [moodLogs, setMoodLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState(null);
  const [input, setInput] = useState(createEmptyCycle);
  const [saving, setSaving] = useState(false);
  const [moodLogOpen, setMoodLogOpen] = useState(false);
  const [editingMoodLog, setEditingMoodLog] = useState(null);
  const [moodInput, setMoodInput] = useState(EMPTY_MOOD_LOG);
  const [moodSaving, setMoodSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cycleResult, moodLogResult] = await Promise.all([api('/menstrual-cycles'), api('/menstrual-mood-logs')]);
      setCycles(cycleResult.cycles);
      setMoodLogs(moodLogResult.logs);
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const monthlyCycles = useMemo(() => {
    const cycleByMonth = new Map();
    for (const cycle of [...cycles].sort((left, right) => left.startDate.localeCompare(right.startDate))) {
      cycleByMonth.set(cycle.startDate.slice(0, 7), cycle);
    }
    return [...cycleByMonth.values()].slice(-12);
  }, [cycles]);
  const prediction = useMemo(() => nextPeriodPrediction(cycles), [cycles]);
  const moodWindow = useMemo(() => {
    if (!prediction) return [];
    const moodByDate = new Map(moodLogs.map((log) => [log.loggedOn, log]));
    return Array.from({ length: 15 }, (_, index) => {
      const date = addDays(prediction.predictedDate, index - 14);
      return { date, moodLog: moodByDate.get(date) || null };
    });
  }, [moodLogs, prediction]);
  const hasMoodInPredictionWindow = moodWindow.some(({ moodLog }) => moodLog);


  const themeClassName = document.documentElement.className;
  const chartColors = useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      primary: styles.getPropertyValue('--primary').trim(),
      info: styles.getPropertyValue('--info-emphasis').trim(),
      muted: styles.getPropertyValue('--foreground-muted').trim(),
      border: styles.getPropertyValue('--border').trim(),
      radius: cssLengthInPixels(styles.getPropertyValue('--radius-md'), styles.fontSize)
    };
  }, [themeClassName]);

  const chartOption = useMemo(() => ({
    color: [chartColors.primary],
    grid: { top: 16, right: 88, bottom: 32, left: 72 },
    tooltip: {
      trigger: 'axis',
      formatter: (items) => {
        const entries = Array.isArray(items) ? items : [items];
        const periodItem = entries.find((item) => item?.seriesName === '经期');
        const fallbackItem = periodItem || entries.find((item) => Number.isInteger(item?.dataIndex)) || entries[0];
        const month = periodItem?.axisValue || fallbackItem?.axisValue || fallbackItem?.name;
        const cycle = monthlyCycles[fallbackItem?.dataIndex] || monthlyCycles.find((item) => item.startDate.slice(0, 7) === month);
        if (!cycle) return '';
        const duration = cycleDuration(cycle.startDate, cycle.endDate);
        return `${cycle.startDate.slice(0, 7)}<br/>经期：${cycle.startDate}${cycle.endDate ? ` 至 ${cycle.endDate}` : ' 起'}<br/>${duration ? `时长：${duration} 天` : '进行中'}`;
      }
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 36,
      interval: 5,
      axisLine: { lineStyle: { color: chartColors.border } },
      axisLabel: { color: chartColors.muted, formatter: (value) => value ? (value > 31 ? `次月 ${value - 31} 日` : `${value} 日`) : '' },
      splitLine: { lineStyle: { color: chartColors.border } }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: monthlyCycles.map((cycle) => cycle.startDate.slice(0, 7)),
      axisLine: { lineStyle: { color: chartColors.border } },
      axisLabel: { color: chartColors.muted }
    },
    series: [
      {
        name: '日期偏移',
        type: 'bar',
        stack: 'period',
        silent: true,
        data: monthlyCycles.map((cycle) => Number(cycle.startDate.slice(-2)) - 1),
        itemStyle: { color: 'transparent' },
        emphasis: { itemStyle: { color: 'transparent' } }
      },
      {
        name: '经期',
        type: 'bar',
        stack: 'period',
        barWidth: 18,
        data: monthlyCycles.map((cycle) => cycleDuration(cycle.startDate, cycle.endDate) || 1),
        label: {
          show: true,
          position: 'right',
          color: chartColors.muted,
          formatter: ({ dataIndex }) => {
            const cycle = monthlyCycles[dataIndex];
            return cycle.endDate ? `${cycle.startDate.slice(5)}–${cycle.endDate.slice(5)}` : `${cycle.startDate.slice(5)} 起`;
          }
        },
        itemStyle: { borderRadius: chartColors.radius },
        emphasis: { disabled: true }
      },
    ]
  }), [chartColors, monthlyCycles]);

  const moodChartOption = useMemo(() => ({
    color: [chartColors.primary],
    grid: { top: 16, right: 24, bottom: 32, left: 56 },
    tooltip: {
      trigger: 'axis',
      formatter: (items) => {
        const entry = moodWindow[items[0]?.dataIndex];
        if (!entry) return '';
        return entry.moodLog ? `${entry.date}<br/>情绪：${MOOD_LABELS[entry.moodLog.mood]}${entry.moodLog.notes ? `<br/>备注：${entry.moodLog.notes}` : ''}` : `${entry.date}<br/>未记录`;
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: moodWindow.map(({ date }) => date.slice(5)),
      axisLine: { lineStyle: { color: chartColors.border } },
      axisLabel: { color: chartColors.muted, hideOverlap: true }
    },
    yAxis: {
      type: 'value',
      min: 1,
      max: 5,
      interval: 1,
      axisLabel: { color: chartColors.muted, formatter: (value) => MOOD_LABELS[value] },
      splitLine: { lineStyle: { color: chartColors.border } }
    },
    series: [{ name: '情绪评分', type: 'line', data: moodWindow.map(({ moodLog }) => moodLog?.mood ?? null), connectNulls: false, symbolSize: 8, lineStyle: { width: 3 } }]
  }), [chartColors, moodWindow]);

  const save = async (id) => {
    setSaving(true);
    try {
      const body = { ...input, endDate: input.endDate || null };
      await api(id ? `/menstrual-cycles/${id}` : '/menstrual-cycles', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setInput(createEmptyCycle());
      setCreateOpen(false);
      setEditingCycle(null);
      await load();
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (cycle) => {
    setInput({ startDate: cycle.startDate, endDate: cycle.endDate || '', flow: cycle.flow, symptoms: cycle.symptoms, notes: cycle.notes });
    setEditingCycle(cycle);
  };

  const remove = async (id) => {
    try {
      await api(`/menstrual-cycles/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    }
  };

  const saveMoodLog = async (id) => {
    setMoodSaving(true);
    try {
      await api(id ? `/menstrual-mood-logs/${id}` : '/menstrual-mood-logs', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(moodInput) });
      setMoodInput(EMPTY_MOOD_LOG);
      setMoodLogOpen(false);
      setEditingMoodLog(null);
      await load();
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    } finally {
      setMoodSaving(false);
    }
  };

  const openEditMoodLog = (moodLog) => {
    setMoodInput({ loggedOn: moodLog.loggedOn, mood: moodLog.mood, notes: moodLog.notes });
    setEditingMoodLog(moodLog);
  };

  const removeMoodLog = async (id) => {
    try {
      await api(`/menstrual-mood-logs/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="下次经期预测">
        {loading ? <p className="text-foreground-muted">正在计算下次经期…</p> : prediction ? (
          <div className="grid grid-cols-24 gap-6">
            <div className="col-span-24 xl:col-span-8">
              <p className="m-0 text-sm text-foreground-muted">预测开始日期</p>
              <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-foreground-intense">{prediction.predictedDate}</div>
              <p className="mt-3 mb-0 text-sm text-foreground-muted">基于最近 {prediction.intervalCount} 个相邻周期的平均 {prediction.averageCycleLength} 天估算；仅供记录和自我观察参考。</p>
            </div>
            <div className="col-span-24 xl:col-span-16 xl:border-s xl:border-border xl:ps-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-medium">预测日前 14 天情绪波动</div><p className="m-0 text-sm text-foreground-muted">每天记录一次情绪，便于回顾经前变化。</p></div>
                <Button size="sm" variant="outline" onClick={() => { setMoodInput({ ...EMPTY_MOOD_LOG, loggedOn: todayDate() }); setMoodLogOpen(true); }}><Plus data-icon="start" />记录情绪</Button>
              </div>
              {hasMoodInPredictionWindow ? <Chart option={moodChartOption} height={220} /> : <Empty description="预测窗口内暂无情绪记录，点击「记录情绪」开始追踪" />}
            </div>
          </div>
        ) : <Empty description="至少记录两次经期开始日期后，才能计算下次经期预测。" />}
      </SectionCard>

      <SectionCard title="每月经期日期">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-sm text-foreground-muted">最近 12 个月按每月日期轴展示经期区间；横条的位置表示开始日期，长度表示经期天数。</p>
        </div>
        {loading ? <p className="text-foreground-muted">正在加载经期记录…</p> : monthlyCycles.length ? <Chart option={chartOption} height={300} /> : <Empty description="暂无经期记录，新增记录后将在这里显示每月统计" />}
      </SectionCard>

      <SectionCard title="经期详细信息">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-sm text-foreground-muted">记录经期日期、经量、症状和备注，数据只保留在本机。</p>
          <Button onClick={() => { setInput(createEmptyCycle()); setCreateOpen(true); }}><Plus data-icon="start" />新增经期记录</Button>
        </div>
        {loading ? <p className="text-foreground-muted">正在加载经期记录…</p> : cycles.length ? (
          <Table hoverableRows>
            <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>时长</TableHead><TableHead>经量</TableHead><TableHead>症状</TableHead><TableHead>备注</TableHead><TableHead className="whitespace-nowrap text-center">操作</TableHead></TableRow></TableHeader>
            <TableBody>
              {cycles.map((cycle) => {
                const duration = cycleDuration(cycle.startDate, cycle.endDate);
                return (
                  <TableRow key={cycle.id}>
                    <TableCell><div className="font-medium tabular-nums">{cycle.startDate}{cycle.endDate ? ` 至 ${cycle.endDate}` : ''}</div>{!cycle.endDate && <div className="mt-0.5 text-xs text-foreground-muted">进行中</div>}</TableCell>
                    <TableCell className="tabular-nums">{duration ? `${duration} 天` : '—'}</TableCell>
                    <TableCell><Badge variant="outline" size="sm">{FLOW_LABELS[cycle.flow]}</Badge></TableCell>
                    <TableCell className="max-w-64 whitespace-normal text-foreground-muted">{cycle.symptoms || '—'}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal text-foreground-muted">{cycle.notes || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-center"><div className="flex justify-center gap-1"><Button size="sm" variant="outline" onClick={() => openEdit(cycle)}>编辑</Button><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="destructive">删除</Button>} /><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这条经期记录？</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogClose render={<Button variant="soft">取消</Button>} /><AlertDialogClose render={<Button variant="destructive" onClick={() => remove(cycle.id)}>删除</Button>} /></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : <Empty description="暂无经期记录，点击「新增经期记录」开始维护" />}
      </SectionCard>

      <SectionCard title="经前情绪记录">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-sm text-foreground-muted">每日一条情绪评分，图表会自动筛选预测日前 14 天的数据。</p>
          <Button onClick={() => { setMoodInput({ ...EMPTY_MOOD_LOG, loggedOn: todayDate() }); setMoodLogOpen(true); }}><Plus data-icon="start" />记录情绪</Button>
        </div>
        {loading ? <p className="text-foreground-muted">正在加载情绪记录…</p> : moodLogs.length ? (
          <Table hoverableRows>
            <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>情绪</TableHead><TableHead>备注</TableHead><TableHead className="whitespace-nowrap text-center">操作</TableHead></TableRow></TableHeader>
            <TableBody>{moodLogs.map((moodLog) => <TableRow key={moodLog.id}><TableCell className="font-medium tabular-nums">{moodLog.loggedOn}</TableCell><TableCell><Badge variant="outline" size="sm">{MOOD_LABELS[moodLog.mood]}</Badge></TableCell><TableCell className="max-w-96 whitespace-normal text-foreground-muted">{moodLog.notes || '—'}</TableCell><TableCell className="whitespace-nowrap text-center"><div className="flex justify-center gap-1"><Button size="sm" variant="outline" onClick={() => openEditMoodLog(moodLog)}>编辑</Button><AlertDialog><AlertDialogTrigger render={<Button size="sm" variant="destructive">删除</Button>} /><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这条情绪记录？</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogClose render={<Button variant="soft">取消</Button>} /><AlertDialogClose render={<Button variant="destructive" onClick={() => removeMoodLog(moodLog.id)}>删除</Button>} /></AlertDialogFooter></AlertDialogContent></AlertDialog></div></TableCell></TableRow>)}</TableBody>
          </Table>
        ) : <Empty description="暂无情绪记录，点击「记录情绪」开始追踪" />}
      </SectionCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="sm:w-110"><DialogHeader><DialogTitle>新增经期记录</DialogTitle><DialogDescription>结束日期可以暂不填写，待经期结束后再补充。</DialogDescription></DialogHeader><DialogBody><CycleForm value={input} onChange={setInput} /></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={saving} disabled={!input.startDate} onClick={() => save()}>保存</LoadingButton></DialogFooter></DialogContent></Dialog>
      <Dialog open={editingCycle !== null} onOpenChange={(open) => { if (!open) setEditingCycle(null); }}><DialogContent className="sm:w-110"><DialogHeader><DialogTitle>编辑经期记录</DialogTitle><DialogDescription>可补充结束日期、症状和其他回顾信息。</DialogDescription></DialogHeader><DialogBody><CycleForm value={input} onChange={setInput} /></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={saving} disabled={!input.startDate} onClick={() => save(editingCycle.id)}>保存</LoadingButton></DialogFooter></DialogContent></Dialog>
      <Dialog open={moodLogOpen} onOpenChange={setMoodLogOpen}><DialogContent className="sm:w-110"><DialogHeader><DialogTitle>记录情绪</DialogTitle><DialogDescription>每天仅保留一条记录；如需修改当天内容，请编辑已有记录。</DialogDescription></DialogHeader><DialogBody><MoodLogForm value={moodInput} onChange={setMoodInput} /></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={moodSaving} disabled={!moodInput.loggedOn} onClick={() => saveMoodLog()}>保存</LoadingButton></DialogFooter></DialogContent></Dialog>
      <Dialog open={editingMoodLog !== null} onOpenChange={(open) => { if (!open) setEditingMoodLog(null); }}><DialogContent className="sm:w-110"><DialogHeader><DialogTitle>编辑情绪记录</DialogTitle><DialogDescription>更新当天的情绪评分和备注。</DialogDescription></DialogHeader><DialogBody><MoodLogForm value={moodInput} onChange={setMoodInput} /></DialogBody><DialogFooter><DialogClose render={<Button variant="soft">取消</Button>} /><LoadingButton loading={moodSaving} disabled={!moodInput.loggedOn} onClick={() => saveMoodLog(editingMoodLog.id)}>保存</LoadingButton></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

export { MenstrualCyclePage };
