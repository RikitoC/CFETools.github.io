(() => {
  "use strict";

  const configuredBase = String(window.CFE_TIME_CONFIG?.apiBase || "").replace(/\/$/, "");
  const apiConfigured = configuredBase && !configuredBase.includes("REPLACE-WITH-YOUR-WORKER");
  const apiBase = apiConfigured ? configuredBase : "";

  const $ = (id) => document.getElementById(id);
  const elements = {
    historyToggle: $("historyToggle"), historyPanel: $("historyPanel"), historyCount: $("historyCount"), historyList: $("historyList"),
    newSheetButton: $("newSheetButton"), saveButton: $("saveButton"), saveIndicator: $("saveIndicator"), statusBadge: $("statusBadge"),
    setupMessage: $("setupMessage"), appMessage: $("appMessage"), siteInput: $("siteInput"), workDateInput: $("workDateInput"),
    technicianCount: $("technicianCount"), technicianList: $("technicianList"), addTechnicianButton: $("addTechnicianButton"),
    leadTechInput: $("leadTechInput"), leadDateInput: $("leadDateInput"), leadSignatureControl: $("leadSignatureControl"),
    printButton: $("printButton"), completeButton: $("completeButton"), printRoot: $("printRoot"),
    signatureDialog: $("signatureDialog"), signatureTitle: $("signatureTitle"), signatureCanvas: $("signatureCanvas"),
    signatureHint: $("signatureHint"), signatureError: $("signatureError"), clearSignatureButton: $("clearSignatureButton"),
    acceptSignatureButton: $("acceptSignatureButton")
  };

  let sheet = createSheet();
  let summaries = [];
  let saveTimer = null;
  let signatureTarget = null;
  let drawing = false;
  let hasInk = false;

  function localDate() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function createEntry() {
    return { id: crypto.randomUUID(), technicianName: "", timeIn: "", timeOut: "", signatureKey: null };
  }

  function createSheet() {
    const date = localDate();
    return { id: crypto.randomUUID(), site: "", workDate: date, leadTech: "", leadDate: date, leadSignatureKey: null, status: "draft", createdAt: new Date().toISOString(), entries: [createEntry()] };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }

  function formatTime(value) {
    if (!value) return "";
    const [hourText, minute] = value.split(":");
    const hour = Number(hourText);
    return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
  }

  function meaningfulEntry(entry) {
    return Boolean(entry.technicianName.trim() || entry.timeIn || entry.timeOut || entry.signatureKey);
  }

  function meaningfulSheet() {
    return Boolean(sheet.site.trim() || sheet.leadTech.trim() || sheet.leadSignatureKey || sheet.entries.some(meaningfulEntry));
  }

  function signatureUrl(key) {
    return key && apiConfigured ? `${apiBase}/api/signatures?key=${encodeURIComponent(key)}` : "";
  }

  async function api(path, options = {}) {
    if (!apiConfigured) throw new Error("Add your Cloudflare Worker address to reports/time/config.js before saving.");
    const response = await fetch(`${apiBase}${path}`, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }

  function setMessage(text = "", isError = false) {
    elements.appMessage.textContent = text;
    elements.appMessage.classList.toggle("hidden", !text);
    elements.appMessage.classList.toggle("error", isError);
  }

  function setSaveState(state) {
    const labels = { idle: "Autosave on", saving: "Saving…", saved: "✓ Saved", error: "Save failed" };
    elements.saveIndicator.textContent = labels[state] || labels.idle;
    elements.saveIndicator.className = `save-indicator ${state}`;
  }

  function setDraft() {
    if (sheet.status === "complete") sheet.status = "draft";
    renderStatus();
    scheduleSave();
  }

  function renderStatus() {
    elements.statusBadge.textContent = sheet.status === "complete" ? "✓ Complete" : "Draft";
    elements.statusBadge.className = `status-badge ${sheet.status}`;
  }

  function renderSignatureControl(key, target, label) {
    const preview = key
      ? `<div class="signature-preview"><img src="${escapeHtml(signatureUrl(key))}" alt="${escapeHtml(label)}"><span>✓ Signed</span></div>`
      : `<div class="signature-empty">Not signed</div>`;
    return `<div class="signature-control">${preview}<div class="signature-actions"><button class="button outline sign-button" type="button" data-sign-target="${escapeHtml(target)}" data-sign-label="${escapeHtml(label)}">${key ? "Re-sign" : "Sign"}</button>${key ? `<button class="button outline clear-saved-signature" type="button" data-clear-target="${escapeHtml(target)}">Clear</button>` : ""}</div></div>`;
  }

  function renderTechnicians() {
    elements.technicianCount.textContent = `${sheet.entries.length} total`;
    elements.technicianList.innerHTML = sheet.entries.map((entry, index) => `
      <article class="technician-card" data-entry-id="${escapeHtml(entry.id)}">
        <div class="technician-number">${String(index + 1).padStart(2, "0")}</div>
        <label class="name-field"><span>Technician name</span><input data-field="technicianName" value="${escapeHtml(entry.technicianName)}" placeholder="Full name" maxlength="120"></label>
        <label class="time-in-field"><span>Time in</span><input data-field="timeIn" type="time" value="${escapeHtml(entry.timeIn)}"></label>
        <label class="time-out-field"><span>Time out</span><input data-field="timeOut" type="time" value="${escapeHtml(entry.timeOut)}"></label>
        <div class="signature-field"><span>Signature</span>${renderSignatureControl(entry.signatureKey, entry.id, `${entry.technicianName || `Technician ${index + 1}`} signature`)}</div>
        <button class="remove-tech" type="button" data-remove-entry="${escapeHtml(entry.id)}" aria-label="Remove technician ${index + 1}" ${sheet.entries.length === 1 ? "disabled" : ""}>×</button>
      </article>`).join("");
  }

  function renderLeadSignature() {
    elements.leadSignatureControl.innerHTML = renderSignatureControl(sheet.leadSignatureKey, "lead", "Lead technician signature");
  }

  function renderForm() {
    elements.siteInput.value = sheet.site;
    elements.workDateInput.value = sheet.workDate;
    elements.leadTechInput.value = sheet.leadTech;
    elements.leadDateInput.value = sheet.leadDate;
    renderStatus();
    renderTechnicians();
    renderLeadSignature();
    renderHistory();
  }

  function renderHistory() {
    elements.historyCount.textContent = summaries.length;
    if (!summaries.length) {
      elements.historyList.innerHTML = `<div class="history-empty">No saved sheets yet.</div>`;
      return;
    }
    elements.historyList.innerHTML = summaries.map((summary) => `
      <button class="history-item ${summary.id === sheet.id ? "active" : ""}" type="button" data-open-sheet="${escapeHtml(summary.id)}">
        <span><strong>${escapeHtml(summary.site || "Untitled sheet")}</strong><span>${escapeHtml(formatDate(summary.workDate))} · ${summary.status === "complete" ? "Complete" : "Draft"}</span></span>
        <b>${Number(summary.technicianCount || 0)}</b>
      </button>`).join("");
  }

  function scheduleSave() {
    setSaveState("idle");
    window.clearTimeout(saveTimer);
    if (!meaningfulSheet() || !apiConfigured) return;
    saveTimer = window.setTimeout(() => saveSheet(true), 900);
  }

  async function saveSheet(quiet = false) {
    if (quiet && !meaningfulSheet()) return;
    window.clearTimeout(saveTimer);
    setSaveState("saving");
    if (!quiet) setMessage();
    try {
      await api("/api/sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sheet) });
      setSaveState("saved");
      const summary = { ...sheet, technicianCount: sheet.entries.filter(meaningfulEntry).length, updatedAt: new Date().toISOString() };
      delete summary.entries;
      summaries = [summary, ...summaries.filter((item) => item.id !== sheet.id)].sort((a, b) => b.workDate.localeCompare(a.workDate));
      renderHistory();
    } catch (error) {
      setSaveState("error");
      setMessage(error.message, true);
    }
  }

  async function loadHistory() {
    if (!apiConfigured) {
      elements.historyList.innerHTML = `<div class="history-empty">Connect the Worker to load saved sheets.</div>`;
      return;
    }
    try {
      const result = await api("/api/sheets");
      summaries = result.sheets || [];
      renderHistory();
    } catch (error) {
      elements.historyList.innerHTML = `<div class="history-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  async function openSheet(id) {
    setMessage();
    try {
      const result = await api(`/api/sheets/${encodeURIComponent(id)}`);
      sheet = result.sheet;
      if (!sheet.entries?.length) sheet.entries = [createEntry()];
      setSaveState("saved");
      renderForm();
      elements.historyPanel.classList.remove("open");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function clearCanvas() {
    const canvas = elements.signatureCanvas;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    elements.signatureHint.classList.remove("hidden");
    elements.acceptSignatureButton.disabled = true;
  }

  function sizeCanvas() {
    const canvas = elements.signatureCanvas;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111";
    clearCanvas();
  }

  function openSignature(target, label) {
    signatureTarget = target;
    elements.signatureTitle.textContent = label;
    elements.signatureError.classList.add("hidden");
    elements.signatureDialog.showModal();
    requestAnimationFrame(sizeCanvas);
  }

  async function acceptSignature() {
    if (!hasInk || !signatureTarget) return;
    elements.acceptSignatureButton.disabled = true;
    elements.acceptSignatureButton.textContent = "Saving…";
    elements.signatureError.classList.add("hidden");
    try {
      const result = await api("/api/signatures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheetId: sheet.id, signerId: signatureTarget, dataUrl: elements.signatureCanvas.toDataURL("image/png") }) });
      if (signatureTarget === "lead") sheet.leadSignatureKey = result.key;
      else {
        const entry = sheet.entries.find((item) => item.id === signatureTarget);
        if (entry) entry.signatureKey = result.key;
      }
      sheet.status = "draft";
      elements.signatureDialog.close();
      renderForm();
      scheduleSave();
    } catch (error) {
      elements.signatureError.textContent = error.message;
      elements.signatureError.classList.remove("hidden");
    } finally {
      elements.acceptSignatureButton.textContent = "Accept signature";
      elements.acceptSignatureButton.disabled = !hasInk;
    }
  }

  function clearStoredSignature(target) {
    if (target === "lead") sheet.leadSignatureKey = null;
    else {
      const entry = sheet.entries.find((item) => item.id === target);
      if (entry) entry.signatureKey = null;
    }
    sheet.status = "draft";
    renderForm();
    scheduleSave();
  }

  function renderPrintPages() {
    const printable = sheet.entries.filter(meaningfulEntry);
    const groups = [];
    for (let index = 0; index < printable.length; index += 10) groups.push(printable.slice(index, index + 10));
    if (!groups.length) groups.push([]);
    elements.printRoot.innerHTML = groups.map((group, pageIndex) => {
      const rows = [...group];
      while (rows.length < 10) rows.push({ technicianName: "", timeIn: "", timeOut: "", signatureKey: null });
      return `<section class="print-sheet">
        <div class="print-title-row"><span></span><h1>Technician Attendance Sheet</h1><span>Page ${pageIndex + 1} of ${groups.length}</span></div>
        <div class="print-meta"><strong>Site</strong><span>${escapeHtml(sheet.site)}</span><strong>Date</strong><span>${escapeHtml(formatDate(sheet.workDate))}</span></div>
        <table class="print-table"><thead><tr><th>Technician Name</th><th>Time In</th><th>Time Out</th><th>Tech Signature</th></tr></thead><tbody>${rows.map((entry) => `<tr><td>${escapeHtml(entry.technicianName)}</td><td>${escapeHtml(formatTime(entry.timeIn))}</td><td>${escapeHtml(formatTime(entry.timeOut))}</td><td>${entry.signatureKey ? `<img src="${escapeHtml(signatureUrl(entry.signatureKey))}" alt="">` : ""}</td></tr>`).join("")}</tbody></table>
        <div class="print-lead-meta"><strong>Lead Tech</strong><span>${escapeHtml(sheet.leadTech)}</span><strong>Date</strong><span>${escapeHtml(formatDate(sheet.leadDate))}</span></div>
        <div class="print-lead-signature"><strong>Signature</strong>${sheet.leadSignatureKey ? `<img src="${escapeHtml(signatureUrl(sheet.leadSignatureKey))}" alt="">` : ""}</div>
      </section>`;
    }).join("");
  }

  async function printSheet() {
    if (apiConfigured) void saveSheet(true);
    renderPrintPages();
    const images = [...elements.printRoot.querySelectorAll("img")];
    await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); })));
    window.print();
  }

  elements.siteInput.addEventListener("input", (event) => { sheet.site = event.target.value; setDraft(); });
  elements.workDateInput.addEventListener("change", (event) => { sheet.workDate = event.target.value; setDraft(); });
  elements.leadTechInput.addEventListener("input", (event) => { sheet.leadTech = event.target.value; setDraft(); });
  elements.leadDateInput.addEventListener("change", (event) => { sheet.leadDate = event.target.value; setDraft(); });
  elements.historyToggle.addEventListener("click", () => elements.historyPanel.classList.toggle("open"));
  elements.newSheetButton.addEventListener("click", () => { sheet = createSheet(); setMessage(); setSaveState("idle"); renderForm(); });
  elements.saveButton.addEventListener("click", () => saveSheet(false));
  elements.addTechnicianButton.addEventListener("click", () => { sheet.entries.push(createEntry()); setDraft(); renderTechnicians(); });
  elements.printButton.addEventListener("click", printSheet);
  elements.completeButton.addEventListener("click", () => {
    if (!sheet.site.trim() || !sheet.leadTech.trim() || !sheet.leadSignatureKey) return setMessage("Add the site, lead technician name, and lead signature before completing the sheet.", true);
    sheet.status = "complete"; renderStatus(); setMessage("Sheet marked complete."); saveSheet(true);
  });
  elements.historyList.addEventListener("click", (event) => { const button = event.target.closest("[data-open-sheet]"); if (button) openSheet(button.dataset.openSheet); });
  elements.technicianList.addEventListener("input", (event) => {
    const input = event.target.closest("[data-field]"); const card = event.target.closest("[data-entry-id]"); if (!input || !card) return;
    const entry = sheet.entries.find((item) => item.id === card.dataset.entryId); if (!entry) return; entry[input.dataset.field] = input.value; setDraft();
  });
  document.addEventListener("click", (event) => {
    const sign = event.target.closest("[data-sign-target]"); if (sign) openSignature(sign.dataset.signTarget, sign.dataset.signLabel);
    const clear = event.target.closest("[data-clear-target]"); if (clear) clearStoredSignature(clear.dataset.clearTarget);
    const remove = event.target.closest("[data-remove-entry]"); if (remove && sheet.entries.length > 1) { sheet.entries = sheet.entries.filter((item) => item.id !== remove.dataset.removeEntry); setDraft(); renderTechnicians(); }
  });
  elements.clearSignatureButton.addEventListener("click", clearCanvas);
  elements.acceptSignatureButton.addEventListener("click", acceptSignature);

  const canvas = elements.signatureCanvas;
  const point = (event) => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  canvas.addEventListener("pointerdown", (event) => { event.preventDefault(); drawing = true; canvas.setPointerCapture(event.pointerId); const start = point(event); const context = canvas.getContext("2d"); context.beginPath(); context.moveTo(start.x, start.y); });
  canvas.addEventListener("pointermove", (event) => { if (!drawing) return; event.preventDefault(); const next = point(event); const context = canvas.getContext("2d"); context.lineTo(next.x, next.y); context.stroke(); hasInk = true; elements.signatureHint.classList.add("hidden"); elements.acceptSignatureButton.disabled = false; });
  const stopDrawing = (event) => { drawing = false; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
  canvas.addEventListener("pointerup", stopDrawing); canvas.addEventListener("pointercancel", stopDrawing);

  if (!apiConfigured) {
    elements.setupMessage.textContent = "Setup needed: deploy the included Cloudflare Worker, then paste its address into reports/time/config.js.";
    elements.setupMessage.classList.remove("hidden");
    setSaveState("error");
  }
  renderForm();
  loadHistory();
})();
