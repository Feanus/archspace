# InternSpace 视觉参考审查

审查日期：2026-07-20（Asia/Shanghai）

参考文件：`/home/inuyasha/Lumia/index(1).html`

验收对象：

- 本地：`http://127.0.0.1:4173/web/`
- GitHub Pages：`https://inuyashayang.github.io/InternSpace/`
- 正式数据：`data/feature-tree.json`

## 结论

参考页可以提供暗色研究画布的视觉语言，但不能提供 InternSpace 的信息架构或事实模型。InternSpace 必须继续是一棵由 `parent_id` 决定的单根 Feature Tree；参考页中的年代列、研究 lane、动态训练状态和随机指标不得进入正式页面语义。

视觉借鉴的核心原则是：**层级和交互可以借鉴，研究事实不能模拟成真。** loss、W&B run、训练状态和曲线属于实验记录，不属于单个 Feature；曲线只能来自已抓取的 W&B trace 回放，并必须标为 `W&B replay`。

## 可直接借鉴

| 参考元素 | 借鉴方式 | InternSpace 约束 |
|---|---|---|
| 暗色径向渐变 | 使用低对比度深蓝/墨色径向光晕形成空间层次 | 不使用高亮霓虹大面积抢占内容 |
| 网格画布 | 使用低透明度规则网格辅助空间定位与 pan/zoom 感知 | 网格不代表年代、lane 或数据坐标轴 |
| 玻璃顶栏 | 固定 header，使用透明背景、细边框与适度 blur | header 不遮挡节点，移动端保持可访问 |
| 卡片层级 | 节点、浮控、统计卡和抽屉采用一致圆角、边框、阴影层级 | 节点仍是一 Feature 一点，卡片装饰不增加本体 |
| hover / selected | hover 轻抬升，selected 使用清晰但克制的描边/光晕 | 必须兼容键盘 focus 与 reduced motion |
| 浮动控制 | 搜索、适配、缩放可悬浮于画布上方 | 不改变确定性布局坐标，不遮挡首屏主分支 |
| 抽屉详情 | 默认关闭，选择节点后打开；关闭后恢复完整画布 | 详情完整展示 code、effect、provenance，不以抽屉代替树结构 |
| mono 元数据 | Feature ID、commit、revision、symbol、path 使用等宽字体 | 仅用于定位与审计，不把 commit/path 画成节点 |

## 有条件借鉴

以下元素只有满足实验索引边界时才允许出现：

| 元素 | 允许条件 | 必须拒绝的用法 |
|---|---|---|
| category 色 | 使用低饱和 accent，主要帮助扫视；validation 仍由独立 badge 表达 | 用高饱和彩虹色把页面变成 lane 分类森林 |
| loss 曲线 | 只能来自已抓取 W&B trace 的 `wandb-replay`，并可关闭 | 未标注地显示为模型真实实时 loss |
| final loss | 只从完成实验的 W&B/artifact final metrics 读取 | 为没有结果的实验补写假 loss |
| 进度 | 只表达回放游标位置，不映射 Feature `status` 或 validation status | 把回放进度条当作研发完成度或训练完成度 |
| active 状态 | 不再使用；实验状态由 `planned/running/completed/...` 文本表达 | 把闪烁圆点解释为真实任务/集群在线状态 |
| sparkline | 轻量、低对比，节点内显示为实验覆盖 / W&B replay | 无来源标识、随机刷新、与研究结论混排 |

`ExperimentReplayProvider` 的验收契约：

1. 输入对象是实验记录，不是 Feature ID。
2. 一个实验可以覆盖多个 Feature；节点只显示覆盖关系和回放摘要。
3. 相同实验 trace 和 tick 得到相同输出；刷新页面不能产生不可追溯随机事实。
4. 可通过显式开关关闭；关闭后不推进 replay 游标。
5. provider 不写入、不回传、不修改 `features/*.json` 或 `data/feature-tree.json`。
6. 没有 W&B URL、final metrics 或 trace 的实验保持 planned/unverified，不补假指标。

## 必须拒绝

