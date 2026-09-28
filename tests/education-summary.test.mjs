import assert from "node:assert/strict";
import test from "node:test";
import { summarizeEducationBody, summarizeEducationIntro } from "../app/education-summary.ts";

test("人才培养简介仅取首段导语，不拼入后续段落与课程清单", () => {
  const intro = "教学课程覆盖本科生、硕士研究生和博士研究生三个培养层次。";
  const source = `${intro}\n\n## 本科生课程\n\n- 《数值计算方法》\n- 《微分方程数值解》\n\n更多课程介绍。`;
  assert.equal(summarizeEducationIntro(source), intro);
  assert.match(summarizeEducationBody(source), /数值计算方法/);
});

test("人才培养简介最多60个Unicode字符，保留行内可读文字", () => {
  assert.equal(summarizeEducationIntro("**培养介绍**与[课程资料](/courses)。\n\n后续正文"), "培养介绍与课程资料。");
  assert.equal(summarizeEducationIntro("𠮷😀".repeat(30)), "𠮷😀".repeat(30));
  assert.equal(summarizeEducationIntro("𠮷😀".repeat(40)), "𠮷😀".repeat(29) + "𠮷…");
});

test("人才培养简介跳过标题与资料，仅有列表图片表格时不拼接为简介", () => {
  const materials = "# 课程\n\n![图片](/course.png)\n\n| 名称 |\n| --- |\n| 课程 |\n\n- 课程一\n- 课程二\n\n```text\n代码\n```";
  assert.equal(summarizeEducationIntro(materials), "");
  assert.equal(summarizeEducationIntro(`${materials}\n\n正文介绍。\n\n第二段。`), "正文介绍。");
  assert.equal(summarizeEducationIntro("> 培养介绍。\n>\n> - 课程清单"), "培养介绍。");
  assert.equal(summarizeEducationIntro("<script>隐藏</script>\n\n<div>课程 &amp; 实践</div>\n\n后续正文"), "课程 & 实践");
  assert.equal(summarizeEducationIntro(" \n\n "), "");
});

test("空正文或只有空白时返回空摘要", () => {
  assert.equal(summarizeEducationBody(""), "");
  assert.equal(summarizeEducationBody(" \n\n\t "), "");
});

test("中文摘要取正文开头并按 Unicode 字符限制到120字", () => {
  const exact = "教学".repeat(60);
  assert.equal(summarizeEducationBody(exact), exact);
  const longer = "教学课程".repeat(40);
  const summary = summarizeEducationBody(longer);
  assert.equal(summary, Array.from(longer).slice(0, 119).join("") + "…");
  assert.equal(Array.from(summary).length, 120);
});

test("英文摘要统一空白并保留开头文本", () => {
  assert.equal(summarizeEducationBody("First   paragraph.\nSecond line.\n\nNext paragraph."), "First paragraph. Second line. Next paragraph.");
  const longer = "Research courses and student development. ".repeat(5).trim();
  assert.equal(summarizeEducationBody(longer), longer.slice(0, 119) + "…");
});

test("emoji和非BMP汉字计为单个Unicode字符而不拆分代理对", () => {
  const exact = "😀".repeat(120);
  assert.equal(summarizeEducationBody(exact), exact);
  const summary = summarizeEducationBody("𠮷😀".repeat(70));
  assert.equal(summary, "𠮷😀".repeat(59) + "𠮷…");
  assert.equal(Array.from(summary).length, 120);
  assert.doesNotMatch(summary, /\uFFFD/);
});

test("格式和链接只保留可读文字，行内代码作为正常文字", () => {
  const source = "**教学课程**面向*学生*，提供~~旧版~~新版 [课程目录](https://example.test/catalog) 和 `Python` 练习。";
  assert.equal(summarizeEducationBody(source), "教学课程面向学生，提供旧版新版 课程目录 和 Python 练习。");
  assert.equal(summarizeEducationBody("课程 [参考资料][source]。\n\n[source]: https://example.test/reference"), "课程 参考资料。");
});

test("先解析Markdown再截断，长链接的目标及格式标记不挤占摘要", () => {
  const display = "课程介绍".repeat(35);
  const source = `[**${display}**](https://example.test/${"long-target/".repeat(30)})`;
  assert.equal(summarizeEducationBody(source), Array.from(display).slice(0, 119).join("") + "…");
});

test("HTML标签及注释不输出，普通标签内文字与换行保留", () => {
  assert.equal(summarizeEducationBody('开头<span title="属性 > 值">文字</span><br/>结尾<!--隐藏注释-->。'), "开头文字 结尾。");
  assert.equal(summarizeEducationBody("<div>教学 <strong>课程</strong></div>\n\n正文介绍。"), "教学 课程 正文介绍。");
  assert.equal(summarizeEducationBody("开头<script>隐藏脚本()</script>正文<style>隐藏样式</style>结尾"), "开头正文结尾");
  assert.equal(summarizeEducationBody("<script>隐藏脚本()</script>\n\n正文"), "正文");
});

test("常见HTML实体及Unicode数字实体转换为可读文本", () => {
  assert.equal(summarizeEducationBody("A &amp; B&nbsp; &#x1F600; &#128512; &quot;课程&quot;"), 'A & B 😀 😀 "课程"');
  assert.equal(summarizeEducationBody("&lt;strong&gt;课程&lt;/strong&gt;介绍"), "课程介绍");
});

test("开头的图片表格代码及标题均被跳过而后续正文进入摘要", () => {
  const source = [
    "# 栏目标题",
    "![图片替代文字](/course.png)",
    "| 表头 |\n| --- |\n| 表格内容 |",
    "```python\nprint('代码内容')\n```",
    "    缩进代码内容",
    "实际正文**介绍**。\n\n第二段文字。",
  ].join("\n\n");
  assert.equal(summarizeEducationBody(source), "实际正文介绍。 第二段文字。");
});

test("只有图片表格代码等非正文内容时返回空字符串", () => {
  for (const source of [
    "![图片替代文字](/course.png)",
    "| 表头 |\n| --- |\n| 内容 |",
    "```text\n代码示例\n```",
    "    缩进代码示例",
    "# 只有标题\n\n---",
    '<img src="/course.png" alt="替代文字"/>',
    "<table><tr><td>HTML表格</td></tr></table>",
    "<pre><code>HTML代码</code></pre>",
  ]) assert.equal(summarizeEducationBody(source), "", source);
});

test("嵌套列表引用按可读顺序提取并忽略任务勾选标记", () => {
  const source = "> 培养计划\n> - **第一项**\n>   - [课程资料](/courses)\n>   - `Python`\n> - 第二项\n\n1. 教学\n2. 实践\n\n- [x] 完成阶段\n- [ ] 后续阶段";
  assert.equal(summarizeEducationBody(source), "培养计划 第一项 课程资料 Python 第二项 教学 实践 完成阶段 后续阶段");
});

test("嵌套图片和代码不泄漏到引用及列表摘要中", () => {
  const source = "> ![不纳入摘要](/image.png)\n>\n> 正文引用\n\n- 列表正文\n\n  ```text\n  不纳入摘要的代码\n  ```\n\n- 后续条目";
  assert.equal(summarizeEducationBody(source), "正文引用 列表正文 后续条目");
});
