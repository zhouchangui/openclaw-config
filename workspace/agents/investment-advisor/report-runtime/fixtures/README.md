# fixtures

这里存放 report runtime 的本地 fixture，用于：

- 无外网环境下做 smoke test
- 在 provider 接口变动时做回归比对
- 为适配层提供稳定输入样本

当前包含：

- `tencent-quotes.sample.json`
- `eastmoney-sectors.sample.json`
- `eastmoney-kline.sample.json`
- `news-feed.sample.html`
