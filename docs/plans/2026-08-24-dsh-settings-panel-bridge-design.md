# DSH Settings 参数面板桥与 AgentTeams 适配规格

日期：2026-08-24

## 目标

把 `dsh-resource-management` 的参数面板从“只保存 Manager 私有值”升级为可连接 DSH 官方 `ctx.settings` 的真实配置界面，并以 `@nanmicoder/dsh-agent-teams` 作为首个完整适配实例。

本次同时增加两项统一展示能力：

- 可折叠、可默认收起的开发者设置分组；
- 使用 DSH 当前模型目录的 `model-select` 复合字段。

Manager 继续只负责资源 README、参数、操作按钮和插件启停，不引入安装、更新、Git、Generation、诊断或回退能力。

## 模块与 seam

### 目标资源仓库

目标 Plugin 或 Skill 仓库拥有：

- `dsh-management/panel.yaml`；
- 字段 ID、分组、默认展示和生效模式；
- Plugin 自己的 Cordis 配置 Schema；
- Plugin 自己注册的 DSH Settings namespace；
- 实际读取设置并改变运行行为的实现与测试。

### Manager 契约模块

`@linmu/dsh-management-kit` 提供一个小的声明式 interface：

- Contract v1 继续解析现有字段；
- Contract v2 增加 `dsh-settings` binding、`model-select` 字段和可折叠 section；
- Host runtime 按 binding 把读写路由到 JSON、Credential 或 DSH Settings Adapter；
- Client 统一渲染设置卡、模型选择器和开发者折叠区。

目标资源不能携带 React、CSS 或任意脚本来改变 Manager 页面。

### DSH 官方 Settings Adapter

`dsh-resource-management` 通过官方 `ctx.settings`：

- 使用 `describe({ redactSecrets: true })` 读取已注册 namespace 的解析值、用户覆盖层和 revision；
- 使用 `mutate()` 只修改声明字段对应的路径；
- 不整体重写脱敏后的 namespace；
- 不修改插件包中的 `cordis.patch.yml`；
- 不从 Manager 私有 `panel-values.json` 冒充目标插件配置。

Cordis entry 配置仍是基础层，DSH Settings 用户层是可持久化覆盖层。目标插件读取两层合并后的解析结果。

## Contract v2

### Settings binding

```yaml
binding:
  kind: dsh-settings
  namespace: agent-teams
  key: maxMembers
```

`key` 使用点分隔逻辑路径。一个面板可以绑定多个 namespace；Settings Adapter 的 revision token 必须包含每个相关 namespace 的 revision，避免跨分组的陈旧写覆盖。

namespace 未注册、Settings Provider 不可写或字段无法读取时，字段显示不可用原因，不能回退写入 Manager JSON。

### 模型选择字段

```yaml
type: model-select
default: null
allowInherit: true
inheritLabel: 跟随队长当前会话
```

值为：

```ts
type ModelSelectionValue = null | {
  provider: string;
  model: string;
  reasoningEffort?: string;
};
```

`null` 表示继承目标插件定义的上游选择。固定值必须来自 DSH 当前公布的 provider/model 目录；reasoning effort 仅显示精确模型公布的选项。目录成员关系只用于选择界面，Host 最终仍由目标插件和 `ctx.llm.resolveCallConfig()` 校验。

Manager Host 通过 `ctx.llm.listProviders()`、`listModels()` 和 `resolveModelInfo()` 提供脱离 Adapter 活对象的目录快照。Client 使用统一弹层展示“跟随”与“固定模型”，固定模型按 provider 分组并提供 reasoning effort。

### 可折叠分组

```yaml
collapsible: true
defaultCollapsed: true
```

`defaultCollapsed` 仅允许出现在 `collapsible: true` 的 section。折叠状态只属于当前页面交互，不作为目标插件运行配置。

## AgentTeams Settings 设计

### 实时 namespace：`agent-teams`

供之后创建的新成员或新任务立即读取：

- `memberProvider`：`spawn | fork`，成员子代理运行后端；
- `memberDefaultRoute`：`null | { provider, model, reasoningEffort? }`；
- `memberMaxDepth`：自然数，默认 `1`；
- `maxMembers`：正整数，默认 `8`。

已经创建的成员保留其持久化模型路由；修改默认模型只影响之后创建的成员。

成员模型解析优先级：

1. `agent_teams_add_member` 显式 `provider/model/reasoning_effort`；
2. `memberDefaultRoute`；
3. 旧 Cordis `memberModel` 兼容值；
4. 队长当前会话实际采用的 provider/model/reasoning effort。

### 重启 namespace：`agent-teams-startup`

- `stateDir`：默认 `.agent-teams`；
- `slashCommand`：默认 `true`；
- `promptSectionOrder`：默认 `117`。

该 namespace 声明 `applies: restart`。`promptSectionOrder` 位于默认收起的“开发者选项”，说明它只控制系统提示段按升序拼接的位置，不控制任务、调度、推理强度或工具顺序。

### 面板布局

1. `成员模型`：跟随队长 / 固定模型选择器；
2. `成员运行`：运行后端、最大成员数、再委派深度；
3. `启动与存储`：斜杠命令、状态目录；
4. `开发者选项`：默认折叠，只包含 `promptSectionOrder`。

## 向后兼容

- 所有现有 Contract v1 面板继续使用 Manager JSON 或 Credential Adapter；
- v1 文件不能声明 v2 字段、binding 或 section 属性；
- AgentTeams 旧 `memberModel` 继续可由 Cordis entry 使用；新设置没有覆盖时保持旧语义；
- 用户把 `memberDefaultRoute` 设为 `null` 时明确恢复“跟随队长”；
- 修改 `stateDir` 不删除或迁移旧目录，面板必须提示旧团队记录仍留在原位置；
- Manager 的分类、README、启停和现有 action 数据不迁移、不删除。

## 内置 Skill 更新

`dsh-management-panel-builder` 必须把真实配置桥作为硬验收门：

1. 审计目标资源的 Cordis Config、Schema、Settings namespace 和运行消费者；
2. 优先使用 DSH 官方 Settings seam；
3. 没有 namespace 时，先在目标插件注册并消费 Settings，再写 `panel.yaml`；
4. 逐字段记录 binding、持久化位置、生效模式和运行消费者；
5. 禁止读取 Manager 私有 `panel-values.json`；
6. 验证 Manager 保存、Settings revision 变化、运行行为变化及冷重启持久化；
7. 模型字段必须使用目录选择器，禁止用自由文本假装模型目录；
8. 只有无法由官方 Settings 表达的插件私有数据，才允许使用文档化 `plugin-data` Adapter。

## 验证

- Contract：v1 兼容、v2 严格解析、未知键拒绝、模型值和折叠约束；
- Host：多 namespace revision 冲突、`mutate` 精确路径、不可用诊断、reset 恢复基础层；
- Client：开发者分组默认折叠、模型目录分组、inherit/fixed 切换、推理强度校验；
- AgentTeams：设置 Schema、显式参数优先级、固定默认路由、跟随队长、旧 `memberModel` 兼容；
- 发布：两个 npm 包均包含面板、文档和所需 Skill；
- 真实环境：Manager 修改值后行为生效，冷重启仍保留，恢复默认后重新继承 Cordis entry。

## 回退

- Manager 可回退到 Contract v1 版本；AgentTeams 的 v2 面板会显示不兼容，但不影响插件 Host 工具运行；
- AgentTeams 可回退到修改前版本；DSH Settings 文档中未注册的 namespace 保留但不生效；
- 不删除旧 Manager JSON、AgentTeams 状态目录或 Maintenance artifact。
