const researchAreaSlugs = new Set(researchAreaDefinitions.map((area) => area.slug));
const researchAreaLabels = new Map(researchAreaDefinitions.map((area) => [area.slug, area.label]));

const state = {
  query: "",
  selectedAreas: readSelectedAreasFromUrl(),
  section: "journals"
};

const publicationModes = {
  "Communications Earth & Environment": "month",
  "Nature Communications": "month",
  "Earth and Planetary Science Letters": "volume"
};

const journalDisplayNames = {
  "IEEE Transactions on Geoscience and Remote Sensing": "TAGS",
  "Proceedings of the National Academy of Sciences of the United States of America": "PNAS"
};

const el = {
  journalList: document.querySelector("#journal-list"),
  journalCount: document.querySelector("#journal-count"),
  searchResults: document.querySelector("#search-results"),
  searchCount: document.querySelector("#search-count"),
  filters: document.querySelector("#research-area-filters"),
  searchClear: document.querySelector("#search-clear-areas"),
  search: document.querySelector("#search-input"),
  sectionLinks: document.querySelectorAll("[data-section-link]"),
  sections: document.querySelectorAll(".content-section"),
  detail: document.querySelector("#report-detail"),
  detailKicker: document.querySelector("#detail-kicker"),
  detailTitle: document.querySelector("#detail-title"),
  detailMeta: document.querySelector("#detail-meta"),
  detailKeyPointsSource: document.querySelector("#detail-key-points-source"),
  detailFilters: document.querySelector("#detail-research-area-filters"),
  detailFilterCount: document.querySelector("#detail-filter-count"),
  detailClear: document.querySelector("#detail-clear-areas"),
  detailSource: document.querySelector("#detail-source"),
  detailBack: document.querySelector("#detail-back"),
  detailSummary: document.querySelector("#detail-summary"),
  detailList: document.querySelector("#detail-list"),
  detailMissing: document.querySelector("#report-missing"),
  journalArchive: document.querySelector("#journal-archive"),
  journalArchiveTitle: document.querySelector("#journal-archive-title"),
  journalArchiveCount: document.querySelector("#journal-archive-count"),
  journalArchiveList: document.querySelector("#journal-archive-list")
};

const availableSections = Array.from(el.sections).map((section) => section.id).filter(Boolean);

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function readSelectedAreasFromUrl() {
  return Array.from(new Set(new URLSearchParams(window.location.search).getAll("area")))
    .filter((slug) => researchAreaSlugs.has(slug));
}

function writeSelectedAreasToUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("area");
  state.selectedAreas.forEach((slug) => url.searchParams.append("area", slug));
  window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function matchesResearchAreas(article) {
  const articleAreas = article.researchAreas || [];
  return state.selectedAreas.every((slug) => articleAreas.includes(slug));
}

function toggleResearchArea(slug) {
  if (!researchAreaSlugs.has(slug)) return;
  state.selectedAreas = state.selectedAreas.includes(slug)
    ? state.selectedAreas.filter((selected) => selected !== slug)
    : [...state.selectedAreas, slug];
  writeSelectedAreasToUrl();
  renderResearchAreaControls();
  renderSearchResults();
  renderReportDetail();
}

function clearResearchAreas() {
  if (!state.selectedAreas.length) return;
  state.selectedAreas = [];
  writeSelectedAreasToUrl();
  renderResearchAreaControls();
  renderSearchResults();
  renderReportDetail();
}

function getJournalDisplayName(journal) {
  return journalDisplayNames[journal] || journal;
}

function slugify(value) {
  return normalize(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
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
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
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
  const recommendation = report.recommendation &&
    articles.some((article) => article.title === report.recommendation.title)
    ? report.recommendation
    : null;

  const publicationDate = articles
    .map((article) => article.publicationDate || article.onlineDate || "")
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
    articles,
    recommendation
  };
}

function mergeJournalBatches(batches) {
  const merged = new Map();

  batches.forEach((batch) => {
    const displayLabel = getPublicationLabel(batch);
    const key = normalize(displayLabel);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...batch, displayLabel });
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
    if (!current.recommendation && batch.recommendation) current.recommendation = batch.recommendation;
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
      const group = groups.get(report.journal) || { name: report.journal, slug: slugify(report.journal), batches: [] };
      group.batches.push(makeBatch(report, report.journal, report.articles));
      groups.set(report.journal, group);
      return;
    }

    const articleGroups = new Map();
    report.articles.forEach((article) => {
      const journal = getArticleJournal(article, report);
      const publicationLabel = article.publicationLabel || "";
      const key = `${journal}::${publicationLabel}`;
      const group = articleGroups.get(key) || { journal, publicationLabel, articles: [] };
      group.articles.push(article);
      articleGroups.set(key, group);
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
        const dateCompare = String(b.sortDate || b.date || b.issueDate).localeCompare(String(a.sortDate || a.date || a.issueDate));
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
    reportTitle: batch.title,
    reportJournal: batch.journal,
    reportIssue: batch.displayLabel
  }))
);

