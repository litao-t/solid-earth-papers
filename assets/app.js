"use strict";

const PAGE_SIZE = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
const researchAreaSlugs = new Set(researchAreaDefinitions.map((area) => area.slug));
const researchAreaLabels = new Map(researchAreaDefinitions.map((area) => [area.slug, area.label]));

const publicationModes = {
  "Communications Earth & Environment": "month",
  "Nature Communications": "month",
  "Earth and Planetary Science Letters": "volume"
};

const journalDisplayNames = {
  "IEEE Transactions on Geoscience and Remote Sensing": "IEEE TGRS",
  "Proceedings of the National Academy of Sciences of the United States of America": "PNAS"
};

const journalAbbreviations = {
  "Communications Earth & Environment": "CEE",
  "Earth and Planetary Science Letters": "EPSL",
  "Geophysical Journal International": "GJI",
  "Geophysical Research Letters": "GRL",
  "IEEE Transactions on Geoscience and Remote Sensing": "TGRS",
  "Journal of Geophysical Research: Solid Earth": "JGR",
  "Nature": "NAT",
  "Nature Communications": "NCOM",
  "Nature Geoscience": "NGEO",
  "Proceedings of the National Academy of Sciences of the United States of America": "PNAS",
  "Science": "SCI",
  "Seismological Research Letters": "SRL"
};

const state = {
  query: "",
  searchAreas: [],
  dateFrom: "",
  dateTo: "",
  detailAreas: [],
  visibleCount: PAGE_SIZE,
  activeDetailKey: "",
  previousRouteType: ""
};

const el = {
  main: document.querySelector("#main-content"),
  homeView: document.querySelector("#home-view"),
  searchView: document.querySelector("#search-view"),
  detailView: document.querySelector("#detail-view"),
  missingView: document.querySelector("#missing-view"),
  navLinks: document.querySelectorAll(".site-header [data-route]"),
  heroJournalCount: document.querySelector("#hero-journal-count"),
  heroArticleCount: document.querySelector("#hero-article-count"),
  heroEarliestDate: document.querySelector("#hero-earliest-date"),
  heroLatestDate: document.querySelector("#hero-latest-date"),
  journalDirectory: document.querySelector("#journal-directory"),
  homeAreaGrid: document.querySelector("#home-area-grid"),
  searchInput: document.querySelector("#search-input"),
  searchAreaFilters: document.querySelector("#search-area-filters"),
  searchReset: document.querySelector("#search-reset"),
  searchDateFrom: document.querySelector("#search-date-from"),
  searchDateTo: document.querySelector("#search-date-to"),
  searchDateFromInput: document.querySelector("#search-date-from-input"),
  searchDateToInput: document.querySelector("#search-date-to-input"),
  dateRangeControl: document.querySelector("#date-range-control"),
  dateRangeTicks: document.querySelector("#date-range-ticks"),
  searchSummary: document.querySelector("#search-summary"),
  searchResults: document.querySelector("#search-results"),
  loadMore: document.querySelector("#load-more"),
  detailBack: document.querySelector("#detail-back"),
  detailKicker: document.querySelector("#detail-kicker"),
  detailTitle: document.querySelector("#detail-title"),
  detailMeta: document.querySelector("#detail-meta"),
  detailSource: document.querySelector("#detail-source"),
  detailAreaFilters: document.querySelector("#detail-area-filters"),
  detailFilterSummary: document.querySelector("#detail-filter-summary"),
  detailClearAreas: document.querySelector("#detail-clear-areas"),
  detailSourceNote: document.querySelector("#detail-source-note"),
  detailArticles: document.querySelector("#detail-articles"),
  archiveSummary: document.querySelector("#archive-summary"),
  archiveList: document.querySelector("#archive-list")
};

function normalize(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const chemicalElements = new Set(
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(" ")
);

function renderChemicalFormulae(value) {
  return value.replace(/\b(?:[A-Z][a-z]?\d*){2,}\b/g, (candidate) => {
    const atoms = [...candidate.matchAll(/([A-Z][a-z]?)(\d*)/g)];
    const isFormula = atoms.some(([, , count]) => count)
      && atoms.every(([, element]) => chemicalElements.has(element))
      && atoms.map((match) => match[0]).join("") === candidate;
    return isFormula ? candidate.replace(/\d+/g, (count) => `<sub>${count}</sub>`) : candidate;
  });
}

function renderScientificText(value) {
  const safeMarkup = escapeHtml(value)
    .replace(/&lt;(\/?)(sub|sup|i|em)&gt;/gi, "<$1$2>")
    .replace(/&lt;\/?scp&gt;/gi, "")
    .replace(/\s+(?=<(?:sub|sup)>)/gi, "");

  return safeMarkup
    .split(/(<\/?(?:sub|sup|i|em)>)/i)
    .map((segment) => segment.startsWith("<") ? segment : renderChemicalFormulae(segment))
    .join("");
}

function safeExternalHref(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : "";
  } catch {
    return "";
  }
}

