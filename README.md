# X Assistant

X Assistant 是一个面向 X 用户的内容辅助工具，帮助发现可复用话题、形成原创内容、优化推文，并在适合时生成回复草稿。项目包含 Chrome 浏览器扩展、GitHub Pages H5 页面和 iOS 快捷指令。

## 功能

- 以「原创创作」为默认入口，可读取当前 X 帖子、带入当前页热门候选，或在 H5 从粘贴板带入热门话题；素材来源会明确显示且可随时清空；
- 可先根据参考素材生成三份不同的新增价值候选，再由用户选择、修改或补充自己的判断、经验、分析、反例或背景；
- 支持原创短帖、Thread 和 Article 三种内容形态，并给出原创增量判断与补充建议；
- 原创内容默认不超过 100 个字符，用户可在 20–2000 个字符之间调整上限；
- 读取当前 X 帖子和当前页面已加载的可见评论；
- 热门候选会保留作者、链接、读取时间和互动快照，再一键带入原创创作作为可追溯参考素材；
- 生成回复判断、风险提示、切入角度和多条回复草稿；
- 回复决策会在直接回复、原创短帖、扩展长帖和暂不发布之间给出动作建议；
- 回复草稿支持 1–5 档人味程度，默认使用中间档“平衡”；
- 原创短帖和回复草稿默认使用自然口语，正常生成时不以终止标点收尾；原创内容按字数上限截断时保留省略号提示；
- 支持全部、代码、股票、心情、人生、职场、AI、生活、读书感悟、旅行、风景等内容类型；
- 支持中文、English、Tiếng Việt、日本語和한국어；
- 非中文内容可同时返回中文翻译；
- DeepSeek 模型列表自动获取和连接状态检测；
- H5 与 Chrome 扩展共用内容判断和生成模块；
- 支持复制草稿，人工确认后发布。

项目不会自动发布回复，不会自动点赞、转发、关注，也不会读取 X Cookie、密码或 Token。原创增量判断是写作辅助，不代表 X 官方原创资格或收益保证。

## 目录

```text
h5/                    GitHub Pages H5 页面
background.js          Chrome 扩展后台脚本
content.js             X 页面内容提取脚本
manifest.json          Chrome Manifest V3 配置
options.html/js        扩展设置页面
sidepanel.html/js      扩展侧栏
h5/idea-engine.js      H5 与扩展共享的内容判断和生成模块
ios-shortcuts/         iOS 快捷指令和说明
```

## 使用 H5

1. 在 GitHub 仓库 `Settings → Pages` 中将 Source 设置为 `GitHub Actions`；
2. 推送 `master` 分支后，Pages workflow 会自动部署 `h5/`；
3. 打开部署后的 HTTPS 地址；
4. 在页面右上角设置中填写 DeepSeek API Key；
5. 点击「检测连接」获取当前 Key 可用的模型；
6. 在「原创创作」中读取或粘贴参考素材，调整字数上限，补充自己的新增价值并选择内容形态；也可以切换到「回复建议」「推文优化」。

API Key 只保存在当前浏览器的本地存储中。不要把 API Key 写入代码、提交记录或 GitHub Actions 配置。H5 直接从浏览器请求模型接口，请根据自己的 API 账户和服务条款使用。

## 安装 Chrome 扩展

1. 打开 Chrome 的 `chrome://extensions/`；
2. 开启右上角「开发者模式」；
3. 点击「加载已解压的扩展程序」；
4. 选择本仓库根目录；
5. 打开 X 页面并点击扩展图标；
6. 打开扩展设置填写 API Key，或从侧栏顶部的设置按钮进入；
7. 返回侧栏顶部选择服务商和模型，点击“检测模型”或“获取模型列表”。

修改扩展代码后，在 `chrome://extensions/` 对 X Assistant 点击「重新加载」。GitHub Pages 部署不会自动更新本地开发版扩展。

## 模型接口

默认支持：

- DeepSeek 官方 API：`https://api.deepseek.com`；
- OpenAI-compatible Chat Completions 接口。

DeepSeek 模型列表通过官方 `/models` 接口获取，生成请求使用 `/chat/completions`。

## 自动部署

`.github/workflows/pages.yml` 只在以下内容变化时部署：

- `h5/**`；
- `.github/workflows/pages.yml`。

部署任务需要以下 GitHub Actions 权限：

```yaml
contents: read
pages: write
id-token: write
```

## 协作与提交约定

- Git 提交信息统一使用简体中文，简洁说明本次变更的实际内容；
- 提交前检查当前分支、工作区差异和待提交文件，避免混入无关改动；
- 未经明确要求不执行提交或推送；推送前确认目标分支和远程仓库；
- 不在提交记录、代码或 GitHub Actions 配置中写入 API Key、Token 和其他敏感信息。

## 隐私与安全边界

- 不读取 X Cookie、密码和 X Token；
- 不自动填写回复框或点击发布；
- API Key 由用户在本地配置，不应提交到仓库；
- 发送给模型的帖子内容可能由对应模型服务商处理；
- 使用前请确认模型服务商的隐私政策和数据处理条款；
- 请人工复核模型生成的内容，不要将模型输出视为事实或投资、医疗、法律建议。

## 开发说明

项目不需要构建步骤。H5 是静态页面，Chrome 扩展使用 Manifest V3。

基础检查：

```bash
node --check h5/idea-engine.js
node --check h5/app.js
node --check sidepanel.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```

## 当前边界

本项目是人工确认辅助工具，不提供自动发布、批量后台抓取、自动点赞、自动转发或自动关注功能。

## License

当前仓库尚未声明开源许可证。如需允许他人正式使用、修改和再分发，请补充明确的 LICENSE 文件。