function getArticleSearchText(article) {
  return normalize([
    article.title,
    article.authors,
    article.topic,
    article.region,
    article.method,
    article.reportJournal,
    article.reportIssue,
    (article.researchAreas || []).map((slug) => researchAreaLabels.get(slug) || slug).join(" "),
    (article.keyPoints || []).join(" ")
  ].join(" "));
}

function articleMatches(article) {
  const query = normalize(state.query);
  return matchesResearchAreas(article) && (!query || getArticleSearchText(article).includes(query));
}

function hasActiveSearch() {
  return Boolean(normalize(state.query) || state.selectedAreas.length);
}

function getPdfLink(article) {
  if (article.pdfLink) return article.pdfLink;
  if (article.link && article.link.includes("agupubs.onlinelibrary.wiley.com/doi/")) {
    return article.link.replace("/doi/", "/doi/pdf/");
  }
  return "";
}

function getIssuePage(report) {
  const source = report.source || "";
  return source.includes("agupubs.onlinelibrary.wiley.com/toc/") ? source : "";
}

function getArticleId(reportId, article) {
  return `article-${reportId}-${slugify(article.title)}`;
}

function renderRecommendationCard(report, visibleArticles = report.articles) {
  if (!report.recommendation) return "";
  const recommendedArticle = visibleArticles.find((article) => article.title === report.recommendation.title);
  if (!recommendedArticle) return "";
  const targetId = getArticleId(report.id, recommendedArticle);

  return `
    <a class="recommendation-card" href="#${targetId}" data-scroll-target="${targetId}" aria-label="Jump to recommended article: ${recommendedArticle.title}">
      <b>${report.recommendation.label}</b>
      <h3>${report.recommendation.title}</h3>
      <p>${report.recommendation.text}</p>
    </a>
  `;
}

function renderArticleCard(article, options = {}) {
  const reportId = options.reportId || article.reportId || "article";
  const articleId = getArticleId(reportId, article);
  const pdfLink = getPdfLink(article);
  const keyPointSourceClass = article.keyPointsSource === "official-publisher"
    ? "publisher-key-points"
    : "ai-key-points";
  const issueTag = options.showIssue
    ? `<span class="tag journal">${getJournalDisplayName(article.reportJournal)}</span><span class="tag">${article.reportIssue}</span>`
    : "";
  const methodLine = article.method ? `<div class="article-meta">Method: ${article.method}</div>` : "";
  const descriptiveTags = [
    article.topic ? `<span class="tag topic">${article.topic}</span>` : "",
    article.region ? `<span class="tag">${article.region}</span>` : ""
  ].join("");
  const pdfControl = pdfLink
    ? `<a class="article-link" href="${pdfLink}" target="_blank" rel="noreferrer">Open PDF</a>`
    : "";

  return `
    <article class="article-card" id="${articleId}" tabindex="-1">
      <div>
        <div class="article-topline">
          ${descriptiveTags}
          ${issueTag}
        </div>
        <h3><a class="article-title-link" href="${article.link}" target="_blank" rel="noreferrer">${article.title}</a></h3>
        <p class="article-authors">${article.authors}</p>
        <ul class="key-points ${keyPointSourceClass}">${article.keyPoints.map((point) => `<li>${point}</li>`).join("")}</ul>
        ${methodLine}
      </div>
      ${pdfControl}
    </article>
  `;
}

function renderJournalDirectory() {
  if (!el.journalList || !el.journalCount) return;
  el.journalCount.innerHTML = `<strong>${journalGroups.length}</strong><span>journals monitored</span>`;
  el.journalList.innerHTML = journalGroups.map((group) => {
    const latest = group.batches[0];
    const displayName = getJournalDisplayName(group.name);
    return `
      <a class="journal-card" href="report.html#journal=${group.slug}" aria-label="Open ${displayName}">
        <div>
          <h2>${displayName}</h2>
          <p class="journal-latest">${latest.displayLabel}</p>
          <p class="meta-line">${latest.publicationDate ? `Published ${latest.publicationDate} · ` : ""}${latest.articles.length} latest article${latest.articles.length === 1 ? "" : "s"}</p>
        </div>
        <div class="journal-card-stats">
          <strong>${group.articleCount}</strong>
          <span>articles in ${group.batches.length} update${group.batches.length === 1 ? "" : "s"}</span>
        </div>
      </a>
    `;
  }).join("");
}

