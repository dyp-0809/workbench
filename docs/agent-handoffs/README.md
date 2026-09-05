# Agent Handoffs

这是个人工作台多 Profile 协作的共享交接目录。

## 使用原则

- `CURRENT.md` 记录当前任务、阶段、负责人和下一步。
- 每个阶段只更新与自己职责相关的交接文件。
- 文件中的结论必须区分事实、假设、决策和验证证据。
- 群聊负责讨论和决策，交接文件负责跨 Profile 传递上下文。
- 未经验证的内容不得写成已完成或已通过。

## 推荐流程

```text
PRD.md
  -> UX-SPEC.md / UI-SPEC.md
  -> ADR.md / API-CONTRACT.md
  -> IMPLEMENTATION.md
  -> REVIEW.md
  -> TEST-REPORT.md
```

## 状态值

- `draft`
- `ready-for-implementation`
- `implementation-in-progress`
- `ready-for-review`
- `verified`
- `blocked`
