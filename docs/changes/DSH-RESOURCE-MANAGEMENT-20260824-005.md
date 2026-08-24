# Manager 真实 DSH Settings 参数桥

## 问题

旧参数面板只会把普通字段保存在 Manager 自己的 `panel-values.json`。这适合纯展示偏好，却不能自动改变目标插件的 Cordis 运行配置；直接为第三方插件补一份 `panel.yaml` 会形成“界面保存成功、插件行为没有变化”的假参数。

## 修改

- 将共享 `@linmu/dsh-management-kit` 升级到 Contract v2；
- 增加 `dsh-settings` binding，由 Host 读取 `ctx.settings.describe({ redactSecrets: true })` 并用 `mutate()` 精确写入目标 namespace；
- revision token 同时包含面板涉及的全部 namespace，拒绝陈旧页面覆盖新配置；
- namespace 缺失、Settings 不可写或字段不存在时明确显示不可用，不回退到 Manager 私有 JSON；
- 增加 `model-select`，目录来自 `ctx.llm.listProviders()`、`listModels()` 和 `resolveModelInfo()`；
- 增加可折叠 section，支持默认收起“开发者选项”；
- 将内置 `dsh-management-panel-builder` Skill 升级到 Contract v2，强制 AI 先为目标插件实现真实 Settings 消费桥，再声明参数页。

## 关键位置

- `src/host/settings-adapter.ts`：DSH Settings 读写桥；
- `src/host/model-catalog.ts`：模型目录快照；
- `src/host/api.ts`、`src/client.tsx`：Host/Client API；
- `skills/dsh-management-panel-builder/`：面板构建指导与模板；
- `vendor/linmu-dsh-management-kit-0.2.0.tgz`：固定的共享 UI/Contract 产物。

## 验证

- Manager 单元测试与构建通过；
- Settings 多 namespace revision、精确 path 写入、不可用状态有回归测试；
- 模型目录与 Skill 打包内容有回归测试；
- AgentTeams 作为首个真实目标插件完成端到端适配。

## 回退

回退本提交并恢复 `@linmu/dsh-management-kit` 0.1.x 即可恢复 Contract v1。目标插件的 Settings 用户值存放在 DSH profile，不会因回退 Manager 而被删除。
