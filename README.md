# dsh-resource-management

统一的 DSH 资源管理插件，提供两个独立的 Better Sidebar 入口：

- `dsh-resource-management:plugins`：当前 DSH profile 实际安装的顶层插件、README、参数面板和启用/禁用。
- `dsh-resource-management:skills`：当前选中的 live Skill 来源、SKILL.md、参数面板和独立分类。

两个入口由同一个 Host、同一个包版本和同一个 Git 历史提供。它们共用 GitHub 风格的展示组件，但 Plugin 与 Skill 的分类、面板值和来源选择保持独立。插件 README 只读取当前 profile 的已安装包；不会回退到 Maintenance 工作树。Skill 文档只读取当前选中的 Skill 来源。

参数面板定义随资源仓库版本维护，运行时值保存在当前 profile 的 `dsh-resource-management/panel-values.json`，并在 `plugins` 与 `skills` 命名空间中持久化。Plugin 可在入口中启用或禁用；Skill 不提供启用/禁用，因为 Skill 是给 AI 阅读的知识文档。安装、卸载、更新、Generation、Git、诊断和回退仍由 DSH Maintenance 管理。

README 使用 GFM 渲染，原始 HTML、脚本协议、绝对路径、UNC 路径、符号链接逃逸和不受支持的本地图片类型均被拒绝。图片只通过本机同源、短期 profile 运行期间签发的 asset 身份读取。

## 内置参数面板构建 Skill

仓库内置 [`dsh-management-panel-builder`](skills/dsh-management-panel-builder/SKILL.md)，用于指导 AI 为指定 DSH Plugin 或 Skill 构建 Manager 的统一参数面板。Skill 固化了当前 Contract v1、方案 A 的分组设置卡模板、字段与操作按钮约束、运行值边界、验证流程，以及“不能只生成界面而不证明参数实际生效”的验收规则。

这个仓库同时支持两种发现方式：

- DSH/npm 安装包会包含整个 `skills/` 目录，Manager 启动后将它作为只读 bundled Skill 来源展示。
- 仓库根目录的 [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json) 将 `./skills/` 声明为 Codex 插件能力；从 GitHub 安装该 Codex 插件时会一并发现 Skill。

建议给 AI 的调用提示：

```text
使用 $dsh-management-panel-builder，读取 <目标插件仓库路径>，只根据该插件已经存在的功能构建 dsh-management/panel.yaml，并完成必要的运行接线、测试和修改日志。不要修改 Manager 的统一 UI，也不要生成无法实际生效的参数。
```

面板结构、字段 ID、默认值和按钮声明随目标资源 Git 版本维护；用户填写的实际值仍保存在当前 DSH profile 或凭据系统中，不写回目标仓库。

## 本地开发

```powershell
pnpm install --offline
pnpm check
```

发布前由 Maintenance 生成单一 `dsh-resource-management-<version>.tgz`，再通过目标 DSH profile 的 Generation 激活。