function slugify(value) {
  return normalize(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function getJournalDisplayName(journal) {
  return journalDisplayNames[journal] || journal;
}

function getJournalAbbreviation(journal) {
  if (journalAbbreviations[journal]) return journalAbbreviations[journal];
  return journal
    .split(/\s+/)
    .filter((word) => !["and", "of", "the", "&"].includes(word.toLowerCase()))
    .map((word) => word[0])
    .join("")
    .slice(0, 5)
    .toUpperCase();
}

function isCrossJournalReport(report) {
  return normalize(report.journal).includes("cross-journal");
}

function getArticleJournal(article, report) {
  return article.journal || report.journal;
}

function formatMonthYear(value) {
  const [year, month] = String(value || "").split("-").map(Number);
  if (!year || !month) return "Undated";
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatDate(value) {
  if (!value) return "Undated";
  const source = String(value).slice(0, 10);
  const normalized = /^\d{4}-\d{2}$/.test(source) ? `${source}-01` : source;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${String(date.getUTCFullYear()).slice(-2)}`;
}

function getPublicationLabel(batch) {
  if (batch.publicationLabel) return batch.publicationLabel;
  const mode = publicationModes[batch.journal] || "issue";
  const issue = String(batch.issue || "");
  const hasIssue = /volume\s+\d+.*issue\s+\d+/i.test(issue);
  const volumeMatch = issue.match(/volume\s+\d+/i);

  if (mode === "issue" && hasIssue) return issue;
  if (mode === "volume" && volumeMatch) return volumeMatch[0].replace(/^volume/i, "Volume");
  return formatMonthYear(batch.issueDate || batch.date);
}

function makeBatch(report, journal, articles, suffix = "", publicationLabel = "") {
  const publicationDate = articles
    .map((article) => getArticleDate(article))
    .sort()
    .at(-1) || report.issueDate || report.date;

  return {
    ...report,
    id: suffix ? `${report.id}-${suffix}` : report.id,
    sourceId: report.id,
    sourceIds: [report.id],
    journal,
    publicationLabel,
    publicationDate,
    sortDate: publicationDate,
    articles: [...articles]
  };
}

function mergeJournalBatches(batches) {
  const merged = new Map();

  batches.forEach((batch) => {
    const displayLabel = getPublicationLabel(batch);
    const key = normalize(displayLabel);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...batch, displayLabel, articles: [...batch.articles] });
      return;
    }

    const seen = new Set(current.articles.map((article) => normalize(article.doi || article.link || article.title)));
    batch.articles.forEach((article) => {
      const articleKey = normalize(article.doi || article.link || article.title);
      if (!seen.has(articleKey)) {
        current.articles.push(article);
        seen.add(articleKey);
      }
    });

    current.sourceIds = Array.from(new Set([...current.sourceIds, ...batch.sourceIds]));
    if (String(batch.date) > String(current.date)) current.date = batch.date;
    if (String(batch.issueDate) > String(current.issueDate)) current.issueDate = batch.issueDate;
    if (String(batch.publicationDate) > String(current.publicationDate)) current.publicationDate = batch.publicationDate;
    if (String(batch.sortDate) > String(current.sortDate)) current.sortDate = batch.sortDate;
  });

  return Array.from(merged.values());
}

function buildJournalGroups() {
  const groups = new Map();

  reports.forEach((report) => {
    const hasArticlePublicationLabels = report.articles.some((article) => article.publicationLabel);
    if (!isCrossJournalReport(report) && !hasArticlePublicationLabels) {
      const group = groups.get(report.journal) || {
        name: report.journal,
        slug: slugify(report.journal),
        batches: []
      };
      group.batches.push(makeBatch(report, report.journal, report.articles));
      groups.set(report.journal, group);
      return;
    }

    const articleGroups = new Map();
    report.articles.forEach((article) => {
      const journal = getArticleJournal(article, report);
      const publicationLabel = article.publicationLabel || "";
      const key = `${journal}::${publicationLabel}`;
      const articleGroup = articleGroups.get(key) || { journal, publicationLabel, articles: [] };
      articleGroup.articles.push(article);
      articleGroups.set(key, articleGroup);
    });

    articleGroups.forEach(({ journal, publicationLabel, articles }) => {
      const group = groups.get(journal) || { name: journal, slug: slugify(journal), batches: [] };
      const suffix = slugify(`${journal}-${publicationLabel || report.date}`);
      group.batches.push(makeBatch(report, journal, articles, suffix, publicationLabel));
      groups.set(journal, group);
    });
  });

  return Array.from(groups.values())
    .map((group) => {
      group.batches = mergeJournalBatches(group.batches);
      group.batches.sort((a, b) => {
        if (publicationModes[group.name] === "volume") {
          const aVolume = Number((a.displayLabel.match(/\d+/) || [0])[0]);
          const bVolume = Number((b.displayLabel.match(/\d+/) || [0])[0]);
          if (aVolume !== bVolume) return bVolume - aVolume;
        }
        const dateCompare = String(b.sortDate || b.date || b.issueDate)
          .localeCompare(String(a.sortDate || a.date || a.issueDate));
        return dateCompare || String(b.issueDate).localeCompare(String(a.issueDate));
      });
      group.articleCount = group.batches.reduce((sum, batch) => sum + batch.articles.length, 0);
      return group;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const journalGroups = buildJournalGroups();
const allBatches = journalGroups.flatMap((group) => group.batches);
const allArticles = allBatches.flatMap((batch) =>
  batch.articles.map((article) => ({
    ...article,
    reportId: batch.id,
    reportJournal: batch.journal,
    reportIssue: batch.displayLabel,
    reportDate: batch.publicationDate || batch.sortDate || batch.date || batch.issueDate || ""
  }))
);

function getArticleDate(article) {
  const candidates = [article.publicationDate, article.onlineDate, article.reportDate, article.issueDate];
  return candidates.map((value) => normalizeArticleDate(value)).find(Boolean)
    || candidates.find(Boolean)
    || "";
}

const sortedArticles = [...allArticles].sort((a, b) => {
  const dateCompare = String(getArticleDate(b)).localeCompare(String(getArticleDate(a)));
  return dateCompare || String(a.title).localeCompare(String(b.title));
});

function normalizeIsoDate(value) {
  const source = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return "";
  const date = new Date(`${source}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== source) return "";
  return source;
}

function normalizeArticleDate(value) {
  const exactDate = normalizeIsoDate(value);
  if (exactDate) return exactDate;
  const month = String(value || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return "";
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return "";
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function isoDateToDay(value) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY_MS);
}

function dayToIsoDate(value) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}

const indexedArticleDates = sortedArticles
  .map((article) => normalizeArticleDate(getArticleDate(article)))
  .filter(Boolean)
  .sort();
const SEARCH_DATE_MIN = indexedArticleDates[0] || "1970-01-01";
const SEARCH_DATE_MAX = indexedArticleDates.at(-1) || SEARCH_DATE_MIN;
const SEARCH_DAY_MIN = isoDateToDay(SEARCH_DATE_MIN);
const SEARCH_DAY_MAX = isoDateToDay(SEARCH_DATE_MAX);
const SEARCH_DAY_SPAN = Math.max(SEARCH_DAY_MAX - SEARCH_DAY_MIN, 1);

function clampSearchDate(value, fallback) {
  const normalized = normalizeIsoDate(value);
  if (!normalized) return fallback;
  if (normalized < SEARCH_DATE_MIN) return SEARCH_DATE_MIN;
  if (normalized > SEARCH_DATE_MAX) return SEARCH_DATE_MAX;
  return normalized;
}

function syncSearchStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestedFrom = params.get("from");
  const requestedTo = params.get("to");
  state.query = params.get("q") || "";
  state.searchAreas = Array.from(new Set(params.getAll("area")))
    .filter((slug) => researchAreaSlugs.has(slug));
  state.dateFrom = clampSearchDate(requestedFrom, SEARCH_DATE_MIN);
  state.dateTo = clampSearchDate(requestedTo, SEARCH_DATE_MAX);
  if (state.dateFrom > state.dateTo) {
    [state.dateFrom, state.dateTo] = [state.dateTo, state.dateFrom];
  }
  state.visibleCount = PAGE_SIZE;

  const canonicalFrom = state.dateFrom === SEARCH_DATE_MIN ? null : state.dateFrom;
  const canonicalTo = state.dateTo === SEARCH_DATE_MAX ? null : state.dateTo;
  if (window.location.hash === "#search"
    && (requestedFrom !== canonicalFrom || requestedTo !== canonicalTo)) {
    writeSearchState({ historyMode: "replace", hash: "#search" });
  }
}

