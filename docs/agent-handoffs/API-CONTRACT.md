# API 与数据契约

## 状态

`implemented-observed`

## 关联架构决策

- ADR：`./ADR.md`
- 首页实现交接：`./IMPLEMENTATION.md`

## 接口清单

| 方法 | 路径 | 用途 | 认证 | 状态 |
|---|---|---|---|---|
| GET | `/v1/dashboard` | 返回工作台首页聚合数据、日历事件、个性化提示与股票历史状态 | 本机扩展配对令牌 | 已实现并实测 |

## 响应契约

### 成功

```json
{
  "calendar": {
    "timezone": "Asia/Shanghai",
    "days": [
      { "date": "YYYY-MM-DD", "lunarLabel": "农历七月初十", "hasEvents": false }
    ],
    "events": [
      {
        "id": "task:<id>",
        "date": "YYYY-MM-DD",
        "time": null,
        "title": "待办标题",
        "type": "task",
        "status": "open",
        "action": { "label": "去处理", "page": "tasks" }
      }
    ]
  },
  "personalizedPrompt": {
    "kind": "expiring",
    "priority": 100,
    "title": "先处理已逾期事项：事项名称",
    "reason": "有一项到期提醒已经逾期",
    "action": { "label": "去查看", "page": "expiring" }
  },
  "personalizedPrompts": [],
  "privacy": { "menstrualEnabled": false },
  "menstrualPrediction": null,
  "personalizedSources": {
    "tasks": { "configured": true, "available": true },
    "expiring": { "configured": true, "available": true },
    "menstrual": { "configured": true, "available": false },
    "stocks": { "configured": true, "available": false },
    "specialDays": { "configured": false, "available": false }
  },
  "stockHistory": { "available": false, "points": [] }
}
```

### 字段规则

- `calendar.days` 返回当前日期前后 14 天共 42 天；`date` 是 `Asia/Shanghai` 的纯日期键。
- `lunarLabel` 使用本地 `lunar-javascript@1.7.7` 离线计算，MIT 许可；无法计算时为 `null`，前端显示“暂无农历信息”。
- `calendar.events` 当前由有日期的开放待办和到期项生成；`time: null` 的事件由前端统一排在有时间事件之后。
- `personalizedPrompt` 保留为兼容字段，等于 `personalizedPrompts[0]`；`personalizedPrompts` 返回按优先级排列的真实候选，前端可基于已读索引轮换，但不能随机伪造。
- 候选优先级为：经期即将到来 `110`、股票异常 `100`、待办 `20`、即将到期 `10`；当前数据源只会产生待办和到期候选；无候选时返回单条励志兜底文案。
- `privacy.menstrualEnabled` 默认 `false`，因此当前 `menstrualPrediction` 固定为 `null`；隐私开关接入且存在真实周期数据后才允许返回预测。
- `stockHistory.points` 没有历史快照数据源时必须为空，不允许静态或模拟点位。

## 缺省与隐私规则

- 无农历数据：`lunarLabel: null`。
- 无股票历史：`stockHistory: { available: false, points: [] }`。
- 经期默认不向首页回传详情；当前来源状态为不可用，待隐私开关与聚合逻辑正式接入后再开放。
- 特殊日子暂无数据源，返回 `configured: false, available: false`，不推断节日或个人纪念日。

## 失败处理

| HTTP 状态 | 错误码 | 含义 | 客户端处理 |
|---:|---|---|---|
| 401 | - | 本机服务未配对或令牌失效 | 显示配对提示，不展示伪造数据 |
| 500 | - | 聚合数据读取或服务内部错误 | 保留页面结构，显示失败态并允许刷新 |

## 观测记录

- 当前运行中的 `http://127.0.0.1:4318/v1/dashboard` 实测包含 `calendar`、`personalizedPrompt`、`personalizedSources`、`stockHistory`。
- 实测 `calendar.days.length = 42`，农历非空数量为 `42/42`。
- 2026-01-01、2027-06-15、2028-12-31 已通过 `lunar-javascript` 独立边界验证。
- 股票历史当前仍为空态；真实股票点位尚未接入。
