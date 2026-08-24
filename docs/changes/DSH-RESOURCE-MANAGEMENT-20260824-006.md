# 重启型操作的响应完成调度

## 现象

参数面板中的操作如果会停止或重启当前 DSH，可能在 Manager 的 HTTP JSON 回执写完之前终止服务。浏览器随后会把空响应解析成 JSON，显示 `Unexpected end of JSON input`，即使后台操作已经启动。

## 根因

- 操作处理器与承载 Manager API 的 DSH Node 进程属于同一个生命周期。
- 原有 action API 只有“立即执行并返回结果”，没有“回执完成后再执行”的边界。
- 客户端直接调用 `response.json()`，连接被中断时只暴露浏览器原始解析错误。

## 修复

- 新增请求级 `ResponseCompletionScheduler`，用异步上下文收集延后任务。
- Management HTTP 路由在响应 `finish` 事件后才释放延后任务。
- `resourceManagementActions` 新增 `deferUntilResponse(task)`，供重启型 action 使用。
- 客户端先读取响应文本；空响应与非法 JSON 分别转换为可理解的 Manager 错误。
- 内置参数面板构建 Skill 补充重启型操作的适配规则。

## 验证

- `pnpm typecheck`
- `pnpm test`：10 个测试文件、23 项测试通过；其中真实本机 HTTP 测试确认完整 JSON 先到达客户端，延后任务随后执行。

## 回退

回退本提交并重新构建、应用上一版本 `dsh-resource-management@0.3.0`。依赖 `deferUntilResponse` 的插件保留旧 Host 兼容路径时仍可运行，但会重新暴露响应被重启打断的风险。