function writeSearchState({ historyMode = "replace", hash = window.location.hash || "#search" } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.delete("q");
  url.searchParams.delete("area");
  url.searchParams.delete("from");
  url.searchParams.delete("to");
  if (state.query.trim()) url.searchParams.set("q", state.query.trim());
  state.searchAreas.forEach((slug) => url.searchParams.append("area", slug));
  if (state.dateFrom !== SEARCH_DATE_MIN) url.searchParams.set("from", state.dateFrom);
  if (state.dateTo !== SEARCH_DATE_MAX) url.searchParams.set("to", state.dateTo);
  url.hash = hash;
  window.history[`${historyMode}State`](null, "", `${url.pathname}${url.search}${url.hash}`);
}

function getLatestDate() {
  return allBatches
    .flatMap((batch) => [batch.date, batch.sortDate, batch.publicationDate, batch.issueDate].filter(Boolean))
    .sort()
    .at(-1) || "";
}

function getArticleSearchText(article) {
  return normalize([
    article.title,
    article.authors,
    article.topic,
    article.region,
    article.method,
    article.reportJournal,
    article.reportIssue,
    article.doi,
    (article.researchAreas || []).map((slug) => researchAreaLabels.get(slug) || slug).join(" "),
    (article.keyPoints || []).join(" ")
  ].join(" "));
}

