const ids = ["dryRun", "includeKeywords", "excludeKeywords", "city", "minSalaryK", "batchSize", "dailyLimit", "minDelaySeconds", "maxDelaySeconds"];
const $ = (id) => document.getElementById(id);

function message(payload) {
  return new Promise((resolve) => chrome.runtime.sendMessage(payload, resolve));
}

function renderEvents(events) {
  $("events").innerHTML = (events || []).slice(0, 8).map((event) => {
    const time = new Date(event.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    return `<div class="event"><time>${time}</time>${escapeHtml(event.message || event.kind)}</div>`;
  }).join("") || "暂无记录";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

(async () => {
  const state = await message({ type: "GET_STATE" });
  const settings = { ...state.defaults, ...(state.settings || {}) };
  for (const id of ids) $(id)[$(id).type === "checkbox" ? "checked" : "value"] = settings[id];
  renderEvents(state.events);
})();

$("save").addEventListener("click", async () => {
  const settings = {};
  for (const id of ids) settings[id] = $(id).type === "checkbox" ? $(id).checked : $(id).value;
  const response = await message({ type: "SAVE_SETTINGS", settings });
  $("notice").textContent = response.ok ? "已保存，刷新 BOSS 页面后生效" : `保存失败：${response.error}`;
  setTimeout(() => { $("notice").textContent = ""; }, 2500);
});
