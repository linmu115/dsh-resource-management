# Contract v2、DSH Settings 桥与方案 A 模板

## 固定页面结构

目标资源不实现 React 或 CSS。Manager 统一渲染资源标题、只读 README、参数设置 Tab、分组设置卡、操作卡、保存栏和重启提示。声明只决定文字、字段、顺序和 binding。

## 文件与版本

```text
<目标资源根>/dsh-management/panel.yaml
```

Plugin 的 `package.json.files` 必须包含 `dsh-management`。Contract v1 继续兼容旧字段；新面板使用：

```yaml
contractVersion: 2
sections: []
actions: []
```

Schema 严格拒绝未知键、重复 ID、无效默认值和跨版本属性。

## DSH Settings binding

Cordis 配置字段优先绑定官方 Settings namespace：

```yaml
binding:
  kind: dsh-settings
  namespace: target-plugin
  key: feature.enabled
```

目标 Plugin 必须用 `installSettingsSection()` 或等价的 `ctx.settings.register()` 注册相同 namespace，让 Cordis entry config 成为 `base`，再从解析后的值驱动真实运行代码。Manager 使用脱敏 descriptor 和 `mutate()` 精确修改路径，不修改静态 patch，也不把这些值保存进 Manager JSON。

逐字段验收表必须包含：

| 字段 | Cordis/Settings 路径 | 运行消费者 | 生效模式 | 行为证据 |
| --- | --- | --- | --- | --- |
| `feature.enabled` | `target-plugin/feature.enabled` | `apply()` 中的功能门 | `immediate` | 切换后新请求不再执行该功能 |

如果 namespace 未注册，Manager 会把字段显示为不可用；AI 应修复目标 Plugin，而不是改用私有 JSON 掩盖缺口。

## 字段类型

Contract v2 支持 `switch`、`text`、`number`、`slider`、`select`、`multiselect`、`path`、`secret` 和 `model-select`。普通类型规则与 v1 相同。

模型选择：

```yaml
- id: member.route
  type: model-select
  label: 成员模型
  default: null
  allowInherit: true
  inheritLabel: 跟随当前会话
  apply: save
  binding:
    kind: dsh-settings
    namespace: target-plugin
    key: memberDefaultRoute
```

值为 `null` 或 `{ provider, model, reasoningEffort? }`。固定值从 DSH 当前目录选择；最终可用性仍由目标 Plugin 在真实调用前校验。

## 可折叠开发者分组

```yaml
- id: developer
  title: 开发者选项
  description: 通常不需要修改
  collapsible: true
  defaultCollapsed: true
  fields: []
```

`defaultCollapsed` 只能与 `collapsible: true` 一起使用。折叠状态不是运行配置。

## 其他 binding

- `credential`：只用于 `secret`，由 DSH 凭据服务单向保存；
- `profile` / `plugin-data`：Contract v1 兼容路径，当前由 Manager JSON 保存，本身不证明第三方插件会读取；
- 新 Cordis 配置不能为了省事使用上述兼容路径。

## 操作按钮

Plugin action 仍需用 `ctx.resourceManagementActions.register(packageName, actionId, handler)` 登记真实处理器。危险操作使用 `danger` 并提供确认文案。Skill 不执行 action。

## 生效模式

- `immediate`：控件变化后提交，真实消费者马上读取新值；
- `save`：保存栏批量提交，保存后对后续操作生效；
- `restart-required`：保存后只持久化，必须冷重启 DSH 才改变运行实例。

声明必须与目标 Plugin 的真实行为一致。
