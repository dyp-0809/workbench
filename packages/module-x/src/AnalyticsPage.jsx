import { useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { Bolt, FileText } from '@appica/icons-react';
import dayjs from 'dayjs';
import { SectionCard, Empty, Metric, Chart, donutOption } from '@personal-workbench/core';

function AnalyticsPage({ packs, tasks, expiringItems }) {
  const [days, setDays] = useState(30);
  const start = dayjs().subtract(days - 1, 'day').startOf('day');
  const daily = Array.from({ length: days }, (_, index) => ({ date: start.add(index, 'day').format('MM-DD'), value: 0 }));
  const indexByDate = new Map(daily.map((entry, index) => [entry.date, index]));
  for (const pack of packs) { const index = indexByDate.get(dayjs(pack.createdAt).format('MM-DD')); if (index !== undefined) daily[index].value += pack.candidates.length; }
  const topicMap = new Map();
  for (const candidate of packs.flatMap((pack) => pack.candidates)) topicMap.set(candidate.topic || '未分类', (topicMap.get(candidate.topic || '未分类') || 0) + 1);
  const topics = [...topicMap].map(([name, value]) => ({ name, value }));
  const statuses = [{ name: '已逾期', value: expiringItems.filter((item) => item.reminderStatus === 'overdue').length }, { name: '待处理', value: expiringItems.filter((item) => item.reminderStatus === 'due').length }, { name: '正常', value: expiringItems.filter((item) => item.reminderStatus === 'upcoming').length }].filter((item) => item.value);
  const palette = ['#42d5ff', '#7567ff', '#b46bff', '#ff9c6e'];
  const lineOption = { grid: { top: 28, right: 12, bottom: 28, left: 32 }, xAxis: { type: 'category', data: daily.map((item) => item.date), axisLine: { show: false }, axisTick: { show: false } }, yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(130,140,190,.16)' } } }, series: [{ type: 'line', data: daily.map((item) => item.value), smooth: true, showSymbol: false, lineStyle: { color: '#7567ff', width: 3 }, areaStyle: { color: 'rgba(117,103,255,.18)' } }] };
  const pieOption = (data) => ({ color: palette, tooltip: { trigger: 'item' }, legend: { bottom: 0, textStyle: { color: '#8993b4' } }, series: [{ type: 'pie', radius: ['54%', '78%'], label: { show: false }, data }] });
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-foreground-muted">观察窗口</span>
        <Select items={[{ value: 7, label: '近 7 天' }, { value: 30, label: '近 30 天' }, { value: 90, label: '近 90 天' }]} value={days} onValueChange={setDays}>
          <SelectTrigger className="min-w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{[7, 30, 90].map((value) => <SelectItem key={value} value={value}>近 {value} 天</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-24 gap-4">
        <div className="col-span-24 xl:col-span-15">
          <SectionCard title="创作产出趋势"><Chart option={lineOption} height={260} /></SectionCard>
        </div>
        <div className="col-span-24 xl:col-span-9">
          <SectionCard title="主题分布">{topics.length ? <Chart option={pieOption(topics)} height={260} /> : <Empty description="积累候选后显示主题分布" />}</SectionCard>
        </div>
        <div className="col-span-24 xl:col-span-12">
          <SectionCard title="候选漏斗">
            <div className="grid grid-cols-24 gap-4">
              <Metric title="已生成" value={packs.flatMap((pack) => pack.candidates).length} icon={<Bolt />} />
              <Metric title="待处理" value={packs.flatMap((pack) => pack.candidates).length} icon={<FileText />} />
            </div>
            <p className="mt-2 text-sm text-foreground-muted">复制、加入发布计划和真实发布回填将逐步形成漏斗转化。</p>
          </SectionCard>
        </div>
        <div className="col-span-24 xl:col-span-12">
          <SectionCard title="个人执行">
            {statuses.length ? <Chart option={pieOption(statuses)} height={190} /> : <Empty description="没有待处理到期项" />}
            <p className="text-sm text-foreground-muted">未完成待办 {tasks.length} 项</p>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

export { AnalyticsPage };
