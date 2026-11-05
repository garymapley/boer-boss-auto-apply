(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BoerMatching = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function splitTerms(value) {
    return String(value || "")
      .split(/[，,、\n]/)
      .map(normalize)
      .filter(Boolean);
  }

  function parseSalary(text) {
    const value = normalize(text).replace(/,/g, "");
    const range = value.match(/(\d+(?:\.\d+)?)\s*[-~—]\s*(\d+(?:\.\d+)?)\s*k/i);
    if (range) return { minK: Number(range[1]), maxK: Number(range[2]) };
    const single = value.match(/(\d+(?:\.\d+)?)\s*k/i);
    if (single) return { minK: Number(single[1]), maxK: Number(single[1]) };
    return { minK: null, maxK: null };
  }

  function evaluateJob(job, settings) {
    const haystack = normalize([
      job.title,
      job.company,
      job.location,
      job.salary,
      job.tags,
      job.description
    ].join(" "));
    const include = splitTerms(settings.includeKeywords);
    const exclude = splitTerms(settings.excludeKeywords);
    const reasons = [];

    const blockedTerm = exclude.find((term) => haystack.includes(term));
    if (blockedTerm) reasons.push(`命中排除词：${blockedTerm}`);
    if (include.length && !include.some((term) => haystack.includes(term))) {
      reasons.push("未命中任一包含词");
    }

    const requiredCity = normalize(settings.city);
    if (requiredCity && !normalize(job.location).includes(requiredCity)) {
      reasons.push(`城市不匹配：${settings.city}`);
    }

    const salary = parseSalary(job.salary);
    const minSalaryK = Number(settings.minSalaryK || 0);
    if (minSalaryK > 0 && salary.maxK !== null && salary.maxK < minSalaryK) {
      reasons.push(`薪资上限低于 ${minSalaryK}K`);
    }

    return { eligible: reasons.length === 0, reasons, salary };
  }

  return { normalize, splitTerms, parseSalary, evaluateJob };
});
