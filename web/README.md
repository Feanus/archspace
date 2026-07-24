# Issue model lineage browser

当前 Web 入口只读加载 `/data/template-test-data.json`，将 Architecture Proposal
Issue 映射为模型节点：

- 一个 Issue 对应一个模型节点；
- `parentIssue: null` 表示该模型是谱系根节点；
- `parentIssue: #<issue>` 连接到对应父模型；
- 快照中缺失的父 Issue 显示为共享的外部父 Issue 占位节点；
- Pull Request 按 `Related Architecture Proposal / Proposal Issue` 关联到模型；
- 点击模型后，使用 Issue 与 PR 选项卡查看完整提案、配置、训练记录和验证结果。

页面不调用 GitHub API，也不实时请求外部 Report Link。所有内容均来自仓库内的脱敏离线快照。
无法关联到当前 Issue 集合的 PR 会显示在仓库根节点中。

## 更新离线数据

从工作区已有的 GitHub 抓取结果生成脱敏前端数据：

```bash
node web/scripts/build-template-test-data.mjs \
  ../outputs/template-test-data.json \
  data/template-test-data.json
```

构建脚本会移除 URL 用户信息和 token、secret、key 等凭证型查询参数。

## 本地运行

```bash
npm ci --prefix web
npm test --prefix web
npm run serve --prefix web
```

本地地址为 <http://127.0.0.1:4173/web/>，GitHub Pages 路径模拟为
<http://127.0.0.1:4173/InternSpace/>。

## 主要文件

```text
data/template-test-data.json
web/src/model-data-adapter.js
web/src/model-detail-view.js
web/src/model-app.js
```
