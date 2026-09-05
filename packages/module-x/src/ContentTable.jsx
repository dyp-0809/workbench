import { useEffect, useMemo, useState } from 'react';
import { Button } from '@appica/ui-react/button';
import { Badge } from '@appica/ui-react/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@appica/ui-react/table';
import { Pagination, PaginationList, PaginationItem, PaginationLink } from '@appica/ui-react/pagination';
import { ChevronLeft, ChevronRight } from '@appica/icons-react';
import { TimeField } from '@appica/ui-react/time-field';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@appica/ui-react/tooltip';
import { Empty } from '@personal-workbench/core';

function ContentTable({ packs, onEvent, onPlan }) {
  const [page, setPage] = useState(1);
  const rows = useMemo(() => packs.flatMap((pack) => pack.candidates.map((candidate) => ({ ...candidate, packId: pack.id, operatingDate: pack.operatingDate, expiresAt: pack.expiresAt, status: pack.retentionStatus }))), [packs]);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);

  return (
    <div>
      <TooltipProvider>
        <div className="overflow-x-auto">
          <Table hoverableRows className="min-w-[80rem] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-2/5">内容</TableHead>
              <TableHead>主题</TableHead>
              <TableHead>形态</TableHead>
              <TableHead>推荐</TableHead>
              <TableHead>建议时段</TableHead>
              <TableHead>计划时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>到期</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="w-2/5">
                  <Tooltip>
                    <TooltipTrigger render={<button type="button" className="block w-full cursor-help border-0 bg-transparent p-0 text-start font-inherit text-inherit truncate focus-visible:ring-2 focus-visible:ring-ring" />}>
                      {row.content}
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xl whitespace-pre-wrap break-words">
                      {row.content}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell>{row.topic}</TableCell>
                <TableCell>{row.format}</TableCell>
                <TableCell><Badge variant={row.recommendation === 'explore' ? 'warning' : 'info'}>{row.recommendation === 'explore' ? '探索' : '推荐'}</Badge></TableCell>
                <TableCell>{row.suggestedPublishTime ? <Badge variant="outline">建议 {row.suggestedPublishTime}</Badge> : '—'}</TableCell>
                <TableCell>
                  <TimeField
                    aria-label={`设置「${row.content}」的计划发布时间`}
                    disabled={row.status === 'expired'}
                    value={row.plannedPublishTime || row.suggestedPublishTime || '09:00'}
                    onValueChange={(time) => onPlan(row.id, time)}
                  />
                </TableCell>
                <TableCell><Badge variant={row.status === 'expired' ? 'error' : 'success'}>{row.status === 'expired' ? '已过期' : '有效'}</Badge></TableCell>
                <TableCell>{new Date(row.expiresAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(row.content).then(() => onEvent(row.id, 'copied'))}>复制</Button>
                    <Button size="sm" disabled={row.status === 'expired'} onClick={() => onPlan(row.id, row.plannedPublishTime ? null : row.suggestedPublishTime || '09:00')}>{row.plannedPublishTime ? '移出计划' : '采用建议'}</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow><TableCell colSpan={9}><Empty description="还没有符合条件的内容" /></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </TooltipProvider>
      {totalPages > 1 && (
        <Pagination className="mt-4 justify-end">
          <PaginationList>
            <PaginationItem>
              <PaginationLink href="#!" aria-label="上一页" className="px-0" disabled={safePage === 1} onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}><ChevronLeft /></PaginationLink>
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <PaginationItem key={p}>
                <PaginationLink href="#!" active={p === safePage} onClick={(e) => { e.preventDefault(); setPage(p); }}>{p}</PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationLink href="#!" aria-label="下一页" className="px-0" disabled={safePage === totalPages} onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}><ChevronRight /></PaginationLink>
            </PaginationItem>
          </PaginationList>
        </Pagination>
      )}
    </div>
  );
}

export { ContentTable };
