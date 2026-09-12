const storageKey = "zfl16-movable-type-workshop";

const paperLabels = { postcard: "明信片", bookmark: "书签", square: "方形小笺" };
const flowLabels = { horizontal: "横排", vertical: "竖排" };

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 4, wear: "微磨" },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨" },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 2, wear: "新" },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 4, wear: "新" }
];

const defaultSettings = {
  paperSize: "postcard",
  flowMode: "horizontal",
  gridGap: 8,
  workTitle: "晚风小笺"
};

const defaultState = {
  inventory: starterInventory,
  selectedTypeId: starterInventory[0].id,
  placements: [],
  drafts: [],
  templates: [],
  jobs: [],
  settings: defaultSettings
};

let state = loadState();

// 批量排印弹窗内的暂存输入
const batchForm = { templateId: "", text: "" };

const els = {
  paperSize: document.querySelector("#paperSize"),
  flowMode: document.querySelector("#flowMode"),
  gridGap: document.querySelector("#gridGap"),
  workTitle: document.querySelector("#workTitle"),
  stage: document.querySelector("#stage"),
  typeList: document.querySelector("#typeList"),
  typeForm: document.querySelector("#typeForm"),
  charInput: document.querySelector("#charInput"),
  styleInput: document.querySelector("#styleInput"),
  sizeInput: document.querySelector("#sizeInput"),
  quantityInput: document.querySelector("#quantityInput"),
  wearInput: document.querySelector("#wearInput"),
  inventorySearch: document.querySelector("#inventorySearch"),
  styleFilter: document.querySelector("#styleFilter"),
  selectedTypeLabel: document.querySelector("#selectedTypeLabel"),
  shortageBadge: document.querySelector("#shortageBadge"),
  usageList: document.querySelector("#usageList"),
  draftList: document.querySelector("#draftList"),
  templateList: document.querySelector("#templateList"),
  jobList: document.querySelector("#jobList"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn"),
  saveTemplateBtn: document.querySelector("#saveTemplateBtn"),
  batchBtn: document.querySelector("#batchBtn"),
  templateModal: document.querySelector("#templateModal"),
  templateModalBody: document.querySelector("#templateModalBody"),
  batchModal: document.querySelector("#batchModal"),
  batchModalBody: document.querySelector("#batchModalBody"),
  toast: document.querySelector("#toast")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultSettings, ...parsed.settings }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getGrid(settings = state.settings) {
  const size = settings.paperSize;
  if (size === "bookmark") return { cols: 7, rows: 18 };
  if (size === "square") return { cols: 12, rows: 12 };
  return { cols: 16, rows: 10 };
}

function placementKey(row, col) {
  return `${row}:${col}`;
}

function getSelectedType() {
  return state.inventory.find((item) => item.id === state.selectedTypeId) || null;
}

function getTypeById(typeId) {
  return state.inventory.find((item) => item.id === typeId) || null;
}

function getUsage() {
  return state.placements.reduce((acc, placement) => {
    acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
    return acc;
  }, {});
}

function getJobUsage() {
  return state.placements.reduce((acc, placement) => {
    if (placement.jobId) acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
    return acc;
  }, {});
}

function inBounds(row, col, settings) {
  const { cols, rows } = getGrid(settings);
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

// ---------- 模板 ----------

// 按阅读顺序返回格子坐标：横排逐行从左到右；竖排逐列从右到左、自上而下
function getTemplateSlots(settings = state.settings) {
  const { cols, rows } = getGrid(settings);
  const slots = [];
  if (settings.flowMode === "vertical") {
    for (let col = cols - 1; col >= 0; col -= 1) {
      for (let row = 0; row < rows; row += 1) slots.push({ row, col });
    }
  } else {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) slots.push({ row, col });
    }
  }
  return slots;
}

