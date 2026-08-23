# dsh-resource-management

统一的 DSH 资源管理插件，提供两个独立的 Better Sidebar 入口：

- `dsh-resource-management:plugins`：当前 DSH profile 实际安装的顶层插件、README、参数面板和启用/禁用。
- `dsh-resource-management:skills`：当前选中的 live Skill 来源、SKILL.md、参数面板和独立分类。

两个入口由同一个 Host、同一个包版本和同一个 Git 历史提供。它们共用 GitHub 风格的展示组件，但 Plugin 与 Skill 的分类、面板值和来源选择保持独立。插件 README 只读取当前 profile 的已安装包；不会回退到 Maintenance 工作树。Skill 文档只读取当前选中的 Skill 来源。

参数面板定义随资源仓库版本维护，运行时值保存在当前 profile 的 `dsh-resource-management/panel-values.json`，并在 `plugins` 与 `skills` 命名空间中持久化。Plugin 可在入口中启用或禁用；Skill 不提供启用/禁用，因为 Skill 是给 AI 阅读的知识文档。安装、卸载、更新、Generation、Git、诊断和回退仍由 DSH Maintenance 管理。

README 使用 GFM 渲染，原始 HTML、脚本协议、绝对路径、UNC 路径、符号链接逃逸和不受支持的本地图片类型均被拒绝。图片只通过本机同源、短期 profile 运行期间签发的 asset 身份读取。

## 本地开发

```powershell
pnpm install --offline
pnpm check
```

发布前由 Maintenance 生成单一 `dsh-resource-management-<version>.tgz`，再通过目标 DSH profile 的 Generation 激活。

