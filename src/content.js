(function () {
  "use strict";
  if (window.top !== window || document.getElementById("boer-auto-apply-root")) return;

  const root = document.createElement("div");
  root.id = "boer-auto-apply-root";
  const shadow = root.attachShadow({ mode: "open" });
  document.documentElement.appendChild(root);

  const style = document.createElement("style");
  style.textContent = `
    *{box-sizing:border-box} .panel{width:310px;color:#20202a;background:#fff;border:1px solid #e7e4f2;
    border-radius:16px;box-shadow:0 14px 42px rgba(31,24,60,.18);overflow:hidden;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
    header{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;background:linear-gradient(135deg,#5b37e6,#8b6cff);color:white}
    header strong{font-size:15px} header button{border:0;background:transparent;color:white;font-size:18px;cursor:pointer}
    main{padding:13px}.status{padding:9px 10px;border-radius:10px;background:#f4f1ff;margin-bottom:10px}.warning{background:#fff5dd;color:#7a5000}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0}.stat{padding:8px 5px;text-align:center;border:1px solid #eeeaf8;border-radius:10px;background:#fff;color:#20202a;cursor:pointer;font:inherit;transition:.15s ease}.stat:hover{border-color:#a995ff;background:#faf9ff}.stat:focus-visible{outline:2px solid #7a5cff;outline-offset:2px}.stat.active{border-color:#6b46ee;background:#f0ecff;box-shadow:0 0 0 1px #6b46ee inset}.stat b{display:block;font-size:17px;color:#5b37e6}
    .actions{display:flex;gap:8px}.actions button{flex:1;border:0;border-radius:10px;padding:9px 8px;cursor:pointer;font-weight:650}.primary{background:#5b37e6;color:white}.secondary{background:#ede9ff;color:#4d2ed0}
    .note{font-size:12px;color:#777;margin:9px 0 0}.hidden{display:none}.results-head{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding:7px 0 3px;font-weight:700}.results-head small{font-weight:400;color:#777;text-align:right}.results{max-height:330px;overflow:auto}.job{display:grid;grid-template-columns:24px 1fr 28px;align-items:start;border-top:1px solid #eee;background:#fff}.job:hover,.job.preview{background:#faf9ff}.job.preview{box-shadow:3px 0 0 #6b46ee inset}.job.dismissed,.job.handled{opacity:.55;background:#f7f7f7}.job-check{margin:13px 2px 0 4px;width:15px;height:15px;accent-color:#6540e8;cursor:pointer}.job-check:disabled{cursor:not-allowed;opacity:.35}.job-open{width:100%;border:0;padding:9px 2px;text-align:left;background:transparent;color:#20202a;cursor:pointer;font:inherit}.job-open:focus-visible{outline:2px solid #7a5cff;outline-offset:-2px}.job-dismiss{border:0;background:transparent;color:#999;font-size:18px;line-height:1;padding:11px 5px;cursor:pointer}.job-dismiss:hover{color:#d94a4a}.job-dismiss.restore{color:#6540e8;font-size:15px}.job-open b{display:block}.job-meta{display:block;color:#777;font-size:12px;margin:2px 0}.salary-copy{color:#f05b45}.preview-tag,.dismissed-tag,.handled-tag{display:inline-block;margin-left:5px;padding:0 5px;border-radius:8px;background:#6b46ee;color:#fff;font-size:11px}.dismissed-tag{background:#999}.handled-tag{background:#4f7b6b}.ok{color:#16855b}.bad{color:#a85b00}.empty{padding:14px 4px;color:#777;text-align:center}
  `;
  shadow.appendChild(style);

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `
    <header><strong>博尔简历自投</strong><button id="boer-toggle" title="收起">−</button></header>
    <main id="boer-main">
      <div id="boer-status" class="status">正在读取设置…</div>
      <div class="stats">
        <button class="stat active" data-view="all" aria-pressed="true"><b id="boer-found">0</b>识别</button>
        <button class="stat" data-view="matched" aria-pressed="false"><b id="boer-match">0</b>匹配</button>
        <button class="stat" data-view="today" aria-pressed="false"><b id="boer-applied">0</b>今日</button>
      </div>
      <div class="actions"><button class="secondary" id="boer-scan">扫描岗位</button><button class="primary" id="boer-run">试运行 5 个</button></div>
      <p class="note">使用当前 BOSS 筛选结果和在线简历。真实投递只在开始前确认一次。</p>
      <div class="results-head"><span id="boer-results-title">识别岗位（0）</span><small id="boer-selection-note">勾选后参与本轮</small></div>
      <div id="boer-results" class="results"></div>
    </main>`;
  shadow.appendChild(panel);

  const $ = (selector) => shadow.querySelector(selector);
  let settings = null;
  let jobs = [];
  let running = false;
  let stopRequested = false;
  let activeView = "all";
  let todayApplied = 0;
  let todayJobIds = [];
  let appliedEvents = [];
  let selectedJobIds = new Set();
  let previewJobIds = new Set();
  let dismissedJobIds = new Set();
  let handledJobIds = new Set();
  let extensionContextInvalid = false;

  function markExtensionContextInvalid(detail) {
    extensionContextInvalid = true;
    stopRequested = true;
    const status = $("#boer-status");
    if (status) {
      status.className = "status warning";
      status.textContent = "扩展已更新，请刷新当前 BOSS 页面后继续";
    }
    const runButton = $("#boer-run");
    const scanButton = $("#boer-scan");
    if (runButton) runButton.disabled = true;
    if (scanButton) scanButton.disabled = true;
    return { ok: false, error: detail || "extension_context_invalidated", contextInvalidated: true };
  }

  function message(payload) {
    return new Promise((resolve) => {
      if (extensionContextInvalid) {
        resolve({ ok: false, error: "extension_context_invalidated", contextInvalidated: true });
        return;
      }
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          resolve(markExtensionContextInvalid());
          return;
        }
        chrome.runtime.sendMessage(payload, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            const detail = runtimeError.message || "extension_context_invalidated";
            if (/context invalidated|receiving end does not exist/i.test(detail)) resolve(markExtensionContextInvalid(detail));
            else resolve({ ok: false, error: detail });
            return;
          }
          resolve(response || { ok: false, error: "empty_response" });
        });
      } catch (error) {
        const detail = String(error?.message || error || "extension_context_invalidated");
        resolve(markExtensionContextInvalid(detail));
      }
    });
  }

  function textOf(el, selectors) {
    for (const selector of selectors) {
      const found = el.querySelector(selector);
      if (found?.textContent?.trim()) return found.textContent.trim();
    }
    return "";
  }

  function getJobId(url) {
    const match = String(url || "").match(/job_detail\/([^/?#.]+)/);
    return match ? match[1] : String(url || "");
  }

  function discoverCards() {
    const links = [...document.querySelectorAll('a[href*="/job_detail/"]')];
    const seen = new Set();
    const discovered = [];
    for (const link of links) {
      const card = link.closest("li") || link.closest("article, [class*='job-card'], [class*='job-list'], [class*='search-job']") || link.parentElement;
      if (!card) continue;
      const url = link.href;
      const id = getJobId(url);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const title = textOf(card, [".job-name", "[class*='job-name']", "[class*='job-title']"]) || link.textContent.trim();
      const companyLink = card.querySelector('a[href*="/gongsi/"]');
      const company = textOf(card, [".company-name", "[class*='company-name']", "[class*='company']"]) || companyLink?.textContent?.trim() || "";
      const salaryElement = card.querySelector(".salary, [class*='salary']");
      const salary = salaryElement?.textContent?.trim() || "";
      const salaryFont = salaryElement ? getComputedStyle(salaryElement).fontFamily : "";
      const location = textOf(card, [".job-area", "[class*='job-area']", "[class*='location']"]);
      const tags = [...card.querySelectorAll(".tag-list li, [class*='tag']")].map((el) => el.textContent.trim()).join(" ");
      const result = BoerMatching.evaluateJob({ title, company, salary, location, tags }, settings);
      discovered.push({ id, url, title, company, salary, salaryFont, location, card, link, result });
    }
    return discovered;
  }

  function render() {
    const eligible = jobs.filter((job) => job.result.eligible && !dismissedJobIds.has(job.id) && !handledJobIds.has(job.id));
    $("#boer-found").textContent = jobs.length;
    $("#boer-match").textContent = eligible.length;
    $("#boer-applied").textContent = todayApplied;
    $("#boer-run").textContent = running ? "停止" : (settings?.dryRun ? `试运行 ${settings.batchSize} 个` : `一键投递 ${settings.batchSize} 个`);
    $("#boer-status").className = `status ${settings?.dryRun ? "" : "warning"}`;
    $("#boer-status").textContent = settings?.dryRun ? "试运行模式：不会发送任何消息" : `真实模式：单次最多投递 ${settings.batchSize} 个`;
    shadow.querySelectorAll(".stat[data-view]").forEach((button) => {
      const selected = button.dataset.view === activeView;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    if (activeView === "today") {
      $("#boer-selection-note").textContent = "点击岗位可定位";
      renderTodayResults();
      return;
    }
    const visibleJobs = activeView === "matched" ? eligible : jobs;
    $("#boer-results-title").textContent = `${activeView === "matched" ? "匹配岗位" : "识别岗位"}（${visibleJobs.length}）`;
    $("#boer-selection-note").textContent = selectedJobIds.size ? `已选 ${selectedJobIds.size} 个${selectedJobIds.size > (settings?.batchSize || 5) ? `（本轮前 ${settings.batchSize}）` : ""}` : `未选则默认前 ${settings?.batchSize || 5} 个`;
    $("#boer-results").innerHTML = visibleJobs.length ? visibleJobs.map(jobMarkup).join("") : `<div class="empty">${jobs.length ? "当前没有符合规则的岗位" : "请先扫描当前页面岗位"}</div>`;
  }

  function jobMarkup(job) {
    const preview = previewJobIds.has(job.id);
    const dismissed = dismissedJobIds.has(job.id);
    const handled = handledJobIds.has(job.id);
    const companyAndLocation = [job.company, job.location].filter(Boolean).join("｜");
    const salary = job.salary ? `<span class="salary-copy"${job.salaryFont ? ` style="font-family:${escapeHtml(job.salaryFont)}"` : ""}>${escapeHtml(job.salary)}</span>` : "薪资未识别";
    return `<div class="job${preview ? " preview" : ""}${dismissed ? " dismissed" : ""}${handled ? " handled" : ""}" data-job-id="${escapeHtml(job.id)}">
      <input class="job-check" type="checkbox" data-select-job="${escapeHtml(job.id)}" aria-label="选择 ${escapeHtml(job.title || "该岗位")}" ${selectedJobIds.has(job.id) ? "checked" : ""} ${job.result.eligible && !dismissed && !handled ? "" : "disabled"}>
      <button class="job-open" data-locate-job="${escapeHtml(job.id)}">
        <b>${escapeHtml(job.title || "未识别职位")}${preview ? `<span class="preview-tag">本轮目标</span>` : ""}${dismissed ? `<span class="dismissed-tag">已移除</span>` : ""}${handled ? `<span class="handled-tag">已处理</span>` : ""}</b>
        <span class="job-meta">${companyAndLocation ? `${escapeHtml(companyAndLocation)}｜` : ""}${salary}</span>
        <span class="${job.result.eligible && !dismissed && !handled ? "ok" : "bad"}">${handled ? "已在此前批次处理，不会重复投递" : (dismissed ? "不会参与默认投递" : (job.result.eligible ? "符合规则，点击定位" : escapeHtml(job.result.reasons.join("；"))))}</span>
      </button>
      ${handled ? `<button class="job-dismiss restore" data-retry-job="${escapeHtml(job.id)}" title="允许再次投递" aria-label="重新加入待投 ${escapeHtml(job.title || "该岗位")}">↶</button>` : (job.result.eligible ? `<button class="job-dismiss${dismissed ? " restore" : ""}" data-dismiss-job="${escapeHtml(job.id)}" title="${dismissed ? "恢复到匹配岗位" : "从匹配岗位移除"}" aria-label="${dismissed ? "恢复" : "移除"} ${escapeHtml(job.title || "该岗位")}">${dismissed ? "↶" : "×"}</button>` : `<span></span>`)}
    </div>`;
  }

  function renderTodayResults() {
    $("#boer-results-title").textContent = `今日已投（${todayApplied}）`;
    const records = todayJobIds.map((jobId) => {
      const current = jobs.find((job) => job.id === jobId);
      const event = appliedEvents.find((item) => item.jobId === jobId);
      return { jobId, label: current ? `${current.title}｜${current.company}` : (event?.message || "已投递岗位"), current };
    });
    $("#boer-results").innerHTML = records.length ? records.map((record) => `<div class="job" data-job-id="${escapeHtml(record.jobId)}">
      <span></span><button class="job-open" data-locate-job="${escapeHtml(record.jobId)}">
        <b>${escapeHtml(record.label)}</b>
        <span class="${record.current ? "ok" : "job-meta"}">${record.current ? "当前页面可定位" : "当前页面未加载该岗位"}</span>
      </button><span></span>
    </div>`).join("") : `<div class="empty">今天还没有正式投递记录</div>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  async function scan() {
    document.querySelectorAll(".boer-match,.boer-skip,.boer-preview").forEach((el) => el.classList.remove("boer-match", "boer-skip", "boer-preview"));
    jobs = discoverCards();
    const currentIds = new Set(jobs.map((job) => job.id));
    selectedJobIds = new Set([...selectedJobIds].filter((id) => currentIds.has(id)));
    previewJobIds = new Set();
    for (const job of jobs) job.card.classList.add(job.result.eligible && !dismissedJobIds.has(job.id) && !handledJobIds.has(job.id) ? "boer-match" : "boer-skip");
    render();
    await message({ type: "LOG_EVENT", event: { kind: "scan", message: `识别 ${jobs.length} 个岗位，待投 ${jobs.filter((j) => j.result.eligible && !dismissedJobIds.has(j.id) && !handledJobIds.has(j.id)).length} 个` } });
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function jobTitleKey(job) {
    return BoerMatching.normalize(job?.title).replace(/\s+/g, "").slice(0, 10);
  }

  function contactButtonText(element) {
    return (element?.textContent || "").replace(/\s+/g, "").trim();
  }

  function isContactButtonText(text) {
    return /^(立即沟通|继续沟通|投递简历|与BOSS聊聊|继续聊聊|发起沟通|聊一聊)$/.test(String(text || "").replace(/\s+/g, ""));
  }

  function findContactButtonForJob(job) {
    const titleKey = jobTitleKey(job);
    if (!titleKey) return null;
    const candidates = [...document.querySelectorAll("button, a")].filter((element) =>
      !root.contains(element) && isVisible(element) && isContactButtonText(contactButtonText(element))
    );
    for (const button of candidates) {
      let container = button.parentElement;
      while (container && container !== document.body) {
        const rect = container.getBoundingClientRect();
        const text = BoerMatching.normalize(container.innerText).replace(/\s+/g, "");
        if (rect.width > 0 && rect.left > window.innerWidth * 0.25 && rect.width < window.innerWidth * 0.72 && text.includes(titleKey)) return button;
        container = container.parentElement;
      }
    }
    return null;
  }

  function visibleActionError() {
    const pattern = /缺少必要参数|操作失败|请求失败|请稍后重试|网络异常|系统异常/;
    return [...document.querySelectorAll("[role='alert'], [class*='toast'], [class*='message'], [class*='notice']")]
      .find((element) => {
        const text = (element.textContent || "").trim();
        return !root.contains(element) && isVisible(element) && text.length <= 120 && pattern.test(text);
      })?.textContent?.trim() || "";
  }

  function visibleActionSuccess() {
    const pattern = /沟通成功|发送成功|已发送|已向BOSS发送消息|投递成功|招呼成功/;
    return [...document.querySelectorAll("[role='alert'], [class*='toast'], [class*='message'], [class*='notice']")]
      .find((element) => {
        const text = (element.textContent || "").trim();
        return !root.contains(element) && isVisible(element) && text.length <= 120 && pattern.test(text);
      })?.textContent?.trim() || "";
  }

  function findStayOnPageButton() {
    return [...document.querySelectorAll("button, a")].find((element) =>
      !root.contains(element) && isVisible(element) && (element.textContent || "").replace(/\s+/g, "").trim() === "留在此页"
    ) || null;
  }

  function hasRiskBlocker() {
    const visibleText = document.body?.innerText || "";
    return /安全验证|请完成验证|验证码|行为异常|访问异常|账号异常|操作频繁/.test(visibleText);
  }

  async function waitFor(check, timeoutMs = 7000, stepMs = 200) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = check();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
    return null;
  }

  function activatePageElement(element) {
    if (!element) return false;
    const href = (element.getAttribute?.("href") || "").trim();
    if (/^javascript:/i.test(href)) {
      element.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
    }
    return element.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window
    }));
  }

  async function selectJob(job) {
    const fresh = discoverCards().find((item) => item.id === job.id);
    if (!fresh) return null;
    Object.assign(job, fresh);
    job.card.scrollIntoView({ block: "center", behavior: "auto" });
    activatePageElement(job.link);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return waitFor(() => findContactButtonForJob(job), 9000, 250);
  }

  async function verifyContactResult(job, initialButtonText, initialSuccessText) {
    const started = Date.now();
    while (Date.now() - started < 3000) {
      const error = visibleActionError();
      if (error) return { ok: false, error };
      const stayButton = findStayOnPageButton();
      if (stayButton) {
        activatePageElement(stayButton);
        const closed = await waitFor(() => !findStayOnPageButton(), 2500, 100);
        if (!closed) return { ok: true, evidence: "消息已发送，但弹窗未完全关闭", dialogOpen: true };
        return { ok: true, evidence: "已发送并自动选择留在此页" };
      }
      const success = visibleActionSuccess();
      if (success && success !== initialSuccessText) return { ok: true, evidence: success };
      const latestButton = findContactButtonForJob(job);
      const latestText = contactButtonText(latestButton);
      if (/^(继续沟通|继续聊聊)$/.test(latestText)) return { ok: true, evidence: latestText };
      if (latestText && latestText !== initialButtonText && !/^(立即沟通|与BOSS聊聊|发起沟通|聊一聊)$/.test(latestText)) {
        return { ok: true, evidence: `按钮状态已变为：${latestText}` };
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const lateError = visibleActionError();
    if (lateError) return { ok: false, error: lateError };
    if (/^(立即沟通|与BOSS聊聊|发起沟通|聊一聊)$/.test(initialButtonText)) {
      return { ok: true, inferred: true, evidence: "点击后 3 秒内未出现错误" };
    }
    return { ok: false, error: "未检测到明确的投递成功状态" };
  }

  async function locateJob(jobId) {
    if (running) return;
    const job = jobs.find((item) => item.id === jobId);
    if (!job) {
      $("#boer-status").textContent = "该岗位不在当前已扫描页面，请翻页后重新扫描";
      return;
    }
    $("#boer-status").textContent = `正在定位：${job.title}`;
    const button = await selectJob(job);
    job.card.classList.add("boer-match");
    $("#boer-status").textContent = button ? `已定位：${job.title}（不会自动投递）` : `已滚动到：${job.title}，但岗位详情可能尚未加载`;
  }

  async function refreshTodayState() {
    const state = await message({ type: "GET_STATE" });
    if (!state?.ok) return;
    const today = state.daily?.[state.today] || { applied: 0, jobIds: [] };
    todayApplied = today.applied || 0;
    todayJobIds = Array.isArray(today.jobIds) ? today.jobIds : [];
    appliedEvents = (state.events || []).filter((event) => event.kind === "applied" && todayJobIds.includes(event.jobId));
    $("#boer-applied").textContent = todayApplied;
  }

  function runTargets() {
    const eligible = jobs.filter((job) => job.result.eligible && !dismissedJobIds.has(job.id) && !handledJobIds.has(job.id));
    const selected = eligible.filter((job) => selectedJobIds.has(job.id));
    return (selected.length ? selected : eligible).slice(0, settings.batchSize);
  }

  function markPreviewTargets(targets) {
    document.querySelectorAll(".boer-preview").forEach((element) => element.classList.remove("boer-preview"));
    previewJobIds = new Set(targets.map((job) => job.id));
    for (const job of targets) job.card.classList.add("boer-preview");
  }

  async function markJobHandled(job, outcome, detail) {
    handledJobIds.add(job.id);
    selectedJobIds.delete(job.id);
    previewJobIds.delete(job.id);
    await message({
      type: "MARK_HANDLED",
      jobId: job.id,
      outcome,
      label: `${job.title}｜${job.company}${detail ? `：${detail}` : ""}`
    });
  }

  async function setJobDismissed(jobId, dismissed) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    const response = await message({ type: "SET_JOB_DISMISSED", jobId, dismissed, label: `${job.title}｜${job.company}` });
    if (!response?.ok) {
      $("#boer-status").textContent = "移除岗位失败，请重新加载插件后再试";
      return;
    }
    let statusText = "";
    if (dismissed) {
      dismissedJobIds.add(jobId);
      selectedJobIds.delete(jobId);
      previewJobIds.delete(jobId);
      job.card.classList.remove("boer-match", "boer-preview");
      job.card.classList.add("boer-skip");
      statusText = `已移除：${job.title}，不会参与默认投递`;
    } else {
      dismissedJobIds.delete(jobId);
      job.card.classList.remove("boer-skip");
      job.card.classList.add(job.result.eligible ? "boer-match" : "boer-skip");
      statusText = `已恢复：${job.title}`;
    }
    render();
    $("#boer-status").textContent = statusText;
  }

  async function resetJobHandled(jobId) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;
    const response = await message({ type: "RESET_HANDLED", jobId, label: `${job.title}｜${job.company}` });
    if (!response?.ok) {
      $("#boer-status").textContent = "恢复岗位失败，请重新加载插件后再试";
      return;
    }
    handledJobIds.delete(jobId);
    job.card.classList.remove("boer-skip");
    job.card.classList.add(job.result.eligible && !dismissedJobIds.has(job.id) ? "boer-match" : "boer-skip");
    render();
    $("#boer-status").textContent = `已重新加入待投：${job.title}`;
  }

  async function run() {
    if (running) {
      stopRequested = true;
      $("#boer-status").textContent = "正在安全停止…";
      return;
    }
    running = true;
    stopRequested = false;
    render();
    try {
      if (!jobs.length) await scan();
      const eligible = runTargets();
      const usedSelection = jobs.some((job) => job.result.eligible && !dismissedJobIds.has(job.id) && !handledJobIds.has(job.id) && selectedJobIds.has(job.id));
      markPreviewTargets(eligible);
      if (settings.dryRun) {
        await message({ type: "LOG_EVENT", event: { kind: "dry_run", message: `试运行完成：${eligible.length} 个岗位可进入一键投递` } });
        render();
        $("#boer-status").textContent = `试运行完成：${usedSelection ? "已选" : "默认前"} ${eligible.length} 个岗位，已标记为“本轮目标”，没有发送`;
        return;
      }
      if (!eligible.length) {
        $("#boer-status").textContent = "当前页面没有符合规则的岗位";
        return;
      }
      const approved = window.confirm(`确认开始本轮一键投递吗？\n\n数量：最多 ${eligible.length} 个\n来源：${usedSelection ? "你勾选的岗位" : "匹配结果中最前面的岗位"}\n范围：当前 BOSS 筛选结果\n简历：你当前的 BOSS 在线简历\n间隔：${settings.minDelaySeconds}–${settings.maxDelaySeconds} 秒\n\n运行中可以随时点击“停止”。`);
      if (!approved) {
        await message({ type: "LOG_EVENT", event: { kind: "cancel", message: "用户取消批量投递" } });
        return;
      }
      let consecutiveFailures = 0;
      let successfulCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      let stoppedReason = "";
      for (let index = 0; index < eligible.length; index += 1) {
        const job = eligible[index];
        if (stopRequested) {
          stoppedReason = "用户已停止";
          break;
        }
        if (hasRiskBlocker()) {
          stoppedReason = "检测到验证或风控提示，已自动停止";
          await message({ type: "LOG_EVENT", event: { kind: "risk", message: "检测到验证或风控提示，已停止" } });
          break;
        }
        const latest = await message({ type: "GET_STATE" });
        if (!latest?.ok) {
          stoppedReason = latest?.contextInvalidated ? "扩展已更新，请刷新当前 BOSS 页面" : "读取今日投递记录失败，已停止";
          break;
        }
        const usedToday = latest.daily?.[latest.today]?.applied || 0;
        if (usedToday >= settings.dailyLimit) {
          stoppedReason = `已达到今日上限 ${settings.dailyLimit}，本次运行已停止`;
          await message({ type: "LOG_EVENT", event: { kind: "limit", message: `达到今日上限 ${settings.dailyLimit}，已停止` } });
          break;
        }
        $("#boer-status").textContent = `正在打开：${job.title}`;
        const button = await selectJob(job);
        if (!button) {
          await message({ type: "LOG_EVENT", event: { kind: "skip", jobId: job.id, message: `${job.title}：详情未刷新或未找到沟通按钮` } });
          await markJobHandled(job, "failed", "详情未刷新或未找到沟通按钮");
          consecutiveFailures += 1;
          failedCount += 1;
          if (consecutiveFailures >= 3) {
            stoppedReason = "连续 3 个岗位无法加载详情，已停止以避免误投";
            break;
          }
          continue;
        }
        const buttonText = contactButtonText(button);
        if (/^(继续沟通|继续聊聊)$/.test(buttonText)) {
          await message({ type: "LOG_EVENT", event: { kind: "skip", jobId: job.id, message: `${job.title}：此前已经沟通过，跳过` } });
          await markJobHandled(job, "already_contacted", "此前已经沟通过");
          consecutiveFailures = 0;
          skippedCount += 1;
          continue;
        }
        const errorCleared = await waitFor(() => !visibleActionError(), 3000, 200);
        if (!errorCleared) {
          await message({ type: "LOG_EVENT", event: { kind: "send_error", jobId: job.id, message: `${job.title}：页面错误提示未消失，跳过` } });
          await markJobHandled(job, "failed", "页面错误提示未消失");
          consecutiveFailures += 1;
          failedCount += 1;
          if (consecutiveFailures >= 3) {
            stoppedReason = "页面连续出现错误提示，已自动停止";
            break;
          }
          continue;
        }
        const successBeforeClick = visibleActionSuccess();
        activatePageElement(button);
        const result = await verifyContactResult(job, buttonText, successBeforeClick);
        if (!result?.ok) {
          consecutiveFailures += 1;
          failedCount += 1;
          const reason = result?.error || "未检测到沟通成功状态";
          await message({ type: "LOG_EVENT", event: { kind: "send_error", jobId: job.id, message: `${job.title}：${reason}` } });
          await markJobHandled(job, "failed", reason);
          $("#boer-status").textContent = `${job.title} 投递失败：${reason}，已跳过`;
          if (consecutiveFailures >= 3) {
            stoppedReason = "连续 3 个岗位投递失败，已自动停止";
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }
        consecutiveFailures = 0;
        successfulCount += 1;
        if (result.inferred) {
          await message({ type: "LOG_EVENT", event: { kind: "send_inferred", jobId: job.id, message: `${job.title}：${result.evidence}` } });
        }
        await message({ type: "MARK_APPLIED", jobId: job.id, label: `${job.title}｜${job.company}` });
        handledJobIds.add(job.id);
        selectedJobIds.delete(job.id);
        previewJobIds.delete(job.id);
        await refreshTodayState();
        if (result.dialogOpen) {
          stoppedReason = "消息已发送，但“留在此页”弹窗未能自动关闭，已安全停止";
          break;
        }
        if (hasRiskBlocker()) {
          stoppedReason = "投递后出现验证或异常提示，已停止";
          break;
        }
        if (index < eligible.length - 1) {
          const delay = Math.round((settings.minDelaySeconds + Math.random() * (settings.maxDelaySeconds - settings.minDelaySeconds)) * 1000);
          $("#boer-status").textContent = `已成功 ${successfulCount} 个，等待 ${Math.ceil(delay / 1000)} 秒后继续下一份`;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      const summary = `成功 ${successfulCount}，跳过 ${skippedCount}，失败 ${failedCount}`;
      const finalStatus = stoppedReason ? `${stoppedReason}（${summary}）` : `本轮完成：${summary}`;
      render();
      $("#boer-status").textContent = finalStatus;
    } finally {
      running = false;
      stopRequested = false;
      $("#boer-run").textContent = settings?.dryRun ? `试运行 ${settings.batchSize} 个` : `一键投递 ${settings.batchSize} 个`;
    }
  }

  $("#boer-toggle").addEventListener("click", () => {
    $("#boer-main").classList.toggle("hidden");
    $("#boer-toggle").textContent = $("#boer-main").classList.contains("hidden") ? "+" : "−";
  });
  $("#boer-scan").addEventListener("click", scan);
  $("#boer-run").addEventListener("click", run);
  shadow.querySelector(".stats").addEventListener("click", async (event) => {
    const button = event.target.closest(".stat[data-view]");
    if (!button) return;
    activeView = button.dataset.view;
    if (activeView === "today") await refreshTodayState();
    render();
  });
  $("#boer-results").addEventListener("change", (event) => {
    const checkbox = event.target.closest(".job-check[data-select-job]");
    if (!checkbox) return;
    if (checkbox.checked) selectedJobIds.add(checkbox.dataset.selectJob);
    else selectedJobIds.delete(checkbox.dataset.selectJob);
    previewJobIds = new Set();
    document.querySelectorAll(".boer-preview").forEach((element) => element.classList.remove("boer-preview"));
    render();
  });
  $("#boer-results").addEventListener("click", (event) => {
    const retryButton = event.target.closest(".job-dismiss[data-retry-job]");
    if (retryButton) {
      resetJobHandled(retryButton.dataset.retryJob);
      return;
    }
    const dismissButton = event.target.closest(".job-dismiss[data-dismiss-job]");
    if (dismissButton) {
      const jobId = dismissButton.dataset.dismissJob;
      setJobDismissed(jobId, !dismissedJobIds.has(jobId));
      return;
    }
    const item = event.target.closest(".job-open[data-locate-job]");
    if (item) locateJob(item.dataset.locateJob);
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && changes.settings) {
      settings = changes.settings.newValue;
      render();
    }
  });

  (async () => {
    const state = await message({ type: "GET_STATE" });
    if (!state?.ok) return;
    settings = { ...state.defaults, ...(state.settings || {}) };
    const today = state.daily?.[state.today] || { applied: 0, jobIds: [] };
    todayApplied = today.applied || 0;
    todayJobIds = Array.isArray(today.jobIds) ? today.jobIds : [];
    appliedEvents = (state.events || []).filter((event) => event.kind === "applied" && todayJobIds.includes(event.jobId));
    dismissedJobIds = new Set((state.dismissed || []).map((item) => typeof item === "string" ? item : item.jobId).filter(Boolean));
    handledJobIds = new Set((state.handled || []).map((item) => typeof item === "string" ? item : item.jobId).filter(Boolean));
    render();
  })();
})();