function captureTemplate(name) {
  const slotIndex = new Map(
    getTemplateSlots().map((slot, index) => [placementKey(slot.row, slot.col), index])
  );
  // 模板格位按阅读顺序保存，只收录当前纸型内的落字格
  const cells = state.placements
    .map((placement) => ({ row: placement.row, col: placement.col }))
    .filter((cell) => slotIndex.has(placementKey(cell.row, cell.col)))
    .sort(
      (a, b) =>
        slotIndex.get(placementKey(a.row, a.col)) - slotIndex.get(placementKey(b.row, b.col))
    );
  return {
    id: crypto.randomUUID(),
    name,
    paperSize: state.settings.paperSize,
    flowMode: state.settings.flowMode,
    gridGap: state.settings.gridGap,
    cells,
    createdAt: new Date().toISOString()
  };
}

function templateSettings(template) {
  return { ...state.settings, paperSize: template.paperSize, flowMode: template.flowMode, gridGap: template.gridGap };
}

// ---------- 批量排印核对 ----------

function buildTypeIndex() {
  // 同一字可能有多种字模变体；缺字（无任何字模）由 missing 报告
  const byChar = new Map();
  state.inventory.forEach((type) => {
    if (!byChar.has(type.char)) byChar.set(type.char, []);
    byChar.get(type.char).push(type);
  });
  return byChar;
}

function planBatch(template, text) {
  const chars = [...text].filter((ch) => ch.trim().length > 0);
  const settings = templateSettings(template);
  const slots = template.cells.filter((cell) => inBounds(cell.row, cell.col, settings));
  const fillCount = Math.min(chars.length, slots.length);
  const filled = slots.slice(0, fillCount);
  const charAt = filled.map((slot, index) => ({ slot, char: chars[index] }));

  const currentMap = new Map(
    state.placements.map((placement) => [placementKey(placement.row, placement.col), placement])
  );
  const usage = getUsage();

  // 与其他已提交批次锁定格位冲突 -> 不可覆盖
  const conflicts = [];
  charAt.forEach(({ slot, char }) => {
    const occupant = currentMap.get(placementKey(slot.row, slot.col));
    if (occupant?.jobId) {
      const type = getTypeById(occupant.typeId);
      conflicts.push({ row: slot.row, col: slot.col, char, occupant: type?.char || "？" });
    }
  });

  // 目标格上的手动旧字会被覆盖，覆盖后释放对应字模，占用量相应减少
  const freedUsage = {};
  charAt.forEach(({ slot }) => {
    const occupant = currentMap.get(placementKey(slot.row, slot.col));
    if (occupant && !occupant.jobId) freedUsage[occupant.typeId] = (freedUsage[occupant.typeId] || 0) + 1;
  });
  const effectiveUsage = {};
  state.inventory.forEach((type) => {
    effectiveUsage[type.id] = Math.max(0, (usage[type.id] || 0) - (freedUsage[type.id] || 0));
  });

  // 切换纸型会裁切到的落字（含批次锁定格）
  const clipped = [];
  if (settings.paperSize !== state.settings.paperSize) {
    state.placements.forEach((placement) => {
      if (!inBounds(placement.row, placement.col, settings)) {
        clipped.push({ row: placement.row, col: placement.col, locked: Boolean(placement.jobId) });
      }
    });
  }

  // 需求（按首次出现顺序）
  const demandMap = new Map();
  const demandOrder = [];
  charAt.forEach(({ char }) => {
    if (!demandMap.has(char)) {
      demandMap.set(char, 0);
      demandOrder.push(char);
    }
    demandMap.set(char, demandMap.get(char) + 1);
  });

  const typeIndex = buildTypeIndex();
  const missing = [];
  const short = [];
  const allocation = new Map(); // 字符 -> [{type, count}]
  const variantNotes = [];

  demandOrder.forEach((char) => {
    const need = demandMap.get(char);
    const variants = (typeIndex.get(char) || []).slice().sort((a, b) => {
      const freeA = a.quantity - (effectiveUsage[a.id] || 0);
      const freeB = b.quantity - (effectiveUsage[b.id] || 0);
      return freeB - freeA;
    });
    if (!variants.length) {
      missing.push({ char, need });
      return;
    }
    let remaining = need;
    const picks = [];
    variants.forEach((type) => {
      if (remaining <= 0) return;
      const free = Math.max(0, type.quantity - (effectiveUsage[type.id] || 0));
      if (free <= 0) return;
      const take = Math.min(free, remaining);
      picks.push({ type, count: take });
      remaining -= take;
    });
    if (remaining > 0) short.push({ char, need, lack: remaining });
    allocation.set(char, picks);
    if (picks.length > 1) {
      variantNotes.push({ char, picks: picks.map((pick) => ({ style: pick.type.style, count: pick.count })) });
    }
  });

  // 若没有缺口，落字时逐格贪心取字模
  const newPlacements = [];
  const greedyUsage = { ...effectiveUsage };
  if (!missing.length && !short.length && !conflicts.length && !clipped.some((item) => item.locked)) {
    charAt.forEach(({ slot, char }) => {
      const picks = allocation.get(char) || [];
      for (const pick of picks) {
        const used = greedyUsage[pick.type.id] || 0;
        if (used < pick.type.quantity) {
          greedyUsage[pick.type.id] = used + 1;
          newPlacements.push({ row: slot.row, col: slot.col, typeId: pick.type.id });
          break;
        }
      }
    });
  }

  return {
    template,
    settings,
    totalChars: chars.length,
    fillCount,
    emptySlots: slots.length - fillCount,
    extraChars: Math.max(0, chars.length - slots.length),
    charAt,
    missing,
    short,
    conflicts,
    clipped,
    variantNotes,
    newPlacements
  };
}

