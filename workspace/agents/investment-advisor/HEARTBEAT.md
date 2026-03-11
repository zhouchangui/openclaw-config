# HEARTBEAT.md - 理财助手巡检清单

## 每次 Heartbeat

检查定时报告是否有遗漏：

```bash
# 今日报告生成情况
ls ~/workroot/reports/$(date +%Y-%m-%d)/ 2>/dev/null || echo "今日暂无报告"
```

**无异常** → 回复 `HEARTBEAT_OK`  
**报告缺失** → 检查 cron 是否正常触发，通过飞书通知用户

## 触发立即通知的条件

- akshare 接口连续失败（数据获取失败）
- 定时报告超时未生成（应生成时间后 30 分钟仍无文件）
- SOUL.md 真实性底线被触碰（如发现捏造数据的报告）
