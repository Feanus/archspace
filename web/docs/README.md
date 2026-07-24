# Feature Tree smoke screenshots

浏览器 smoke tests 会在本目录生成并更新正式数据截图，其中 `canvas-panned.png` 展示缩放后拖拽空白画布，Feature 与结构边通过统一 viewport transform 整体平移。

`bilingual-display.png` 使用 Web 测试 fixture 展示中文节点标题、英文详情副标题、中文摘要以及中文父/依赖 Feature 名称。

当前 11 节点正式树截图：

- `root-initial.png`：根与四条结构一级分支，卡片含 validation badge 和短代码定位；
- `formal-all-nodes.png`：11 个正式 Feature 全量展开；
- `d08-conditional.png`：D08 条件性 / 待等价性确认与详情证据；
- `selected-detail-dependency.png`：固定顺序详情与辅助关系；
- `canvas-panned.png`：缩放后 Pointer pan。

暗色沉浸式版本的交付截图：

- `desktop-initial.png`：1440×900 单根四主分支首屏；
- `telemetry-running.png`：实验索引 / W&B replay 控制运行态；
- `selected-drawer.png`：选中 Feature、关联 dim 与右侧证据 drawer；
- `mobile-390.png`：390×844 底部 drawer；
- `reference-layout.png`：本轮实际打开的 `/home/inuyasha/Lumia/index(1).html` 视觉参考留档，仅用于布局和美术对照。