function renderResearchAreaFilters(container) {
  if (!container) return;
  container.innerHTML = researchAreaDefinitions.map((area) => `
    <button class="filter-button" type="button" data-research-area="${area.slug}" aria-pressed="${state.selectedAreas.includes(area.slug)}" title="${area.description}">
      ${area.label}
    </button>
  `).join("");
}

function renderResearchAreaControls() {
  renderResearchAreaFilters(el.filters);
  renderResearchAreaFilters(el.detailFilters);
  if (el.searchClear) el.searchClear.hidden = !state.selectedAreas.length;
  if (el.detailClear) el.detailClear.hidden = !state.selectedAreas.length;
}

function renderSearchResults() {
  if (!el.searchCount || !el.searchResults) return;
  if (!hasActiveSearch()) {
    el.searchCount.textContent = "";
    el.searchResults.innerHTML = "";
    return;
  }

  const visible = allArticles.filter(articleMatches);
  el.searchCount.textContent = `${visible.length} result${visible.length === 1 ? "" : "s"}`;
  el.searchResults.innerHTML = visible.length
    ? visible.map((article) => renderArticleCard(article, { showIssue: true })).join("")
    : `<div class="empty-state">No articles match the keyword and all selected research areas. Try fewer areas or another keyword.</div>`;
}

function getSectionFromHash() {
  const hash = window.location.hash.replace("#", "");
  return availableSections.includes(hash) ? hash : null;
}