function matchesSelectedAreas(article, selectedAreas) {
  const articleAreas = article.researchAreas || [];
  return selectedAreas.every((slug) => articleAreas.includes(slug));
}

function articleMatchesSearch(article) {
  const query = normalize(state.query);
  const articleDate = normalizeIsoDate(getArticleDate(article));
  const matchesDate = articleDate && articleDate >= state.dateFrom && articleDate <= state.dateTo;
  return matchesDate
    && matchesSelectedAreas(article, state.searchAreas)
    && (!query || getArticleSearchText(article).includes(query));
}

function getPdfLink(article) {
  if (article.pdfLink) return article.pdfLink;
  if (article.link && article.link.includes("agupubs.onlinelibrary.wiley.com/doi/")) {
    return article.link.replace("/doi/", "/doi/pdf/");
  }
  return "";
}

function getIssuePage(batch) {
  const source = batch.source || "";
  return source.includes("agupubs.onlinelibrary.wiley.com/toc/") ? source : "";
}

function renderUtility() {
  const latestDate = getLatestDate();
  el.heroJournalCount.textContent = journalGroups.length;
  el.heroArticleCount.textContent = allArticles.length;
  el.heroEarliestDate.textContent = formatDate(SEARCH_DATE_MIN);
  el.heroLatestDate.textContent = latestDate ? formatDate(latestDate) : "—";
}

function renderJournalDirectory() {
  el.journalDirectory.innerHTML = journalGroups.map((group) => {
    const latest = group.batches[0];
    const displayName = getJournalDisplayName(group.name);
    return `
      <a class="journal-entry" href="#journal=${encodeURIComponent(group.slug)}" data-route="#journal=${escapeHtml(group.slug)}" aria-label="Open ${escapeHtml(displayName)}">
        <div class="journal-entry-heading">
          <h3>${escapeHtml(displayName)}</h3>
          <span class="journal-count">${group.articleCount}<small>papers</small></span>
        </div>
        <div class="journal-entry-footer">
          <span><b>Latest:</b> ${escapeHtml(latest.displayLabel)} · ${escapeHtml(formatDate(latest.publicationDate))}</span>
          <span class="journal-entry-record">${latest.articles.length} latest · ${group.batches.length} update${group.batches.length === 1 ? "" : "s"}<i aria-hidden="true">↗</i></span>
        </div>
      </a>
    `;
  }).join("");
}

function renderHomeAreas() {
  el.homeAreaGrid.innerHTML = researchAreaDefinitions.map((area) => `
    <button class="home-area" type="button" data-explore-area="${escapeHtml(area.slug)}" aria-label="Search ${escapeHtml(area.label)} articles">
      <strong>${escapeHtml(area.label)}</strong>
    </button>
  `).join("");
}

function renderHome() {
  renderJournalDirectory();
  renderHomeAreas();
}

function renderAreaFilters(container, selectedAreas) {
  container.innerHTML = researchAreaDefinitions.map((area) => `
    <button class="area-filter" type="button" data-area-filter="${escapeHtml(area.slug)}" aria-pressed="${selectedAreas.includes(area.slug)}">
      ${escapeHtml(area.label)}
    </button>
  `).join("");
}

