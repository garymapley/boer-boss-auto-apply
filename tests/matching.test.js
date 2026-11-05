const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSalary, evaluateJob, splitTerms } = require("../src/matching.js");

test("splits Chinese and English delimiters", () => {
  assert.deepEqual(splitTerms("产品经理，AI 产品, SaaS\nB端"), ["产品经理", "ai 产品", "saas", "b端"]);
});

test("parses common salary formats", () => {
  assert.deepEqual(parseSalary("20-35K·14薪"), { minK: 20, maxK: 35 });
  assert.deepEqual(parseSalary("15K"), { minK: 15, maxK: 15 });
});

test("accepts matching job", () => {
  const result = evaluateJob(
    { title: "AI 产品经理", company: "示例科技", location: "上海·浦东", salary: "25-40K", tags: "SaaS" },
    { includeKeywords: "产品经理,AI", excludeKeywords: "销售,保险", city: "上海", minSalaryK: 20 }
  );
  assert.equal(result.eligible, true);
});

test("rejects excluded, wrong city, and low salary jobs", () => {
  const result = evaluateJob(
    { title: "产品销售", company: "示例公司", location: "北京", salary: "8-12K", tags: "" },
    { includeKeywords: "产品", excludeKeywords: "销售", city: "上海", minSalaryK: 20 }
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reasons.length, 3);
});