| 参考元素 | 拒绝原因 |
|---|---|
| 年代列 / era band | InternSpace 的横向位置表达确定性 Feature 深度，不表达年份时间轴 |
| lane 森林 | 项目只有一个结构根和一棵单父树，category 不是第二套结构 |
| 未标注的假指标 | 会破坏研究真实性，用户无法区分 canonical、实验索引与回放 |
| 把回放值宣称成实时训练 | 违反 evidence 规则；trace 回放不是任务在线状态 |
| 高饱和彩虹分类 | 使 category 压过 parent/validation/selected 语义，并降低中文长标题可读性 |
| 随机 `Math.random()` 实时循环 | 不可复现、不可审计，也无法证明不会污染正式数据 |
| “训练中”闪烁等同 Feature 状态 | Feature status、validation status 与外部任务运行态是不同概念 |

## InternSpace 必须保留

- 唯一根 `feat-olmo3-standard`。
- 正式 canonical 当前只有根与 10 个已裁决结构 Feature。
- 首屏只显示 root 与四条主结构分支，不显示 synthetic、era 或 lane。
- 中文标题/摘要优先；英文标题作为低干扰副标题或审计信息。
- 每个节点详情必须保留 parent-relative delta、代码 locator、validation/effect 和 provenance。
- 主边只表示 `parent_id`；`depends_on` / `related_to` 使用明显不同的辅助边样式，且不改变树布局。
- 布局、初始展开状态、搜索揭示路径和实验 replay 都必须确定性可复现。
- 失败、mixed、conditional 与 unverified 必须诚实显示，不能用动画包装成成功。

## 参考页与当前 InternSpace 的差异

| 维度 | 参考页 | 当前本地观察 | 目标 |
|---|---|---|---|
| 主题 | 暗色径向渐变 | 浅色画布 | 暗色、克制、可读 |
| 画布 | 网格 + pan/zoom | 点阵 + pan/zoom | 暗色网格 + 确定性 Feature Tree |
| 顶栏 | 固定玻璃 header | 画布内绝对定位工具栏 | 固定玻璃 header，来源区分持续可见 |
| 结构 | 年代列 + 多 lane 森林 | 单根 Feature Tree | 保留单根与四条首层分支 |
| 指标 | 随机 loss/吞吐/进度 | 实验索引 + W&B replay | 完成实验展示 W&B/final loss；曲线只做 trace 回放 |
| 详情 | 右侧抽屉，点击打开 | 常驻右侧详情栏，默认显示 root | 默认关闭抽屉，关闭恢复完整画布 |
| 节点 | 高饱和 lane accent | 浅色 validation badge + symbol | 低饱和 category accent + validation badge + symbol + 实验覆盖 marker |

## 风险

### 真实性风险

- 最大风险是把参考页的随机训练指标直接移植到研究页面。
- W&B replay 必须持续表明它是 trace 回放，不是实时训练。
- canonical 统计与 experiment cursor 必须有不同的 DOM/source 标记，便于自动验收和辅助技术识别。

### 可读性风险

- 中文标题较长；节点需控制两行截断，并保留 symbol 摘要，不能依赖颜色识别。
- 深色背景上的低对比灰文字、细线与 blur 容易降低可读性，应通过 WCAG 对比度和键盘 focus 复核。
- 移动端 drawer 不应造成页面级横向溢出，也不能永久遮挡画布控制。

### 交互风险

- drawer 开合、节点 click 与 canvas pan 必须区分，拖动画布后不能误开详情。
- reduced-motion 下应停止 pulse、sparkline 过渡和浮动动画，但保留状态文字。
- 辅助边只能在相关 Feature 被选择时出现，且样式不能与结构主边混淆。

## 截图索引

截图是验收运行时证据，只保存于 `/tmp`，不提交 Git。

| 视图 | 运行时路径 | 说明 |
|---|---|---|
| 参考页 | `/tmp/internspace-reference-1440x900.png` | `index(1).html` 桌面参考 |
| InternSpace desktop | `/tmp/internspace-local-1440x900.png` | 本地首屏 |
| InternSpace drawer | `/tmp/internspace-local-drawer-1440x900.png` | 选择结构 Feature 后详情 |
| InternSpace mobile | `/tmp/internspace-local-390x844.png` | 移动端首屏/抽屉布局 |

截图是否成功生成以及对应提交/文件时间，应以 `VISUAL_ACCEPTANCE_REPORT_ZH.md` 的最终验收记录为准。
