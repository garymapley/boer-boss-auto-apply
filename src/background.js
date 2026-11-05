const DEFAULT_SETTINGS = Object.freeze({
  dryRun: true,
  includeKeywords: "",
  excludeKeywords: "销售,保险,中介",
  city: "",
  minSalaryK: 0,
  batchSize: 5,
  dailyLimit: 150,
  minDelaySeconds: 3,
  maxDelaySeconds: 6,
  requirePerJobConfirmation: false
});

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["settings", "events", "daily", "dismissed", "handled"]);
  const settings = { ...DEFAULT_SETTINGS, ...(current.settings || {}) };
  // v0.6.1: the previous build hard-capped this field at 30. Migrate that
  // capped value to the new default while preserving other custom limits.
  if (Number(settings.dailyLimit) === 30) settings.dailyLimit = 150;
  if (Number(settings.minDelaySeconds) === 20 && Number(settings.maxDelaySeconds) === 45) {
    settings.minDelaySeconds = 3;
    settings.maxDelaySeconds = 6;
  }
  const handledById = new Map((current.handled || []).map((item) => [typeof item === "string" ? item : item.jobId, typeof item === "string" ? { jobId: item, outcome: "legacy" } : item]));
  const eventDecision = new Map();
  for (const event of current.events || []) {
    if (event.jobId && ["applied", "send_error", "skip", "handled", "requeued"].includes(event.kind) && !eventDecision.has(event.jobId)) {
      eventDecision.set(event.jobId, event);
    }
  }
  for (const [jobId, event] of eventDecision) {
    if (event.kind === "requeued") handledById.delete(jobId);
    else if (!handledById.has(jobId)) handledById.set(jobId, { jobId, label: event.message || "历史处理岗位", outcome: event.kind, at: event.at });
  }
  await chrome.storage.local.set({
    settings,
    events: current.events || [],
    daily: current.daily || {},
    dismissed: current.dismissed || [],
    handled: [...handledById.values()].filter((item) => item.jobId).slice(0, 1000)
  });
});

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function appendEvent(event) {
  const { events = [] } = await chrome.storage.local.get("events");
  const next = [{ id: crypto.randomUUID(), at: new Date().toISOString(), ...event }, ...events].slice(0, 500);
  await chrome.storage.local.set({ events: next });
  return next[0];
}

async function upsertHandled(jobId, label, outcome) {
  const { handled = [] } = await chrome.storage.local.get("handled");
  const next = [
    { jobId, label: label || "已处理岗位", outcome: outcome || "handled", at: new Date().toISOString() },
    ...handled.filter((item) => (typeof item === "string" ? item : item.jobId) !== jobId)
  ].slice(0, 1000);
  await chrome.storage.local.set({ handled: next });
  return next;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "GET_STATE") {
      const state = await chrome.storage.local.get(["settings", "events", "daily", "dismissed", "handled"]);
      sendResponse({ ok: true, defaults: DEFAULT_SETTINGS, ...state, today: todayKey() });
      return;
    }
    if (message.type === "SAVE_SETTINGS") {
      const safe = { ...DEFAULT_SETTINGS, ...(message.settings || {}) };
      safe.dailyLimit = Math.min(150, Math.max(1, Number(safe.dailyLimit) || 150));
      safe.batchSize = [5, 10, 20, 30, 50].includes(Number(safe.batchSize)) ? Number(safe.batchSize) : 5;
      safe.minDelaySeconds = Math.max(2, Number(safe.minDelaySeconds) || 3);
      safe.maxDelaySeconds = Math.max(safe.minDelaySeconds, Number(safe.maxDelaySeconds) || 6);
      await chrome.storage.local.set({ settings: safe });
      await appendEvent({ kind: "settings", message: "设置已更新" });
      sendResponse({ ok: true, settings: safe });
      return;
    }
    if (message.type === "LOG_EVENT") {
      const event = await appendEvent(message.event || {});
      sendResponse({ ok: true, event });
      return;
    }
    if (message.type === "SET_JOB_DISMISSED") {
      const { dismissed = [] } = await chrome.storage.local.get("dismissed");
      const withoutJob = dismissed.filter((item) => (typeof item === "string" ? item : item.jobId) !== message.jobId);
      const next = message.dismissed
        ? [{ jobId: message.jobId, label: message.label || "已移除岗位", at: new Date().toISOString() }, ...withoutJob].slice(0, 500)
        : withoutJob;
      await chrome.storage.local.set({ dismissed: next });
      await appendEvent({ kind: message.dismissed ? "dismissed" : "restored", jobId: message.jobId, message: message.label || "岗位筛选已更新" });
      sendResponse({ ok: true, dismissed: next });
      return;
    }
    if (message.type === "MARK_HANDLED") {
      const handled = await upsertHandled(message.jobId, message.label, message.outcome);
      await appendEvent({ kind: "handled", jobId: message.jobId, outcome: message.outcome, message: message.label || "岗位已处理" });
      sendResponse({ ok: true, handled });
      return;
    }
    if (message.type === "RESET_HANDLED") {
      const { handled = [] } = await chrome.storage.local.get("handled");
      const next = handled.filter((item) => (typeof item === "string" ? item : item.jobId) !== message.jobId);
      await chrome.storage.local.set({ handled: next });
      await appendEvent({ kind: "requeued", jobId: message.jobId, message: message.label || "岗位已重新加入待投列表" });
      sendResponse({ ok: true, handled: next });
      return;
    }
    if (message.type === "MARK_APPLIED") {
      const key = todayKey();
      const { daily = {} } = await chrome.storage.local.get("daily");
      const today = daily[key] || { applied: 0, jobIds: [] };
      if (!today.jobIds.includes(message.jobId)) {
        today.applied += 1;
        today.jobIds.push(message.jobId);
      }
      daily[key] = today;
      await chrome.storage.local.set({ daily });
      await upsertHandled(message.jobId, message.label, "applied");
      await appendEvent({ kind: "applied", jobId: message.jobId, message: message.label || "已确认投递" });
      sendResponse({ ok: true, today });
      return;
    }
    sendResponse({ ok: false, error: "unknown_message" });
  })().catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
