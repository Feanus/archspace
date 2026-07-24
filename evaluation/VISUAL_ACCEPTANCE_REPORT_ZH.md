# InternSpace 视觉参考与 E2E 验收报告

验收日期：2026-07-20（Asia/Shanghai）

结果：**10 PASS / 0 FAIL / 1 UNRESOLVED**

上线 URL：`https://inuyashayang.github.io/InternSpace/`

GitHub Pages API 观测：`built`，commit `8b3133710d3a4330b9520800e5181ccff9c39e4d`，更新时间 `2026-07-20T02:32:15Z`。该元数据只证明部署构建完成，不替代本 runner 对五个线上 URL 的 HTTP 200 实测。

浏览器原始报告：`/tmp/internspace-visual-report.json`

| ID | 结果 | 验收事实 | 说明 |
|---|---|---|---|
| VIZ-01 | PASS | dark visual tokens, fixed glass header, canonical and DEMO sources stay distinct | browser assertion passed |
| VIZ-02 | PASS | first viewport is only the root plus four structural branches with no era or lane forest | browser assertion passed |
| VIZ-03 | PASS | nodes expose restrained category accent, validation, symbol and experiment coverage marker | browser assertion passed |
| VIZ-04 | PASS | drawer is closed by default, opens on node click, contains complete research fields and closes cleanly | browser assertion passed |
| VIZ-05 | PASS | structural and auxiliary edges have separate semantics | browser assertion passed |
| VIZ-06 | PASS | desktop and mobile layouts avoid node overlap, drawer occlusion and page-level horizontal overflow | browser assertion passed |
| VIZ-07 | PASS | pan zoom search keyboard and reduced-motion remain operable | browser assertion passed |
| VIZ-08 | PASS | local root, web, canonical data, CSS and JS assets all return 200 | browser assertion passed |
| VIZ-09 | UNRESOLVED | GitHub Pages root, web, canonical data, CSS and JS assets all return 200 | external network: apiRequestContext.get: read ECONNRESET Call log:   - → GET https://inuyashayang.github.io/InternSpace/     - user-agent: Playwright/1.61.1 (x64; ubuntu 22.04) node/22.22     - accept: */*     - accept-encoding: gzip,deflate,br  |
| VIZ-10 | PASS | ExperimentReplayProvider is deterministic, disableable and never mutates canonical research evidence | browser assertion passed |
| VIZ-11 | PASS | capture reference, desktop, drawer and mobile screenshots outside Git | all four /tmp screenshots exist; none are repository artifacts |

## 判定说明

- PASS 只表示本轮可执行门禁通过，不把 UI 测试当作研究效果证据。
- GitHub Pages 在执行环境发生连接重置或 DNS/TLS 不可达时记为 UNRESOLVED；明确 HTTP 非 200 记为 FAIL。
- `/tmp` 截图只用于本轮人工对照，不提交 Git。

## 当前视觉差距

- 无阻塞视觉差距。

## 未解决项

- GitHub Pages root, web, canonical data, CSS and JS assets all return 200

## 截图索引

| 视图 | 路径 |
|---|---|
| internspace-reference-1440x900 | `/tmp/internspace-reference-1440x900.png` |
| internspace-local-1440x900 | `/tmp/internspace-local-1440x900.png` |
| internspace-local-drawer-1440x900 | `/tmp/internspace-local-drawer-1440x900.png` |
| internspace-local-390x844 | `/tmp/internspace-local-390x844.png` |