function renderArticleCard(article, { showJournal = false, showSourceBadge = true } = {}) {
  const articleHref = safeExternalHref(article.link);
  const pdfHref = safeExternalHref(getPdfLink(article));
  const isPublisher = article.keyPointsSource === "official-publisher";
  const sourceClass = isPublisher ? "publisher" : "ai";
  const sourceLabel = "AI-generated Key Points";
  const tags = [
    showJournal ? `<span class="article-tag journal">${escapeHtml(getJournalAbbreviation(article.reportJournal))}</span>` : "",
    article.topic ? `<span class="article-tag topic">${escapeHtml(article.topic)}</span>` : "",
    article.region ? `<span class="article-tag">${escapeHtml(article.region)}</span>` : "",
    showJournal && article.reportIssue ? `<span class="article-tag">${escapeHtml(article.reportIssue)}</span>` : ""
  ].join("");
  const keyPoints = (article.keyPoints || []).length
    ? `<ul class="key-points ${sourceClass}">${article.keyPoints.map((point) => `<li>${renderScientificText(point)}</li>`).join("")}</ul>`
    : "";
  const methodParts = [
    article.method ? `Method: ${escapeHtml(article.method)}` : "",
    article.doi ? `DOI: ${escapeHtml(article.doi)}` : ""
  ].filter(Boolean);
  const actions = [
    pdfHref ? `<a href="${pdfHref}" target="_blank" rel="noreferrer">Open PDF <span aria-hidden="true">↓</span></a>` : ""
  ].join("");
  const shouldShowSourceBadge = showSourceBadge && article.keyPointsSource === "ai-generated";
  const topline = `${tags}${shouldShowSourceBadge ? `<span class="source-badge ${sourceClass}">${sourceLabel}</span>` : ""}`;

  return `
    <article class="article-card${actions ? " has-action" : ""}">
      <div>
        ${topline.trim() ? `<div class="article-topline">${topline}</div>` : ""}
        <h2>${articleHref ? `<a class="article-title-link" href="${articleHref}" target="_blank" rel="noreferrer">${renderScientificText(article.title)}</a>` : renderScientificText(article.title)}</h2>
        ${article.authors ? `<p class="article-authors">${escapeHtml(article.authors)}</p>` : ""}
        ${keyPoints}
        ${methodParts.length ? `<div class="article-method">${methodParts.join(" · ")}</div>` : ""}
      </div>
      ${actions ? `<div class="article-actions">${actions}</div>` : ""}
    </article>
  `;
}

function getDateRangeTicks() {
  const minDate = new Date(`${SEARCH_DATE_MIN}T00:00:00Z`);
  const maxDate = new Date(`${SEARCH_DATE_MAX}T00:00:00Z`);
  const spansYears = minDate.getUTCFullYear() !== maxDate.getUTCFullYear();
  const ticks = [];
  let cursor = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));
  const lastMonth = Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1);

  while (cursor.getTime() <= lastMonth) {
    const day = Math.max(Math.floor(cursor.getTime() / DAY_MS), SEARCH_DAY_MIN);
    const label = new Intl.DateTimeFormat("en", {
      month: "short",
      ...(spansYears ? { year: "2-digit" } : {}),
      timeZone: "UTC"
    }).format(cursor);
    ticks.push({ day, label });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  if (ticks.length > 1 && (ticks[1].day - ticks[0].day) / SEARCH_DAY_SPAN < 0.08) {
    ticks.shift();
  }

  if (ticks.length <= 7) return ticks;
  const sampled = new Map();
  for (let index = 0; index < 7; index += 1) {
    const tickIndex = Math.round((index / 6) * (ticks.length - 1));
    sampled.set(tickIndex, ticks[tickIndex]);
  }
  return Array.from(sampled.values());
}

function renderSearchDateControls() {
  const rangeMax = SEARCH_DAY_SPAN;
  const fromOffset = Math.max(isoDateToDay(state.dateFrom) - SEARCH_DAY_MIN, 0);
  const toOffset = Math.max(isoDateToDay(state.dateTo) - SEARCH_DAY_MIN, 0);
  const fromPercent = (fromOffset / rangeMax) * 100;
  const toPercent = (toOffset / rangeMax) * 100;

  [el.searchDateFrom, el.searchDateTo].forEach((input) => {
    input.min = "0";
    input.max = String(rangeMax);
  });
  el.searchDateFrom.value = String(fromOffset);
  el.searchDateTo.value = String(toOffset);
  [el.searchDateFromInput, el.searchDateToInput].forEach((input) => {
    input.min = SEARCH_DATE_MIN;
    input.max = SEARCH_DATE_MAX;
  });
  el.searchDateFromInput.value = state.dateFrom;
  el.searchDateToInput.value = state.dateTo;
  el.searchDateFrom.setAttribute("aria-valuetext", `Start date ${formatDate(state.dateFrom)}`);
  el.searchDateTo.setAttribute("aria-valuetext", `End date ${formatDate(state.dateTo)}`);
  el.dateRangeControl.style.setProperty("--range-start", `${fromPercent}%`);
  el.dateRangeControl.style.setProperty("--range-end", `${toPercent}%`);
  el.dateRangeTicks.innerHTML = getDateRangeTicks().map((tick) => {
    const position = ((tick.day - SEARCH_DAY_MIN) / rangeMax) * 100;
    return `<span style="left: ${position}%">${escapeHtml(tick.label)}</span>`;
  }).join("");
}