function planBlocked(plan) {
  return Boolean(
    plan.missing.length ||
      plan.short.length ||
      plan.conflicts.length ||
      plan.clipped.some((item) => item.locked)
  );
}

function commitBatch(plan) {
  if (planBlocked(plan)) return false;

  // 记录被覆盖格位的排入前状态，撤销时恢复
  const displaced = [];
  plan.newPlacements.forEach((placement) => {
    const index = state.placements.findIndex(
      (item) => item.row === placement.row && item.col === placement.col
    );
    if (index >= 0) displaced.push({ index, placement: structuredClone(state.placements[index]) });
  });

  // 换纸后超出新纸面的手动落字先收起来，撤销时还原
  const clippedPlacements = state.placements.filter(
    (placement) => !placement.jobId && !inBounds(placement.row, placement.col, plan.settings)
  );

  const job = {
    id: crypto.randomUUID(),
    templateId: plan.template.id,
    templateName: plan.template.name,
    text: plan.charAt.map((item) => item.char).join(""),
    count: plan.newPlacements.length,
    appliedSettings: structuredClone(plan.settings),
    previousSettings: structuredClone(state.settings),
    displaced,
    clippedPlacements,
    committedAt: new Date().toISOString()
  };

  plan.newPlacements.forEach((placement) => {
    const index = state.placements.findIndex(
      (item) => item.row === placement.row && item.col === placement.col
    );
    if (index >= 0) state.placements[index] = { ...placement, jobId: job.id };
    else state.placements.push({ ...placement, jobId: job.id });
  });
  // 移除超出新纸面的手动落字（批次锁定格在核对阶段已拦截）
  state.placements = state.placements.filter(
    (placement) => placement.jobId === job.id || inBounds(placement.row, placement.col, plan.settings)
  );

  state.settings = structuredClone(plan.settings);
  state.jobs.unshift(job);
  return true;
}

function undoJob(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return;

  // 移除本批落字（若格位又被后续批次覆盖，保留后续批次的字）
  state.placements = state.placements.filter(
    (placement) => !(placement.jobId === job.id)
  );

  // 恢复排入前被覆盖的格位；格位若被后续批次占用则不覆盖
  const occupiedKeys = new Set(state.placements.map((item) => placementKey(item.row, item.col)));
  job.displaced.forEach((saved) => {
    if (!occupiedKeys.has(placementKey(saved.placement.row, saved.placement.col))) {
      state.placements.push(structuredClone(saved.placement));
    }
  });

  // 还原换纸时被收起的手动落字
  (job.clippedPlacements || []).forEach((placement) => {
    if (!occupiedKeys.has(placementKey(placement.row, placement.col))) {
      state.placements.push(structuredClone(placement));
    }
  });

  state.jobs = state.jobs.filter((item) => item.id !== jobId);

  // 无剩余批次时回到排入前设置；还有批次时保留当前版式（后续批次依赖它）
  if (!state.jobs.length) {
    state.settings = structuredClone(job.previousSettings);
  }
}

