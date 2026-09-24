export const members = [
  {
    name: "冯进钤",
    role: "教授 · 博士 · 硕士生导师",
    focus: "复杂系统数据驱动理论与方法、随机动力系统、动力学与 AI",
    url: "https://math.xpu.edu.cn/info/1191/4379.htm",
    photo: "/members/feng.jpg",
  },
  {
    name: "苏进",
    role: "副教授 · 博士 · 硕士生导师",
    focus: "计算数学、应用统计",
    url: "https://math.xpu.edu.cn/info/1197/4408.htm",
    photo: "/members/su.png",
  },
  {
    name: "韩有攀",
    role: "副教授 · 硕士生导师",
    focus: "优化与随机规划",
    url: "https://math.xpu.edu.cn/info/1222/4729.htm",
    photo: "/members/han.jpg",
  },
  {
    name: "王慧敏",
    role: "工程师 · 博士 · 硕士生导师",
    focus: "应用统计、计算数学",
    url: "https://math.xpu.edu.cn/info/1209/5144.htm",
    photo: "/members/wang.jpg",
  },
  {
    name: "郭琴",
    role: "讲师 · 博士",
    focus: "随机动力学、网络动力学、深度学习",
    url: "https://math.xpu.edu.cn/info/1203/4496.htm",
    photo: "/members/guo.jpg",
  },
];

export const directions = [
  {
    slug: "ai-pde",
    title: "人工智能融合的微分方程数值方法",
    english: "AI + NUMERICAL PDE",
    image: "/research-fluid.png",
    equation: "∂ₜu + (u · ∇)u = −∇p + νΔu",
    summary: "探索人工智能方法与微分方程数值计算的结合，关注复杂方程的高效求解与可靠性。",
    topics: [
      { title: "智能数值求解", detail: "研究学习方法与传统离散算法的结合方式，用于提升复杂方程求解的效率。" },
      { title: "数据与物理约束", detail: "将观测数据、方程结构和边界条件共同纳入建模与计算流程。" },
      { title: "误差与泛化", detail: "关注数值精度、稳定性及模型在不同参数条件下的适用范围。" },
    ],
  },
  {
    slug: "complex-systems",
    title: "数据驱动的复杂系统可计算建模与仿真",
    english: "COMPLEX SYSTEMS",
    image: "/research-lorenz.png",
    equation: "ẋ = σ(y − x)\nẏ = x(ρ − z) − y\nż = xy − βz",
    summary: "从观测数据中识别复杂系统的演化规律，建立可计算模型并开展仿真与验证。",
    topics: [
      { title: "系统辨识", detail: "从时间序列与实验数据中提取主要状态、相互作用和演化关系。" },
      { title: "可计算模型", detail: "构建便于分析、预测和仿真的模型表示，并与已有机理知识结合。" },
      { title: "仿真与验证", detail: "通过数值实验比较模型预测和观测结果，评估可靠性与适用条件。" },
    ],
  },
  {
    slug: "dynamical-data-science",
    title: "动力系统驱动的数据科学",
    english: "DYNAMICAL DATA SCIENCE",
    image: "/research-flow-matching.png",
    equation: "∂ₜpₜ + ∇ · (pₜvₜ) = 0",
    summary: "以动力系统理论理解时间数据中的结构，研究预测、状态重建与不确定性。",
    topics: [
      { title: "时序结构", detail: "分析系统状态随时间的变化，识别周期、突变及其他动力学特征。" },
      { title: "数据驱动预测", detail: "结合动力学模型与数据方法，对复杂系统未来状态进行推断。" },
      { title: "随机动力学与生成", detail: "研究随机微分方程、概率流与 flow matching 等方法在时序建模和数据生成中的可能应用。" },
    ],
  },
  {
    slug: "textile-simulation",
    title: "纺织材料性能模拟计算",
    english: "TEXTILE SIMULATION",
    image: "/research-textile-compute.png",
    equation: "K u = f",
    summary: "围绕纺织材料的结构与性能关系，探索数值模拟、性能预测和参数优化。",
    topics: [
      { title: "微结构建模", detail: "描述纤维、纱线与织物的几何结构，为性能计算提供模型基础。" },
      { title: "多尺度模拟", detail: "研究材料不同尺度之间的联系，分析结构变化对性能的影响。" },
      { title: "性能预测", detail: "通过计算与数据方法辅助比较设计参数和材料表现。" },
    ],
  },
];
