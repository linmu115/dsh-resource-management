# DSH WebServer 完成信号后备释放

## 现象

正式环境验证表明 DSH WebServer 适配层不转发原生 `finish` 事件，也不执行传给 `ServerResponse.end` 的完成回调。浏览器能够收到完整确认 JSON，但排队的同步任务仍没有被释放。

## 修复

- 标准 `end` 完成回调继续作为首选路径。
- JSON 已完成序列化并调用 `end` 后，同时登记下一事件循环的后备释放。
- 两条路径共用一次性门闩，确保任务最多执行一次。
- 业务 action 仍在完整 dispatch、revision 更新和响应序列化之后启动；同步插件自身另有两秒 helper 延时。

## 验证

- `pnpm check` 覆盖标准 Node HTTP 完成回调，并确认任务只执行一次。
- 正式 DSH 端到端验证同时检查完整 JSON、同步日志、新 PID 和 3080 健康状态。

## 回退

回退本提交并重新应用 `dsh-resource-management@0.3.2`。标准 Node HTTP 服务仍可释放任务，但 DSH WebServer 适配层下的重启型 action 可能只返回确认而不执行。
