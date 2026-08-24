# DSH Web 响应完成回调兼容修复

## 现象

`0.3.1` 已能让浏览器收到完整 JSON，但在正式 DSH WebServer 中，挂在 `ServerResponse` 的独立 `finish` 监听器没有释放延后任务；同步 helper 因而没有启动。

## 修复

- 把延后任务释放点改为 `ServerResponse.end(payload, callback)` 的完成回调。
- 回调仍只在响应数据提交完成后执行，并继续由请求级调度器隔离任务。
- 非 action 请求与错误响应不受影响。

## 验证

- 保留真实本机 HTTP 回归测试。
- 正式 profile 端到端验收必须同时满足：调用端收到完整 `HTTP 200` JSON、helper 生成运行日志、DSH PID 发生切换且 3080 恢复健康。

## 回退

回退本提交并重新应用 `dsh-resource-management@0.3.1`。回退后浏览器不再显示原始空 JSON 错误，但重启型延后任务在正式 DSH WebServer 中可能不会执行。