function setActiveSection(sectionId, options = {}) {
  if (!availableSections.length) return;
  const nextSection = availableSections.includes(sectionId) ? sectionId : "journals";
  state.section = nextSection;

  el.sections.forEach((section) => section.classList.toggle("active", section.id === nextSection));
  el.sectionLinks.forEach((link) => {
    const isActive = link.dataset.sectionLink === nextSection;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (options.focusSearch && nextSection === "search" && el.search) {
    el.search.focus({ preventScroll: true });
  }
}

function parseDetailRoute() {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (!hash) return {};
  if (hash.startsWith("journal=")) return { journalSlug: hash.slice("journal=".length) };
  if (hash.startsWith("report=")) return { reportId: hash.slice("report=".length) };
  return { reportId: hash };
}

function findBatch(reportId) {
  return allBatches.find((batch) => batch.id === reportId || batch.sourceIds.includes(reportId)) || null;
}

function findGroupForBatch(batch) {
  return batch ? journalGroups.find((group) => group.name === batch.journal) || null : null;
}

function setIssuePage(report) {
  if (!el.detailSource) return;
  const issuePage = getIssuePage(report);
  el.detailSource.hidden = !issuePage;
  if (issuePage) el.detailSource.href = issuePage;
  else el.detailSource.removeAttribute("href");
}

function renderArchive(group, currentBatch) {
  if (!el.journalArchive || !el.journalArchiveCount || !el.journalArchiveList) return;
  const archive = group.batches.filter((batch) => batch.id !== currentBatch.id);
  if (el.journalArchiveTitle) {
    el.journalArchiveTitle.textContent = group.batches[0].id === currentBatch.id ? "Previous Updates" : "Other Updates";
  }
  el.journalArchive.hidden = false;
  el.journalArchiveCount.textContent = archive.length
    ? `${archive.length} previous update${archive.length === 1 ? "" : "s"}`
    : "No previous updates";
  el.journalArchiveList.innerHTML = archive.length
    ? archive.map((batch) => `
      <a class="archive-item" href="#report=${batch.id}" aria-label="Open ${batch.displayLabel}">
        <div>
          <h3>${batch.displayLabel}</h3>
          <p class="meta-line">${batch.publicationDate ? `Published: ${batch.publicationDate} · ` : ""}${batch.articles.length} articles</p>
        </div>
        <span class="article-link">View update</span>
      </a>
    `).join("")
    : `<div class="empty-state">This journal has one recorded update so far.</div>`;
}

function renderBatch(batch, group, isJournalLanding) {
  const displayName = getJournalDisplayName(group.name);
  const visibleArticles = batch.articles.filter(matchesResearchAreas);
  const articleCountLabel = state.selectedAreas.length
    ? `${visibleArticles.length} of ${batch.articles.length}`
    : `${batch.articles.length}`;
  const hasPublisherKeyPoints = batch.articles.every((article) => article.keyPointsSource === "official-publisher");
  el.detail.hidden = false;
  if (el.detailMissing) el.detailMissing.hidden = true;
  document.title = `${displayName} | Solid Earth Literature Brief`;
  el.detailKicker.textContent = isJournalLanding ? "Journal" : "Archived Update";
  el.detailTitle.textContent = isJournalLanding ? displayName : batch.displayLabel;
  el.detailMeta.textContent = isJournalLanding
    ? `${batch.displayLabel} · ${articleCountLabel} latest Solid Earth article${visibleArticles.length === 1 ? "" : "s"}`
    : `${displayName} · ${batch.publicationDate ? `Published: ${batch.publicationDate} · ` : ""}${articleCountLabel} Solid Earth articles`;
  el.detailBack.href = isJournalLanding ? "index.html#journals" : `#journal=${group.slug}`;
  el.detailBack.textContent = isJournalLanding ? "All journals" : `Back to ${displayName}`;
  if (el.detailKeyPointsSource) {
    el.detailKeyPointsSource.className = `key-points-source-note ${hasPublisherKeyPoints ? "source-publisher" : "source-ai"}`;
    el.detailKeyPointsSource.textContent = hasPublisherKeyPoints
      ? "Key Points provided by the publisher."
      : "Key Points are AI-generated from article abstracts.";
  }
  setIssuePage(batch);
  if (el.detailFilterCount) {
    el.detailFilterCount.textContent = state.selectedAreas.length
      ? `${visibleArticles.length} shown · matches all selected`
      : "Select one or more · matches all selected";
  }
  el.detailSummary.innerHTML = renderRecommendationCard(batch, visibleArticles);
  el.detailList.innerHTML = visibleArticles.length
    ? visibleArticles.map((article) => renderArticleCard(article, { reportId: batch.id })).join("")
    : `<div class="empty-state">No articles in this update match all selected research areas. Clear or remove a filter to see more.</div>`;
  renderArchive(group, batch);
}

function renderReportDetail() {
  if (!el.detail) return;
  const route = parseDetailRoute();
  let group = route.journalSlug ? journalGroups.find((item) => item.slug === route.journalSlug) : null;
  let batch = route.reportId ? findBatch(route.reportId) : null;
  if (!group && batch) group = findGroupForBatch(batch);
  if (group && !batch) batch = group.batches[0];

  if (!group || !batch) {
    el.detail.hidden = true;
    if (el.detailMissing) el.detailMissing.hidden = false;
    return;
  }

  renderBatch(batch, group, Boolean(route.journalSlug));
}

function validateReports() {
  reports.forEach((report) => {
    if (!report.issueDate) return;
    report.articles.forEach((article) => {
      if (article.issueDate && article.issueDate !== report.issueDate) {
        console.warn(`Issue date mismatch: "${article.title}" is ${article.issueDate}, expected ${report.issueDate}.`);
      }
    });
  });
}

function render() {
  validateReports();
  setActiveSection(getSectionFromHash() || state.section);
  renderJournalDirectory();
  renderResearchAreaControls();
  renderSearchResults();
  renderReportDetail();
}

if (el.search) {
  el.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderSearchResults();
  });
}

[el.filters, el.detailFilters].filter(Boolean).forEach((container) => {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-research-area]");
    if (button) toggleResearchArea(button.dataset.researchArea);
  });
});

[el.searchClear, el.detailClear].filter(Boolean).forEach((button) => {
  button.addEventListener("click", clearResearchAreas);
});

el.sectionLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const sectionId = link.dataset.sectionLink;
    if (!availableSections.includes(sectionId)) return;
    event.preventDefault();
    setActiveSection(sectionId, { focusSearch: sectionId === "search" });
    window.history.replaceState(null, "", `#${sectionId}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-scroll-target]");
  if (!trigger) return;
  const target = document.getElementById(trigger.dataset.scrollTarget);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus({ preventScroll: true });
  target.classList.remove("article-card-highlight");
  window.requestAnimationFrame(() => {
    target.classList.add("article-card-highlight");
    window.setTimeout(() => target.classList.remove("article-card-highlight"), 1800);
  });
});

window.addEventListener("hashchange", () => {
  const sectionId = getSectionFromHash();
  if (sectionId) {
    setActiveSection(sectionId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    renderReportDetail();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

window.addEventListener("popstate", () => {
  state.selectedAreas = readSelectedAreasFromUrl();
  renderResearchAreaControls();
  renderSearchResults();
  renderReportDetail();
});

render();