function updateSearchDateRange(changedHandle) {
  let fromOffset = Number(el.searchDateFrom.value);
  let toOffset = Number(el.searchDateTo.value);
  if (fromOffset > toOffset) {
    if (changedHandle === "from") toOffset = fromOffset;
    else fromOffset = toOffset;
  }
  state.dateFrom = dayToIsoDate(SEARCH_DAY_MIN + fromOffset);
  state.dateTo = dayToIsoDate(SEARCH_DAY_MIN + toOffset);
  state.visibleCount = PAGE_SIZE;
  writeSearchState({ historyMode: "replace", hash: "#search" });
  renderSearch();
}

function updateSearchDateInput(changedInput) {
  const input = changedInput === "from" ? el.searchDateFromInput : el.searchDateToInput;
  const nextDate = normalizeIsoDate(input.value);
  if (!nextDate) {
    renderSearchDateControls();
    return;
  }

  if (changedInput === "from") {
    state.dateFrom = clampSearchDate(nextDate, state.dateFrom);
    if (state.dateFrom > state.dateTo) state.dateTo = state.dateFrom;
  } else {
    state.dateTo = clampSearchDate(nextDate, state.dateTo);
    if (state.dateTo < state.dateFrom) state.dateFrom = state.dateTo;
  }
  state.visibleCount = PAGE_SIZE;
  writeSearchState({ historyMode: "replace", hash: "#search" });
  renderSearch();
}

function handleSearchDateKeydown(event, changedHandle) {
  const keySteps = {
    ArrowLeft: -1,
    ArrowDown: -1,
    ArrowRight: 1,
    ArrowUp: 1,
    PageDown: -7,
    PageUp: 7
  };
  const rangeMax = Number(event.currentTarget.max);
  let nextValue = Number(event.currentTarget.value);
  if (event.key === "Home") nextValue = 0;
  else if (event.key === "End") nextValue = rangeMax;
  else if (keySteps[event.key]) nextValue += keySteps[event.key];
  else return;
  event.preventDefault();
  event.currentTarget.value = String(Math.min(Math.max(nextValue, 0), rangeMax));
  updateSearchDateRange(changedHandle);
}

function renderSearch() {
  el.searchInput.value = state.query;
  renderAreaFilters(el.searchAreaFilters, state.searchAreas);
  renderSearchDateControls();
  const visible = sortedArticles.filter(articleMatchesSearch);
  const shown = visible.slice(0, state.visibleCount);
  el.searchSummary.textContent = `Showing ${shown.length} of ${visible.length} matching article${visible.length === 1 ? "" : "s"}`;
  el.searchResults.innerHTML = shown.length
    ? shown.map((article) => renderArticleCard(article, { showJournal: true, showSourceBadge: false })).join("")
    : `<div class="empty-state">No articles match the keyword, publication window and every selected research area. Adjust the date range, remove a filter or try another term.</div>`;
  el.loadMore.hidden = shown.length >= visible.length;
  if (!el.loadMore.hidden) {
    const remaining = visible.length - shown.length;
    el.loadMore.firstChild.textContent = `Load ${Math.min(PAGE_SIZE, remaining)} more `;
  }
}

function findBatch(reportId) {
  return allBatches.find((batch) => batch.id === reportId || batch.sourceIds.includes(reportId)) || null;
}

function findGroupForBatch(batch) {
  return batch ? journalGroups.find((group) => group.name === batch.journal) || null : null;
}

function renderArchive(group, currentBatch) {
  const archive = group.batches.filter((batch) => batch.id !== currentBatch.id);
  el.archiveSummary.textContent = archive.length
    ? `${archive.length} other update${archive.length === 1 ? "" : "s"}`
    : "No other updates recorded";
  el.archiveList.innerHTML = archive.length
    ? archive.map((batch) => `
      <a class="archive-item" href="#report=${encodeURIComponent(batch.id)}" data-route="#report=${escapeHtml(batch.id)}">
        <div>
          <h3>${escapeHtml(batch.displayLabel)}</h3>
          <p>${escapeHtml(formatDate(batch.publicationDate))} · ${batch.articles.length} article${batch.articles.length === 1 ? "" : "s"}</p>
        </div>
        <span>Open update →</span>
      </a>
    `).join("")
    : `<div class="empty-state">This journal has one recorded update so far.</div>`;
}

