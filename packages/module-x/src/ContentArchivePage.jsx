import { Button } from '@appica/ui-react/button';
import { Badge } from '@appica/ui-react/badge';
import { Card } from '@appica/ui-react/card';
import { Empty, SectionCard } from '@personal-workbench/core';

const performanceLabels = {
  pending: { label: '待评估', variant: 'warning' },
  good: { label: '流量表现好', variant: 'success' },
  poor: { label: '流量表现一般', variant: 'outline' }
};

function formatArchiveTime(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function ContentArchivePage({ entries, onPerformance }) {
  return (
    <SectionCard title={`内容归档 (${entries.length})`}>
      {entries.length === 0 ? <Empty description="从待发布计划池复制内容后，会自动进入这里等待流量评估。" /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {entries.map((entry) => {
            const performance = performanceLabels[entry.performance];
            return (
              <Card key={entry.id} className="flex flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
                    <p className="mt-2 text-xs text-foreground-muted">{entry.topic} · {entry.format} · 归档于 {formatArchiveTime(entry.archivedAt)}</p>
                  </div>
                  <Badge variant={performance.variant} className="shrink-0">{performance.label}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={entry.performance === 'good' ? 'default' : 'outline'} onClick={() => onPerformance(entry.id, 'good')}>标记流量好</Button>
                  <Button size="sm" variant={entry.performance === 'poor' ? 'default' : 'outline'} onClick={() => onPerformance(entry.id, 'poor')}>标记流量一般</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export { ContentArchivePage };
