# Formal Feature sources

`features/*.json` 是 InternSpace 正式 Feature Tree 的唯一人工 source of truth。每个文件
只包含一个 Feature 对象，文件名必须严格等于 `<feature-id>.json`。

`data/feature-tree.json` 是确定性生成投影，供页面和既有消费者读取，不再手工维护。

生成投影：

```bash
python3 scripts/build_feature_tree.py
```

只检查 source 与生成投影是否一致，不写文件：

```bash
python3 scripts/build_feature_tree.py --check
```

Builder 会在写入前检查：

- 文件名等于 Feature ID，且 ID 唯一；
- 已裁决的 11 个 ID 存在且其 parent 未改变；
- 唯一根、单父、父引用、辅助引用、连通与无环；
- 正式非根 Feature 的 architecture category、validation status、双语字段、结构化 code
  locator、parent-relative validation 与 provenance；
- canonical 中没有旧 synthetic/example/fixture Feature ID；
- 输出采用父先于子、同级按 ID 排序的稳定 preorder。

正常构建使用同目录临时文件、flush/fsync 和 `os.replace` 原子替换投影。CI 应运行
`--check`；如果有人直接修改生成文件或忘记重建，命令会以 stale 失败。