// ---------- 渲染 ----------

function renderSettings() {
  els.paperSize.value = state.settings.paperSize;
  els.flowMode.value = state.settings.flowMode;
  els.gridGap.value = state.settings.gridGap;
  els.workTitle.value = state.settings.workTitle;
}

function renderStyleFilter() {
  const current = els.styleFilter.value || "all";
  const styles = [...new Set(state.inventory.map((item) => item.style))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  els.styleFilter.innerHTML = `<option value="all">全部风格</option>${styles
    .map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`)
    .join("")}`;
  els.styleFilter.value = styles.includes(current) ? current : "all";
}

function renderInventory() {
  const keyword = els.inventorySearch.value.trim();
  const style = els.styleFilter.value;
  const usage = getUsage();
  const jobUsage = getJobUsage();
  const items = state.inventory.filter((item) => {
    const matchesKeyword = !keyword || `${item.char}${item.style}${item.wear}`.includes(keyword);
    const matchesStyle = style === "all" || item.style === style;
    return matchesKeyword && matchesStyle;
  });

  els.inventoryCount.textContent = `${state.inventory.length}枚字模`;
  els.typeList.innerHTML = items
    .map((item) => {
      const used = usage[item.id] || 0;
      const locked = jobUsage[item.id] || 0;
      const selected = item.id === state.selectedTypeId ? "selected" : "";
      const lockedTag = locked ? `<em class="lock-tag">批次占用 ${locked}</em>` : "";
      return `
        <article class="type-card ${selected}" draggable="true" data-type-id="${item.id}">
          <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
          <div class="type-meta">
            <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
            <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
            ${lockedTag}
          </div>
          <button class="mini-btn" title="删除字模" data-delete-type="${item.id}" type="button">×</button>
        </article>
      `;
    })
    .join("");
}

function renderStage() {
  const { cols, rows } = getGrid();
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  els.stage.className = `stage ${state.settings.paperSize}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
      const locked = placement?.jobId ? "locked" : "";
      cells.push(`
        <button class="cell ${type ? "used" : ""} ${vertical} ${locked}" data-row="${row}" data-col="${col}" type="button"
          ${placement?.jobId ? 'aria-disabled="true" title="批量排印占用，撤销对应批次后可修改"' : ""}
          aria-label="第${row + 1}行第${col + 1}列">
          ${type ? escapeHtml(type.char) : ""}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

function renderUsage() {
  const usage = getUsage();
  const jobUsage = getJobUsage();
  const entries = state.inventory.filter((item) => usage[item.id]);
  els.placedCount.textContent = `${state.placements.length}个落字`;

  const shortages = entries.filter((item) => usage[item.id] > item.quantity);
  els.shortageBadge.textContent = shortages.length ? `${shortages.length}处超量` : "数量充足";
  els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;

  const selectedType = getSelectedType();
  els.selectedTypeLabel.textContent = selectedType ? `当前：${selectedType.char} · ${selectedType.style}` : "未选择字模";

  els.usageList.innerHTML =
    entries
      .map((item) => {
        const used = usage[item.id];
        const locked = jobUsage[item.id] || 0;
        const warn = used > item.quantity ? "warn" : "";
        const lockText = locked ? ` · 占用${locked}` : "";
        return `
          <div class="usage-item ${warn}">
            <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
            <span>${used}/${item.quantity}${lockText}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">还没有落字。</p>`;
}