function renderDetail(group, batch, isJournalLanding) {
  const visibleArticles = batch.articles.filter((article) => matchesSelectedAreas(article, state.detailAreas));
  const displayName = getJournalDisplayName(group.name);
  const issuePage = safeExternalHref(getIssuePage(batch));
  const sourceKinds = new Set(batch.articles.map((article) => article.keyPointsSource).filter(Boolean));

  el.detailBack.href = isJournalLanding ? "#journals" : `#journal=${encodeURIComponent(group.slug)}`;
  el.detailBack.dataset.route = el.detailBack.href;
  el.detailBack.textContent = isJournalLanding ? "← All journals" : `← Back to ${displayName}`;
  el.detailKicker.textContent = isJournalLanding ? "Journal / latest batch" : "Journal archive / recorded update";
  el.detailTitle.textContent = isJournalLanding ? displayName : batch.displayLabel;
  el.detailMeta.textContent = isJournalLanding
    ? `${batch.displayLabel} · ${visibleArticles.length} of ${batch.articles.length} articles shown · updated ${formatDate(batch.publicationDate)}`
    : `${displayName} · ${visibleArticles.length} of ${batch.articles.length} articles shown · recorded ${formatDate(batch.publicationDate)}`;
  el.detailSource.hidden = !issuePage;
  if (issuePage) el.detailSource.href = issuePage;
  else el.detailSource.removeAttribute("href");

  renderAreaFilters(el.detailAreaFilters, state.detailAreas);
  el.detailFilterSummary.textContent = state.detailAreas.length
    ? `${visibleArticles.length} shown · matches every selected area`
    : "No research-area filter applied";
  el.detailClearAreas.hidden = !state.detailAreas.length;

  if (sourceKinds.size > 1) {
    const statusLabels = [];
    if (sourceKinds.has("official-publisher")) statusLabels.push("publisher-provided");
    if (sourceKinds.has("ai-generated")) statusLabels.push("AI-generated from abstracts");
    el.detailSourceNote.textContent = `Key Points status: ${statusLabels.join(" · ")}.`;
  } else if (sourceKinds.has("official-publisher")) {
    el.detailSourceNote.textContent = "Key Points are provided by the publisher.";
  } else if (!sourceKinds.size) {
    el.detailSourceNote.textContent = "";
  } else {
    el.detailSourceNote.textContent = "Key Points are AI-generated from article abstracts.";
  }

  el.detailArticles.innerHTML = visibleArticles.length
    ? visibleArticles.map((article) => renderArticleCard(
      { ...article, reportJournal: group.name, reportIssue: batch.displayLabel },
      { showSourceBadge: sourceKinds.size > 1 }
    )).join("")
    : `<div class="empty-state">No articles in this update match every selected research area. Clear or remove a filter to see more.</div>`;
  renderArchive(group, batch);
  document.title = `${isJournalLanding ? displayName : batch.displayLabel} | Solid Earth Observatory`;
}

function parseRoute() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, "")) || "latest";
  if (["latest", "journals", "areas", "search"].includes(raw)) return { type: raw };
  if (raw.startsWith("journal=")) return { type: "journal", slug: raw.slice("journal=".length) };
  if (raw.startsWith("report=")) return { type: "report", id: raw.slice("report=".length) };
  return { type: "missing" };
}

function getDetailRouteKey(route) {
  if (route.type === "journal") return `journal:${route.slug}`;
  if (route.type === "report") return `report:${route.id}`;
  return "";
}

function showView(view) {
  [el.homeView, el.searchView, el.detailView, el.missingView].forEach((candidate) => {
    candidate.hidden = candidate !== view;
  });
}

