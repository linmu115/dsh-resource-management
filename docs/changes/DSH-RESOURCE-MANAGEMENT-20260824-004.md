# Action 失败反馈与面板接线规范

## 目标

支持资源 action 把已安全处理的失败直接反馈到参数页，并把“面板必须连接真实运行逻辑”固化进随 Manager 发布的构建 Skill。

## 修改前

- Host action 只能返回消息和重启标记，Panel Runtime 总是把正常返回解释为成功。
- 参数页执行 action 后不显示局部结果；失败只能上升为整页错误或被泛化。
- Skill 已要求证明配置生效，但没有明确逐字段标出运行消费者，也没有规定缺少公开配置桥时必须先补桥。

## 修改后

- 版本提升至 `0.2.1`，内置共享 UI 更新为 `@linmu/dsh-management-kit@0.1.6`。
- action handler 可返回 `ok: false`；参数页将对应消息显示在按钮下方，失败使用小号红色文本。
- Skill 明确要求逐字段核对真实运行消费者；缺少公开配置桥时必须补充受测试的公开桥或目标插件 adapter，禁止读取 Manager 私有数据文件。
- 纯 action 面板无需字段桥，但每个 action 必须登记真实 handler，并复用目标插件真实业务入口。

## 验证

- `pnpm check`：7 个测试文件、17 项测试、TypeScript 类型检查和 Host/客户端构建通过。
- 共享 UI 的 76 项测试通过，其中覆盖 `ok: false` 传递和错误反馈映射。
- Manager 发布包继续携带完整的 `dsh-management-panel-builder` Skill。

## 回退

重新激活 `dsh-resource-management@0.2.0`。分类、README、面板值和凭据格式没有迁移；旧资源 action handler 省略 `ok` 时仍按成功处理。