function renderTemplates() {
  els.templateList.innerHTML =
    state.templates
      .map(
        (template) => `
          <article class="draft-item">
            <strong>${escapeHtml(template.name)}</strong>
            <span>${paperLabels[template.paperSize] || template.paperSize} · ${flowLabels[template.flowMode] || template.flowMode} · 间距${template.gridGap}px · ${template.cells.length}格 · ${new Date(template.createdAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-batch-template="${template.id}">排印</button>
              <button type="button" data-apply-template="${template.id}">套用版式</button>
              <button type="button" data-delete-template="${template.id}">删除</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="empty">还没有模板。把当前版面存为模板，保留纸张、方向、网格间距与落字格位。</p>`;
}

function renderJobs() {
  els.jobList.innerHTML =
    state.jobs
      .map(
        (job) => `
          <article class="draft-item job-item">
            <strong>${escapeHtml(job.templateName)} · ${job.count}字</strong>
            <span title="${escapeHtml(job.text)}">${escapeHtml(job.text.slice(0, 12))}${job.text.length > 12 ? "…" : ""} · ${new Date(job.committedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-undo-job="${job.id}">整批撤销</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="empty">还没有批量排印记录。</p>`;
}

function renderDrafts() {
  els.draftList.innerHTML =
    state.drafts
      .map(
        (draft) => `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderUsage();
  renderTemplates();
  renderJobs();
  renderDrafts();
  if (!els.templateModal.hidden) renderTemplateModal();
  if (!els.batchModal.hidden) renderBatchModal();
}

// ---------- 弹窗 ----------

function renderTemplateModal() {
  const slotCount = getTemplateSlots().length;
  els.templateModalBody.innerHTML = `
    <p class="modal-note">
      模板保留纸张、横竖方向、网格间距，以及当前版面每个落字格位的顺序（共
      <strong>${state.placements.length}</strong> 个落字格，版面 ${slotCount} 格）。
    </p>
    <ul class="summary-list">
      <li>纸张：${paperLabels[state.settings.paperSize]}</li>
      <li>方向：${flowLabels[state.settings.flowMode]}</li>
      <li>网格间距：${state.settings.gridGap}px</li>
      <li>落字格位：${state.placements.length} 个</li>
    </ul>
    <form id="templateForm" class="modal-form">
      <label>模板名称
        <input id="templateNameInput" type="text" maxlength="24" placeholder="例：竖排明信片信笺" required />
      </label>
      <div class="modal-actions">
        <button type="button" data-close-modal="templateModal">取消</button>
        <button class="primary" type="submit" ${state.placements.length ? "" : "disabled"}>保存模板</button>
      </div>
    </form>
  `;
}

function renderPlanReport(plan) {
  if (plan.totalChars === 0) {
    return `<div class="plan-report"><p class="empty">粘贴要排印的文字后开始核对。</p></div>`;
  }

  const blockers = [];
  plan.missing.forEach((item) => {
    blockers.push(`<li><strong>缺字「${escapeHtml(item.char)}」</strong>：字模库中没有此字，需要 ${item.need} 枚</li>`);
  });
  plan.short.forEach((item) => {
    blockers.push(`<li><strong>缺量「${escapeHtml(item.char)}」</strong>：需要 ${item.need} 枚，空闲字模不足，还差 ${item.lack} 枚</li>`);
  });
  plan.conflicts.forEach((item) => {
    blockers.push(
      `<li><strong>格位冲突</strong>：第${item.row + 1}行第${item.col + 1}列已被批次「${escapeHtml(item.occupant)}」占用，请先撤销该批次</li>`
    );
  });
  plan.clipped.forEach((item) => {
    if (item.locked) {
      blockers.push(
        `<li><strong>切换纸型会裁切批次占用格</strong>：第${item.row + 1}行第${item.col + 1}列，请先撤销对应批次</li>`
      );
    }
  });

  const notes = [];
  if (plan.extraChars > 0) notes.push(`文字超出模板格位，末尾 ${plan.extraChars} 字不会排入`);
  plan.clipped.forEach((item) => {
    if (!item.locked) {
      notes.push(`切换纸型后第${item.row + 1}行第${item.col + 1}列的手动落字将移出纸面`);
    }
  });
  plan.variantNotes.forEach((item) => {
    const detail = item.picks.map((pick) => `${escapeHtml(pick.style)} ${pick.count}枚`).join("、");
    notes.push(`「${escapeHtml(item.char)}」将混合使用：${detail}`);
  });
  if (plan.emptySlots > 0) notes.push(`还剩 ${plan.emptySlots} 个空格未排入`);

  const blocked = planBlocked(plan);
  return `
    <div class="plan-report ${blocked ? "bad" : "good"}">
      <p class="plan-head">
        ${blocked ? "核对未通过，已停止提交" : `核对通过：将排入 ${plan.fillCount} 字`}
      </p>
      ${blockers.length ? `<ul class="plan-list">${blockers.join("")}</ul>` : ""}
      ${notes.length ? `<ul class="plan-notes">${notes.map((note) => `<li>${note}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

function renderBatchModal() {
  const hasTemplates = state.templates.length > 0;
  if (!hasTemplates) {
    els.batchModalBody.innerHTML = `
      <p class="modal-note">还没有版式模板。请先在版面上安排格位，再点击「存为模板」。</p>
      <div class="modal-actions"><button type="button" data-close-modal="batchModal">关闭</button></div>
    `;
    return;
  }

  if (!batchForm.templateId || !state.templates.some((t) => t.id === batchForm.templateId)) {
    batchForm.templateId = state.templates[0].id;
  }
  const template = state.templates.find((item) => item.id === batchForm.templateId);
  const plan = planBatch(template, batchForm.text);

  els.batchModalBody.innerHTML = `
    <form id="batchForm" class="modal-form">
      <label>选择模板
        <select id="batchTemplateSelect">
          ${state.templates
            .map(
              (item) => `
                <option value="${item.id}" ${item.id === batchForm.templateId ? "selected" : ""}>
                  ${escapeHtml(item.name)}（${paperLabels[item.paperSize] || item.paperSize} · ${flowLabels[item.flowMode] || item.flowMode} · ${item.cells.length}格）
                </option>
              `
            )
            .join("")}
        </select>
      </label>
      <label>粘贴排印文字（空白自动跳过，按模板格位顺序逐格套字）
        <textarea id="batchTextInput" rows="6" placeholder="例：山间风月，茶雨晚晴">${escapeHtml(batchForm.text)}</textarea>
      </label>
      <div id="batchPlan">${renderPlanReport(plan)}</div>
      <div class="modal-actions">
        <button type="button" data-close-modal="batchModal">取消</button>
        <button id="batchCommitBtn" class="primary" type="submit" ${planBlocked(plan) || plan.fillCount === 0 ? "disabled" : ""}>
          确认整批落字（${plan.fillCount} 字）
        </button>
      </div>
    </form>
  `;

  const select = els.batchModalBody.querySelector("#batchTemplateSelect");
  const textarea = els.batchModalBody.querySelector("#batchTextInput");
  select.addEventListener("change", () => {
    batchForm.templateId = select.value;
    renderBatchModal();
    const nextInput = els.batchModalBody.querySelector("#batchTextInput");
    nextInput.focus();
    nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
  });
  textarea.addEventListener("input", () => {
    batchForm.text = textarea.value;
    const latest = planBatch(
      state.templates.find((item) => item.id === batchForm.templateId),
      batchForm.text
    );
    els.batchModalBody.querySelector("#batchPlan").innerHTML = renderPlanReport(latest);
    els.batchModalBody.querySelector("#batchCommitBtn").disabled =
      planBlocked(latest) || latest.fillCount === 0;
    els.batchModalBody.querySelector("#batchCommitBtn").textContent = `确认整批落字（${latest.fillCount} 字）`;
  });
  els.batchModalBody.querySelector("#batchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const finalPlan = planBatch(
      state.templates.find((item) => item.id === batchForm.templateId),
      batchForm.text
    );
    if (planBlocked(finalPlan) || finalPlan.fillCount === 0) {
      toast(finalPlan.fillCount === 0 ? "没有可排入的文字。" : "存在缺字或缺量，已停止提交。");
      renderBatchModal();
      return;
    }
    if (commitBatch(finalPlan)) {
      batchForm.text = "";
      closeModal(els.batchModal);
      renderAll();
      toast(`已整批排入 ${finalPlan.fillCount} 字，所用字模进入占用状态。`);
    }
  });
}

function openModal(modal) {
  modal.hidden = false;
}

function closeModal(modal) {
  modal.hidden = true;
}

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

// ---------- 手动落字 ----------

function placeType(row, col, typeId = state.selectedTypeId) {
  if (!typeId) return;
  const existing = state.placements.find((item) => item.row === row && item.col === col);
  if (existing?.jobId) {
    toast("该格已被批量排印占用，撤销对应批次后才能修改。");
    return;
  }
  if (existing?.typeId === typeId) {
    state.placements = state.placements.filter((item) => !(item.row === row && item.col === col));
    renderAll();
    return;
  }
  const usage = getUsage();
  const used = usage[typeId] || 0;
  const type = getTypeById(typeId);
  // 空格落字或覆盖别种旧字，新字模用量都 +1
  if (type && used + 1 > type.quantity) {
    toast(`「${type.char}」空闲字模不足（库存 ${type.quantity} 枚），不能再落字。`);
    return;
  }
  if (existing) {
    existing.typeId = typeId;
  } else {
    state.placements.push({ row, col, typeId });
  }
  renderAll();
}

function addType(event) {
  event.preventDefault();
  const item = {
    id: crypto.randomUUID(),
    char: els.charInput.value.trim(),
    style: els.styleInput.value.trim(),
    size: Number(els.sizeInput.value),
    quantity: Number(els.quantityInput.value),
    wear: els.wearInput.value
  };
  if (!item.char || !item.style) return;
  state.inventory.unshift(item);
  state.selectedTypeId = item.id;
  els.typeForm.reset();
  els.sizeInput.value = 24;
  els.quantityInput.value = 3;
  renderAll();
}

// ---------- 草稿 ----------

function saveDraft() {
  if (state.jobs.length) {
    toast("有批量排印占用中，请先整批撤销再保存草稿。");
    return;
  }
  const title = state.settings.workTitle.trim() || "未命名作品";
  state.drafts.unshift({
    id: crypto.randomUUID(),
    title,
    settings: structuredClone(state.settings),
    // 草稿只保存手动版面，批次占用不随草稿转移
    placements: state.placements
      .filter((placement) => !placement.jobId)
      .map((placement) => ({ row: placement.row, col: placement.col, typeId: placement.typeId })),
    savedAt: new Date().toISOString()
  });
  state.drafts = state.drafts.slice(0, 8);
  renderAll();
  toast("草稿已保存。");
}

// ---------- 导出 ----------

function exportPreview() {
  const { cols, rows } = getGrid();
  const cell = state.settings.paperSize === "bookmark" ? 44 : 56;
  const gap = state.settings.gridGap;
  const margin = 48;
  const width = cols * cell + (cols - 1) * gap + margin * 2;
  const height = rows * cell + (rows - 1) * gap + margin * 2 + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2f2921";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.fillStyle = "#22201c";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(state.settings.workTitle || "未命名作品", margin, 50);
  ctx.font = "bold 30px serif";
  state.placements.forEach((placement) => {
    const type = state.inventory.find((item) => item.id === placement.typeId);
    if (!type) return;
    const x = margin + placement.col * (cell + gap);
    const y = margin + 45 + placement.row * (cell + gap);
    ctx.fillStyle = "#2f2921";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#fff5df";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.min(type.size + 8, 42)}px serif`;
    ctx.fillText(type.char, x + cell / 2, y + cell / 2);
  });
  const link = document.createElement("a");
  link.download = `${state.settings.workTitle || "movable-type"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- 事件 ----------

els.paperSize.addEventListener("change", () => {
  const next = els.paperSize.value;
  if (next === state.settings.paperSize) return;
  const { cols, rows } = getGrid({ ...state.settings, paperSize: next });
  const lockedOutOfBounds = state.placements.some(
    (item) => item.jobId && (item.row >= rows || item.col >= cols)
  );
  if (lockedOutOfBounds) {
    toast("已有批量排印占用的格位会被裁掉，请先整批撤销再更换纸张。");
    els.paperSize.value = state.settings.paperSize;
    return;
  }
  state.settings.paperSize = next;
  state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
  renderAll();
});

els.flowMode.addEventListener("change", () => {
  state.settings.flowMode = els.flowMode.value;
  renderAll();
});

els.gridGap.addEventListener("input", () => {
  state.settings.gridGap = Number(els.gridGap.value);
  renderAll();
});

els.workTitle.addEventListener("input", () => {
  state.settings.workTitle = els.workTitle.value;
  saveState();
});

els.typeForm.addEventListener("submit", addType);
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  if (state.jobs.length) {
    toast("有批量排印占用中，请先整批撤销，再清空版面。");
    return;
  }
  state.placements = [];
  renderAll();
});

els.saveTemplateBtn.addEventListener("click", () => {
  if (!state.placements.length) {
    toast("当前版面还没有落字格位，无法存为模板。");
    return;
  }
  renderTemplateModal();
  openModal(els.templateModal);
  els.templateModalBody.querySelector("#templateNameInput")?.focus();
});

els.batchBtn.addEventListener("click", () => {
  if (!state.templates.length) {
    toast("还没有模板，请先把当前版面存为模板。");
    return;
  }
  renderBatchModal();
  openModal(els.batchModal);
});

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-modal]");
  if (!closeButton) return;
  const modal = document.querySelector(`#${closeButton.dataset.closeModal}`);
  if (modal) closeModal(modal);
});

[els.templateModal, els.batchModal].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!els.batchModal.hidden) closeModal(els.batchModal);
    if (!els.templateModal.hidden) closeModal(els.templateModal);
  }
});

