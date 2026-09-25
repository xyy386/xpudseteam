import assert from "node:assert/strict";
import test from "node:test";
import { mergeSiteContent } from "../app/site-sync-merge.ts";

function fixture() {
  return {
    revision: "base",
    hero: { title: "原标题", subtitle: "原副标题" },
    contact: "原联系信息",
    members: [
      { name: "甲", role: "教师", focus: "数学" },
      { name: "乙", role: "学生", focus: "计算" },
    ],
    directions: [],
    archives: [{
      slug: "events", title: "活动", gallery: [{ label: "图片", image: "/old.png" }],
      newsArticles: [{ id: "article-1", title: "原新闻", body: "原正文" }],
    }],
  };
}

test("本地字段改动与线上无关字段改动可合并", () => {
  const base = fixture();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.hero.subtitle = "本地副标题";
  remote.contact = "线上联系信息";
  remote.revision = "online-new";
  const result = mergeSiteContent(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.merged.hero.subtitle, "本地副标题");
  assert.equal(result.merged.contact, "线上联系信息");
  assert.deepEqual(result.affectedPaths, ["hero.subtitle"]);
});

test("同一字段双方修改时阻止自动应用", () => {
  const base = fixture();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.hero.subtitle = "本地版本";
  remote.hero.subtitle = "线上版本";
  const result = mergeSiteContent(base, local, remote);
  assert.deepEqual(result.conflicts, ["hero.subtitle"]);
  assert.equal(result.merged.hero.subtitle, "线上版本");
});

test("线上新增新闻时保留本地对另一新闻的修改", () => {
  const base = fixture();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.archives[0].newsArticles[0].title = "本地修订";
  remote.archives[0].newsArticles.push({ id: "article-2", title: "线上新增", body: "线上正文" });
  const result = mergeSiteContent(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.merged.archives[0].newsArticles.map((item) => item.title), ["本地修订", "线上新增"]);
  assert.deepEqual(result.affectedPaths, ["archives[events].newsArticles[article-1].title"]);
});

test("按姓名合并不同成员的修改", () => {
  const base = fixture();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.members[0].focus = "动力学";
  remote.members[1].role = "博士生";
  const result = mergeSiteContent(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.merged.members[0].focus, "动力学");
  assert.equal(result.merged.members[1].role, "博士生");
});

test("无稳定键的图片列表双方修改时保守冲突", () => {
  const base = fixture();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.archives[0].gallery[0].image = "/local.png";
  remote.archives[0].gallery[0].image = "/remote.png";
  const result = mergeSiteContent(base, local, remote);
  assert.deepEqual(result.conflicts, ["archives[events].gallery"]);
  assert.equal(result.merged.archives[0].gallery[0].image, "/remote.png");
});

test("本地删除新闻与线上修改同一新闻时冲突", () => {
  const base = fixture();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.archives[0].newsArticles = [];
  remote.archives[0].newsArticles[0].body = "线上更新";
  const result = mergeSiteContent(base, local, remote);
  assert.deepEqual(result.conflicts, ["archives[events].newsArticles[article-1]"]);
});
