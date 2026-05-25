(function () {
  "use strict";

  const STORAGE_KEY = "utmos_quality_test_v2";
  const CSV_COLUMNS = ["session_id", "listener_id", "started_at", "finished_at", "item_index", "sample_id", "system_id", "system_label", "audio_path", "score", "rated_at"];
  const state = { sessionId: "", listenerId: "", startedAt: "", finishedAt: "", order: [], scores: {}, ratedAt: {}, index: 0 };
  const el = {};
  let elapsedTimer = null;

  document.addEventListener("DOMContentLoaded", function () {
    bindElements();
    bindEvents();
    showSavedSession();
  });

  function bindElements() {
    el.setup = document.getElementById("setup");
    el.test = document.getElementById("test");
    el.listenerId = document.getElementById("listener-id");
    el.startButton = document.getElementById("start-button");
    el.resumeButton = document.getElementById("resume-button");
    el.clearButton = document.getElementById("clear-button");
    el.savedSummary = document.getElementById("saved-summary");
    el.progress = document.getElementById("progress");
    el.elapsed = document.getElementById("elapsed");
    el.audio = document.getElementById("audio");
    el.rating = document.getElementById("rating");
    el.prevButton = document.getElementById("prev-button");
    el.nextButton = document.getElementById("next-button");
    el.finishButton = document.getElementById("finish-button");
    el.status = document.getElementById("status");
  }

  function bindEvents() {
    el.startButton.addEventListener("click", startTest);
    el.resumeButton.addEventListener("click", resumeTest);
    el.clearButton.addEventListener("click", clearSavedSession);
    el.prevButton.addEventListener("click", previousItem);
    el.nextButton.addEventListener("click", nextItem);
    el.finishButton.addEventListener("click", finishTest);
    el.rating.addEventListener("change", recordScore);
    document.addEventListener("keydown", handleKeyboard);
  }

  function startTest() {
    const listenerId = normalizeListenerId(el.listenerId.value);
    if (!listenerId) {
      alert("Please enter your name or listener ID.");
      return;
    }
    const startedAt = new Date().toISOString();
    Object.assign(state, {
      sessionId: makeSessionId(listenerId, startedAt),
      listenerId,
      startedAt,
      finishedAt: "",
      order: shuffled(TEST_ITEMS.map(function (_, index) { return index; }), stateSeed(listenerId, startedAt)),
      scores: {},
      ratedAt: {},
      index: 0
    });
    saveState();
    showTest();
  }

  function resumeTest() {
    const saved = loadState();
    if (!saved) {
      showSavedSession();
      return;
    }
    Object.assign(state, saved);
    showTest();
  }

  function clearSavedSession() {
    if (!confirm("Clear the saved listening-test progress in this browser?")) return;
    localStorage.removeItem(STORAGE_KEY);
    showSavedSession();
  }

  function showSavedSession() {
    const saved = loadState();
    const hasSaved = Boolean(saved && saved.order && saved.order.length);
    el.resumeButton.classList.toggle("hidden", !hasSaved);
    el.clearButton.classList.toggle("hidden", !hasSaved);
    if (!hasSaved) {
      el.savedSummary.textContent = "";
      return;
    }
    const rated = Object.keys(saved.scores || {}).length;
    el.savedSummary.textContent = "Saved progress: " + saved.listenerId + ", " + rated + "/" + saved.order.length + " ratings.";
    el.listenerId.value = saved.listenerId || "";
  }

  function showTest() {
    el.setup.classList.add("hidden");
    el.test.classList.remove("hidden");
    startElapsedTimer();
    renderItem();
  }

  function renderItem(autoplay) {
    const item = currentItem();
    const score = state.scores[itemKey()];
    el.progress.textContent = "Item " + (state.index + 1) + " of " + state.order.length;
    updateElapsedTime();
    el.audio.src = item.audio_path;
    el.audio.load();
    if (autoplay) {
      playCurrentAudio();
    }
    setSelectedScore(score);
    el.prevButton.disabled = state.index === 0;
    el.nextButton.disabled = !score || state.index === state.order.length - 1;
    el.finishButton.disabled = !allItemsRated();
    el.status.textContent = saveStatusText();
  }

  function currentItem() {
    return TEST_ITEMS[state.order[state.index]];
  }

  function itemKey(index) {
    const orderIndex = typeof index === "number" ? index : state.index;
    return String(state.order[orderIndex]);
  }

  function recordScore(event) {
    if (event.target.name !== "score") return;
    state.scores[itemKey()] = event.target.value;
    state.ratedAt[itemKey()] = new Date().toISOString();
    saveState();
    renderItem();
  }

  function handleKeyboard(event) {
    if (el.test.classList.contains("hidden")) return;
    if (event.target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(event.target.tagName)) return;

    if (["1", "2", "3", "4", "5"].includes(event.key)) {
      event.preventDefault();
      setScore(event.key);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      nextItem();
    }
  }

  function setScore(score) {
    state.scores[itemKey()] = score;
    state.ratedAt[itemKey()] = new Date().toISOString();
    saveState();
    renderItem();
  }

  function previousItem() {
    if (state.index <= 0) return;
    state.index -= 1;
    saveState();
    renderItem();
  }

  function nextItem() {
    if (state.index >= state.order.length - 1 || !state.scores[itemKey()]) return;
    state.index += 1;
    saveState();
    renderItem(true);
  }

  function playCurrentAudio() {
    const playPromise = el.audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function () {
        el.status.textContent = "Press play to start this sample. " + saveStatusText();
      });
    }
  }

  async function finishTest() {
    if (!allItemsRated()) {
      alert("Please rate every item before finishing.");
      return;
    }
    state.finishedAt = new Date().toISOString();
    saveState();
    const csv = buildCsv();
    downloadCsv(csv);
    el.finishButton.disabled = true;
    el.status.textContent = "Submitting results...";
    stopElapsedTimer();
    const submitted = await submitResults(csv);
    el.status.textContent = submitted ? "Finished. Results were submitted and a CSV backup was downloaded." : "Finished. CSV backup was downloaded, but automatic submission is not configured or failed.";
    localStorage.removeItem(STORAGE_KEY);
  }

  async function submitResults(csv) {
    const endpoint = window.TEST_CONFIG && window.TEST_CONFIG.googleAppsScriptUrl;
    if (!endpoint || endpoint.indexOf("https://") !== 0) return false;
    const payload = {
      test_id: window.TEST_CONFIG.testId || "utmos-quality-preserve-test",
      csv,
      rows: buildRows(),
      session: { session_id: state.sessionId, listener_id: state.listenerId, started_at: state.startedAt, finished_at: state.finishedAt, user_agent: navigator.userAgent }
    };
    try {
      await fetch(endpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function buildRows() {
    return state.order.map(function (testItemIndex, itemIndex) {
      const item = TEST_ITEMS[testItemIndex];
      const key = String(testItemIndex);
      return {
        session_id: state.sessionId,
        listener_id: state.listenerId,
        started_at: state.startedAt,
        finished_at: state.finishedAt,
        item_index: itemIndex + 1,
        sample_id: item.sample_id,
        system_id: item.system_id,
        system_label: item.system_label,
        audio_path: item.audio_path,
        score: state.scores[key],
        rated_at: state.ratedAt[key] || ""
      };
    });
  }

  function buildCsv() {
    const lines = [CSV_COLUMNS.join(",")];
    buildRows().forEach(function (row) {
      lines.push(CSV_COLUMNS.map(function (column) { return csvEscape(row[column]); }).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }

  function csvEscape(value) {
    const text = value === undefined || value === null ? "" : String(value);
    return /[",\r\n]/.test(text) ? "\"" + text.replace(/"/g, "\"\"") + "\"" : text;
  }

  function downloadCsv(csv) {
    const link = document.createElement("a");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = state.sessionId + ".csv";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(url);
    link.remove();
  }

  function setSelectedScore(score) {
    document.querySelectorAll("input[name='score']").forEach(function (input) {
      input.checked = input.value === score;
    });
  }

  function allItemsRated() {
    return state.order.every(function (_, index) { return Boolean(state.scores[itemKey(index)]); });
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || saved.sessionId === undefined || saved.order === undefined) return null;
      return saved;
    } catch (error) {
      return null;
    }
  }

  function saveStatusText() {
    const rated = Object.keys(state.scores).length;
    return "Progress is saved in this browser after each rating. Rated " + rated + "/" + state.order.length + ".";
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    updateElapsedTime();
    elapsedTimer = window.setInterval(updateElapsedTime, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedTimer) {
      window.clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function updateElapsedTime() {
    if (!el.elapsed || !state.startedAt) return;
    const started = Date.parse(state.startedAt);
    if (!Number.isFinite(started)) {
      el.elapsed.textContent = "";
      return;
    }
    const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
    el.elapsed.textContent = "Elapsed: " + formatElapsed(seconds);
  }

  function formatElapsed(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }


  function normalizeListenerId(value) {
    return value.trim().replace(/\s+/g, "_");
  }

  function makeSessionId(listenerId, startedAt) {
    return listenerId + "_" + startedAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  }

  function shuffled(values, seed) {
    const items = values.slice();
    const random = mulberry32(seed);
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }

  function stateSeed(listenerId, startedAt) {
    let hash = 2166136261;
    const text = listenerId + startedAt;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
}());
