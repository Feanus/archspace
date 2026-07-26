# Issue model lineage browser

当前 Web 入口只读加载 `/data/template-test-data.json`，数据来自
`scv11/template-test`，并将 Architecture Proposal Issue 映射为模型节点：

- 一个 Issue 对应一个模型节点；
- `parentIssue: null` 表示该模型是谱系根节点；
- `parentIssue: #<issue>` 连接到对应父模型；
- 快照中缺失的父 Issue 显示为共享的外部父 Issue 占位节点；
- Pull Request 按 `Architecture Proposal (issue #)` 关联到模型；
- Issue 使用 `architecture proposal` label 过滤，PR 使用 `architecure implement` label 过滤；
- 点击模型后，使用 Proposal、Implementation 和 The model is merged 区域查看提案与实现信息；
- `parsed.archive` 是有序的可扩展字段数组，会保留模板与 PR 中新增的所有 Archive 链接；
- `parsed.experimentalValidation` 按 Markdown 子标题解析为可变长度层级树，前端不会直接显示
  `####` 等 Markdown 标记。

页面不调用 GitHub API，也不实时请求外部 Report Link。所有内容均来自仓库内的脱敏离线快照。
无法关联到当前 Issue 集合的 PR 会显示在仓库根节点中。

## 更新离线数据

使用 GitHub 抓取器更新并生成脱敏前端数据：

```bash
bash web/scripts/reload_data.bash
```

构建脚本会移除 URL 用户信息和 token、secret、key 等凭证型查询参数。

## 本地运行

```bash
npm ci --prefix web
npm test --prefix web
npm run serve --prefix web
```

本地地址为 <http://127.0.0.1:4173/web/>，GitHub Pages 路径模拟为
<http://127.0.0.1:4173/archspace/>。

## 主要文件

```text
data/template-test-data.json
web/src/model-data-adapter.js
web/src/model-detail-view.js
web/src/model-app.js
```