function setNavigationState(route) {
  el.navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    let active = false;
    if (route.type === "search") active = href === "#search";
    else if (["journal", "report"].includes(route.type)) active = href === "#journals";
    else active = href === `#${route.type}` || (route.type === "latest" && href === "#latest");
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function scrollForRoute(route, shouldScroll) {
  if (!shouldScroll) return;
  window.requestAnimationFrame(() => {
    const target = route.type === "journals"
      ? document.querySelector("#journal-index")
      : route.type === "areas"
        ? document.querySelector("#research-areas")
        : null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function renderRoute({ shouldScroll = true } = {}) {
  const route = parseRoute();
  if (route.type !== "search") {
    const cleanUrl = new URL(window.location.href);
    const searchParameterNames = ["q", "area", "from", "to"];
    if (searchParameterNames.some((name) => cleanUrl.searchParams.has(name))) {
      searchParameterNames.forEach((name) => cleanUrl.searchParams.delete(name));
      window.history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.hash}`);
    }
  }
  const detailKey = getDetailRouteKey(route);
  const wasInDetail = ["journal", "report"].includes(state.previousRouteType);
  if (detailKey && (state.activeDetailKey !== detailKey || !wasInDetail)) {
    state.detailAreas = [];
  }
  state.activeDetailKey = detailKey;
  state.previousRouteType = route.type;
  setNavigationState(route);

  if (["latest", "journals", "areas"].includes(route.type)) {
    showView(el.homeView);
    document.title = "Solid Earth Literature Observatory";
    scrollForRoute(route, shouldScroll);
    return;
  }

  if (route.type === "search") {
    showView(el.searchView);
    renderSearch();
    document.title = "Search Articles | Solid Earth Observatory";
    scrollForRoute(route, shouldScroll);
    return;
  }

  if (route.type === "journal") {
    const group = journalGroups.find((item) => item.slug === route.slug);
    if (group) {
      showView(el.detailView);
      renderDetail(group, group.batches[0], true);
      scrollForRoute(route, shouldScroll);
      return;
    }
  }

  if (route.type === "report") {
    const batch = findBatch(route.id);
    const group = findGroupForBatch(batch);
    if (batch && group) {
      showView(el.detailView);
      renderDetail(group, batch, false);
      scrollForRoute(route, shouldScroll);
      return;
    }
  }

  showView(el.missingView);
  document.title = "Route Not Found | Solid Earth Observatory";
  scrollForRoute({ type: "missing" }, shouldScroll);
}

function navigate(hash, { historyMode = "push" } = {}) {
  const url = new URL(window.location.href);
  const targetRoute = decodeURIComponent(String(hash).replace(/^#/, ""));
  if (targetRoute !== "search") {
    url.searchParams.delete("q");
    url.searchParams.delete("area");
    url.searchParams.delete("from");
    url.searchParams.delete("to");
  }
  url.hash = hash;
  window.history[`${historyMode}State`](null, "", `${url.pathname}${url.search}${url.hash}`);
  if (targetRoute === "search") syncSearchStateFromUrl();
  renderRoute();
}

function toggleArea(slug) {
  if (!researchAreaSlugs.has(slug)) return;
  const route = parseRoute();
  if (route.type === "search") {
    state.searchAreas = state.searchAreas.includes(slug)
      ? state.searchAreas.filter((selected) => selected !== slug)
      : [...state.searchAreas, slug];
    state.visibleCount = PAGE_SIZE;
    writeSearchState({ historyMode: "push", hash: "#search" });
    renderSearch();
    return;
  }
  if (route.type === "journal" || route.type === "report") {
    state.detailAreas = state.detailAreas.includes(slug)
      ? state.detailAreas.filter((selected) => selected !== slug)
      : [...state.detailAreas, slug];
    renderRoute({ shouldScroll: false });
  }
}

document.addEventListener("click", (event) => {
  const routeLink = event.target.closest("a[data-route]");
  if (routeLink && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    const href = routeLink.getAttribute("href");
    if (href && href.startsWith("#")) {
      event.preventDefault();
      navigate(href);
      return;
    }
  }

  const areaButton = event.target.closest("button[data-area-filter]");
  if (areaButton) {
    toggleArea(areaButton.dataset.areaFilter);
    return;
  }

  const exploreButton = event.target.closest("button[data-explore-area]");
  if (exploreButton) {
    state.query = "";
    state.searchAreas = [exploreButton.dataset.exploreArea];
    state.dateFrom = SEARCH_DATE_MIN;
    state.dateTo = SEARCH_DATE_MAX;
    state.visibleCount = PAGE_SIZE;
    writeSearchState({ historyMode: "push", hash: "#search" });
    renderRoute();
  }
});

el.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  state.visibleCount = PAGE_SIZE;
  writeSearchState({ historyMode: "replace", hash: "#search" });
  renderSearch();
});

el.searchDateFrom.addEventListener("input", () => updateSearchDateRange("from"));
el.searchDateTo.addEventListener("input", () => updateSearchDateRange("to"));
el.searchDateFrom.addEventListener("keydown", (event) => handleSearchDateKeydown(event, "from"));
el.searchDateTo.addEventListener("keydown", (event) => handleSearchDateKeydown(event, "to"));
el.searchDateFromInput.addEventListener("change", () => updateSearchDateInput("from"));
el.searchDateToInput.addEventListener("change", () => updateSearchDateInput("to"));

el.searchReset.addEventListener("click", () => {
  state.query = "";
  state.searchAreas = [];
  state.dateFrom = SEARCH_DATE_MIN;
  state.dateTo = SEARCH_DATE_MAX;
  state.visibleCount = PAGE_SIZE;
  writeSearchState({ historyMode: "push", hash: "#search" });
  renderSearch();
  el.searchInput.focus();
});

el.detailClearAreas.addEventListener("click", () => {
  state.detailAreas = [];
  renderRoute({ shouldScroll: false });
});

el.loadMore.addEventListener("click", () => {
  state.visibleCount += PAGE_SIZE;
  renderSearch();
});

window.addEventListener("popstate", () => {
  syncSearchStateFromUrl();
  renderRoute();
});

window.addEventListener("hashchange", () => {
  syncSearchStateFromUrl();
  renderRoute();
});

syncSearchStateFromUrl();
renderUtility();
renderHome();
renderRoute({ shouldScroll: Boolean(window.location.hash) });
