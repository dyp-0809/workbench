import { Button } from '@appica/ui-react/button';
import { Badge } from '@appica/ui-react/badge';
import { Card } from '@appica/ui-react/card';
import { Empty, SectionCard } from '@personal-workbench/core';

function formatPublishDate(date) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`));
}

function groupPlannedCandidatesByDate(packs) {
  const candidatesByDate = new Map();
  for (const pack of packs) {
    if (pack.retentionStatus !== 'active' || !pack.operatingDate) continue;
    for (const candidate of pack.candidates) {
      if (!candidate.plannedPublishTime) continue;
      const candidates = candidatesByDate.get(pack.operatingDate) || [];
      candidates.push(candidate);
      candidatesByDate.set(pack.operatingDate, candidates);
    }
  }
  return [...candidatesByDate.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, candidates]) => ({ date, candidates: candidates.sort((left, right) => left.plannedPublishTime.localeCompare(right.plannedPublishTime)) }));
}

function PublicationPlanPool({ packs, onCopy, onPlan }) {
  const planGroups = groupPlannedCandidatesByDate(packs);
  const plannedCount = planGroups.reduce((count, group) => count + group.candidates.length, 0);

  return (
    <SectionCard title={`待发布计划池 (${plannedCount})`} className="mb-4">
      {planGroups.length === 0 ? <Empty description="将内容加入计划后，会按发布日期显示在这里。" /> : (
        <div className="grid gap-4">
          {planGroups.map(({ date, candidates }) => (
            <Card key={date} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-border-muted px-4 py-3">
                <div>
                  <p className="font-medium text-foreground-intense">{formatPublishDate(date)}</p>
                  <p className="text-sm text-foreground-muted">{candidates.length} 条待发布内容</p>
                </div>
                <Badge variant="outline">{date}</Badge>
              </div>
              <ol>
                {candidates.map((candidate) => (
                  <li key={candidate.id} className="flex items-start gap-3 border-b border-border-muted px-4 py-3 last:border-b-0">
                    <Badge variant="info" className="shrink-0">{candidate.plannedPublishTime}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm leading-6">{candidate.content}</p>
                      <p className="mt-1 text-xs text-foreground-muted">{candidate.topic} · {candidate.format}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => onCopy(candidate.id, candidate.content)}>复制</Button>
                      <Button size="sm" variant="outline" onClick={() => onPlan(candidate.id, null)}>移出</Button>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export { PublicationPlanPool };
