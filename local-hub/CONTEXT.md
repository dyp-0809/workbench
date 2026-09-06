# Local Hub

The local data context that assembles personal-workbench facts into trustworthy workspace context for the user-facing shell.

## Language

**真实事实**:
A value read from an available local source and permitted by the current source visibility policy. Derived guesses and placeholder values are not real facts.
_Avoid_: 模拟数据, AI 猜测

**提示规则**:
An explicit, inspectable condition that turns one or more real facts into an eligible homepage action prompt with a reason and a processing action.
_Avoid_: 黑盒排序, 随机策略

**来源可用性**:
The state that says whether a source is configured and currently able to provide facts. An unavailable source cannot create a prompt.
_Avoid_: 没有异常

**提示优先级**:
The deterministic order applied to eligible prompt candidates, with urgency and time context taking precedence over volume or novelty.
_Avoid_: 热度排序

**经期默认可见性**:
The homepage source is enabled by default, so real menstrual records and details may be exposed when available; missing, unreliable, or absent prediction fields produce no inferred prediction.
_Avoid_: 默认关闭经期

**来源隔离**:
When one source fails or is unavailable, omit only that source's candidates while preserving successful sources and their status.
_Avoid_: 聚合失败即清空