els.templateModalBody.addEventListener("submit", (event) => {
  if (event.target.id !== "templateForm") return;
  event.preventDefault();
  const input = els.templateModalBody.querySelector("#templateNameInput");
  const name = input.value.trim() || `${paperLabels[state.settings.paperSize]}模板`;
  state.templates.push(captureTemplate(name));
  closeModal(els.templateModal);
  renderAll();
  toast("模板已保存。");
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    const jobUsage = getJobUsage();
    if (jobUsage[typeId]) {
      toast("该字模有批量排印占用，撤销对应批次后才能删除。");
      return;
    }
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    renderAll();
    return;
  }
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  state.selectedTypeId = card.dataset.typeId;
  renderAll();
});

els.typeList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.typeId);
});

els.stage.addEventListener("dragover", (event) => {
  if (event.target.closest(".cell")) event.preventDefault();
});

els.stage.addEventListener("drop", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  placeType(Number(cell.dataset.row), Number(cell.dataset.col), event.dataTransfer.getData("text/plain"));
});

els.stage.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  placeType(Number(cell.dataset.row), Number(cell.dataset.col));
});

els.templateList.addEventListener("click", (event) => {
  const batchButton = event.target.closest("[data-batch-template]");
  const applyButton = event.target.closest("[data-apply-template]");
  const deleteButton = event.target.closest("[data-delete-template]");

  if (batchButton) {
    batchForm.templateId = batchButton.dataset.batchTemplate;
    batchForm.text = "";
    renderBatchModal();
    openModal(els.batchModal);
  }
  if (applyButton) {
    const template = state.templates.find((item) => item.id === applyButton.dataset.applyTemplate);
    if (!template) return;
    if (state.jobs.length) {
      toast("有批量排印占用中，不能套用其他版式，请先整批撤销。");
      return;
    }
    const settings = templateSettings(template);
    const { cols, rows } = getGrid(settings);
    state.settings.paperSize = settings.paperSize;
    state.settings.flowMode = settings.flowMode;
    state.settings.gridGap = settings.gridGap;
    state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
    renderAll();
    toast(`已套用模板「${template.name}」的纸张、方向与间距。`);
  }
  if (deleteButton) {
    state.templates = state.templates.filter((item) => item.id !== deleteButton.dataset.deleteTemplate);
    if (batchForm.templateId === deleteButton.dataset.deleteTemplate) batchForm.templateId = "";
    renderAll();
    toast("模板已移除。");
  }
});

els.jobList.addEventListener("click", (event) => {
  const undoButton = event.target.closest("[data-undo-job]");
  if (!undoButton) return;
  undoJob(undoButton.dataset.undoJob);
  renderAll();
  toast("已整批撤销，版面恢复到排入前状态。");
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    if (state.jobs.length) {
      toast("有批量排印占用中，请先整批撤销再载入草稿。");
      return;
    }
    state.settings = structuredClone(draft.settings);
    state.placements = structuredClone(draft.placements);
    renderAll();
    toast("草稿已载入。");
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

renderAll();
