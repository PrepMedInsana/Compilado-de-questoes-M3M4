import {
  escapeHTML as e,
  normalize,
  kindLabel,
  emptyEditions,
  parseKey,
  hasResponse,
  grade,
  score,
  filterQuestions,
  shuffle,
  effectiveQuestion,
  validateEdit,
  validateEditions,
  mergeDrafts,
  inferRepository,
  isImagePath,
} from "./core.js";
import { GitHubEditor } from "./github.js";

const main = document.querySelector("#main"),
  modal = document.querySelector("#modal");
const KEYS = {
  progress: "prepmed:progress:v1",
  session: "prepmed:session:v1",
  drafts: "prepmed:drafts:v1",
};
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};
let storageWarning = false;
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    if (!storageWarning) {
      toast("Seu progresso não pôde ser salvo neste navegador.");
      storageWarning = true;
    }
  }
}
let manifest,
  baseBank = [],
  bank = [],
  editions = emptyEditions(),
  config = {},
  active = read(KEYS.session, null);
let progress = read(KEYS.progress, { favorites: [], items: {}, history: [] });
if (
  !Array.isArray(progress.favorites) ||
  !progress.items ||
  !Array.isArray(progress.history)
)
  progress = { favorites: [], items: {}, history: [] };
let drafts = read(KEYS.drafts, {}),
  adminUid = "",
  adminQuery = "",
  adminSpec = "",
  reviewMode = false;
let filters = {
  specialty: "",
  topic: "",
  kind: "objective",
  query: "",
  savedOnly: false,
  errorsOnly: false,
};
let setupPool = [],
  setupLabel = "",
  selectedCount = 20,
  revision = 0;
const github = new GitHubEditor();
const nf = new Intl.NumberFormat("pt-BR");
const number = (x) => nf.format(x);
const specialty = (id) => manifest.specialties.find((x) => x.id === id);
const lookup = (uid) => bank.find((q) => q.uid === uid);
const byId = new Map();
const paths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1v15"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  chart: '<path d="M4 3v18h17M8 16v-5m5 5V7m5 9V4"/>',
  brain:
    '<path d="M12 20V4c-4-3-7 0-6 3-4 0-5 6-2 8-1 4 4 7 8 5zm0-16c4-3 7 0 6 3 4 0 5 6 2 8 1 4-4 7-8 5M6 7l2 2m10-2-2 2M4 15l3-1m13 1-3-1"/>',
  eye: '<path d="M2 12c5-9 15-9 20 0-5 9-15 9-20 0z"/><circle cx="12" cy="12" r="3"/>',
  thyroid:
    '<path d="M9 8c-7-8-8 4-5 9 3 4 5 0 6-2h4c1 2 3 6 6 2 3-5 2-17-5-9M10 4v8m4-8v8"/>',
  ear: '<path d="M5 8c0-8 13-8 13 0 0 5-5 5-5 9s-7 6-7 0m3-7V7c0-4 6-4 6 0 0 3-4 2-4 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
const specIcon = (id) =>
  ({ neuro: "brain", endocrino: "thyroid", otorrino: "ear", oftalmo: "eye" })[
    id
  ];
const button = (action, text, cls = "button", attrs = "") =>
  `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const date = (value) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Treino salvo";
  }
};

function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 4500);
}
function openModal(title, body, extra = "") {
  modal.innerHTML = `<div class="modal-header"><h2 id="modal-title">${e(title)}</h2>${button("close-modal", icon("close"), "icon-button", 'aria-label="Fechar"')}</div>${body}${extra}`;
  modal.showModal();
}
function closeModal() {
  modal.close();
  setupPool = [];
}
function rebuild() {
  bank = baseBank.map((q) => effectiveQuestion(q, editions));
  byId.clear();
  for (const q of bank) byId.set(q.uid, q);
}
function saveActive() {
  write(KEYS.session, active);
}
function saveProgress() {
  write(KEYS.progress, progress);
}
function go(hash) {
  if (location.hash === hash) renderRoute();
  else location.hash = hash;
}
function sessionQuestions() {
  return active?.ids.map((uid) => byId.get(uid)).filter(Boolean) || [];
}
function visiblePool() {
  return filterQuestions(bank, filters, progress);
}
function sourceBlock(q) {
  return `<details class="sources"><summary>Fonte da questão</summary>${q.origins.map((o) => `<p><b>${e(o.source)}</b> · ${e(o.file)}<br>Questão ${e(o.original)}${o.pages?.length ? " · páginas " + e(o.pages.join(", ")) : ""}</p>`).join("")}</details>`;
}
function images(list, answer = false) {
  return (list || [])
    .filter(isImagePath)
    .map(
      (src, i) =>
        `<figure class="question-image">${button("zoom", `<img src="./${e(src)}" alt="${answer ? "Figura do comentário" : "Imagem da questão"} ${i + 1}" loading="lazy">`, "image-button", `data-src="${e(src)}" aria-label="Ampliar imagem ${i + 1}"`)}<figcaption>${answer ? "Figura recuperada da resposta" : "Imagem preservada da fonte"} · clique para ampliar</figcaption></figure>`,
    )
    .join("");
}
const chip = (text, cls = "") => `<span class="chip ${cls}">${e(text)}</span>`;
function about() {
  openModal(
    "Sobre o banco",
    `<div class="modal-body prose"><p>Este compilado reúne <b>${number(baseBank.length)} itens</b> dos rodízios M3 e M4. M3: neuroclínica, neurocirurgia e oftalmologia. M4: endocrinologia, otorrinolaringologia e cirurgia de cabeça e pescoço.</p><p>Patologia está identificada junto de otorrino. As questões objetivas e discursivas são organizadas por assunto; a prova oral de neuro também é dividida em temas e subtemas.</p><p>Questões reconstruídas foram complementadas a partir de relatos ou trechos incompletos. As fontes, imagens, respostas lembradas, marcações e notas de revisão foram preservadas. A origem do gabarito aparece ao conferir a resposta.</p><p>Itens sem resposta ou com divergência não entram na nota automática. Nas discursivas, a avaliação é feita por você, após comparar com o comentário disponível.</p><p>Favoritos, respostas e histórico ficam neste navegador. Rascunhos administrativos só entram no banco público depois de publicados.</p></div>`,
  );
}

function specialtyOptions(selected = "", all = true) {
  return `${all ? '<option value="">Todas as especialidades</option>' : ""}${manifest.specialties.map((s) => `<option value="${s.id}" ${s.id === selected ? "selected" : ""}>${e(s.label)}</option>`).join("")}`;
}
function topicOptions() {
  const qs = filterQuestions(bank, {
    specialty: filters.specialty,
    kind: filters.kind,
  });
  const topics = [...new Set(qs.map((q) => q.topic))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  return `<option value="">Todos os assuntos</option>${topics.map((t) => `<option value="${e(t)}" ${t === filters.topic ? "selected" : ""}>${e(t)}</option>`).join("")}`;
}
function renderHome() {
  const objective = bank.filter(
    (q) => q.kind === "objective" && q.enabled !== false,
  ).length;
  const discursive = bank.filter(
    (q) => q.kind === "discursive" && q.enabled !== false,
  ).length;
  main.innerHTML = `<section class="hero"><div class="container hero-grid"><div class="hero-copy"><div class="eyebrow"><span class="tiny-dot"></span> DOS RODÍZIOS PARA O SEU PRÓXIMO DESAFIO</div><h1>PrepMed<br><span>Insano.</span></h1><p class="hero-lead">Treine o raciocínio.<br>Chegue pronto para o rodízio.</p><p class="hero-description">As questões que passaram de turma em turma,<br class="desktop-only"> agora organizadas para o seu estudo.</p><div class="hero-numbers"><div><strong>${number(objective + discursive)}</strong><span>questões no banco</span></div><div><strong>4</strong><span>especialidades</span></div><div><strong>M3 + M4</strong><span>rodízios reunidos</span></div></div></div>
  <div class="finder"><div class="finder-heading"><span class="icon-tile">${icon("search")}</span><div><h2>Qual é o treino de hoje?</h2><p>Escolha o assunto. O resto é prática.</p></div></div><form id="filter-form"><label>Especialidade<select name="specialty" id="specialty-filter">${specialtyOptions(filters.specialty)}</select></label><label>Assunto<select name="topic" id="topic-filter">${topicOptions()}</select></label><label>Buscar no banco<div class="search-input">${icon("search")}<input name="query" type="search" value="${e(filters.query)}" placeholder="Assunto, palavra-chave ou código" maxlength="200"></div></label><fieldset class="type-picker"><legend>Formato das questões</legend><div>${[
    ["objective", "Objetivas"],
    ["discursive", "Discursivas"],
    ["oral", "Prova oral"],
  ]
    .map(
      ([k, l]) =>
        `<label><input type="radio" name="kind" value="${k}" ${filters.kind === k ? "checked" : ""}><span>${l}</span></label>`,
    )
    .join(
      "",
    )}</div></fieldset><button class="button primary full" type="submit">Iniciar meu treino ${icon("arrow")}</button><p id="match-count" class="finder-count"></p></form></div></div></section>
  <div class="container"><div class="resume-slot">${active && !active.finished ? `<div class="resume-banner"><span>${icon("clock")} <b>Seu treino está salvo.</b> Continue de onde parou.</span>${button("resume", "Continuar treino " + icon("arrow"), "button small")}</div>` : ""}</div><section class="specialty-section"><div class="section-overline">ESCOLHA SEU RODÍZIO</div><div class="specialty-grid">${manifest.specialties.map((s) => button("specialty", `<span class="specialty-icon">${icon(specIcon(s.id))}</span><span class="specialty-copy"><small>${s.rotation}${s.id === "otorrino" ? " · inclui Patologia" : ""}</small><strong>${e(s.label)}</strong><span>${number(bank.filter((q) => q.specialty === s.id && q.enabled !== false).length)} questões</span></span>${icon("arrow")}`, "specialty-card", `data-spec="${s.id}" aria-pressed="${filters.specialty === s.id}"`)).join("")}</div></section>
  <section class="catalog" id="banco"><div class="catalog-heading"><div class="catalog-title"><div class="section-overline">UMA QUESTÃO DE CADA VEZ</div><h2>Encontre seu próximo treino<span class="orange">.</span></h2><p>Explore os assuntos ou use os filtros acima.</p></div><div class="catalog-tabs" aria-label="Tipo de questão">${[
    ["objective", "Objetivas"],
    ["discursive", "Discursivas"],
    ["oral", "Prova oral"],
    ["all", "Todas"],
  ]
    .map(([k, l]) =>
      button(
        "kind",
        l,
        "kind-tab",
        `data-kind="${k}" aria-pressed="${filters.kind === k}"`,
      ),
    )
    .join(
      "",
    )}</div></div><div class="catalog-tools"><span id="catalog-count"></span><div><label class="inline-check"><input type="checkbox" id="favorites-filter" ${filters.savedOnly ? "checked" : ""}> ${icon("star")} Favoritos</label>${button("clear-filters", "Limpar filtros", "text-button")}</div></div><div id="catalog-groups"></div></section>
  <section class="how-it-works"><div><span class="step-num">01</span><h3>Escolha o assunto</h3><p>Uma especialidade, um tema ou um treino misto. Você decide.</p></div><div><span class="step-num">02</span><h3>Treine do seu jeito</h3><p>Confira a cada questão ou faça o teste inteiro antes de corrigir.</p></div><div><span class="step-num">03</span><h3>Volte ao que importa</h3><p>Salve favoritos e refaça os erros para acompanhar sua evolução.</p></div></section></div>`;
  renderCatalog();
}
function renderCatalog() {
  const qs = visiblePool();
  document.querySelector("#match-count").textContent =
    `${number(qs.length)} questões encontradas para o seu treino`;
  document.querySelector("#catalog-count").textContent =
    `${number(qs.length)} questões disponíveis`;
  document.querySelector("#filter-form button[type=submit]").disabled =
    !qs.length;
  document
    .querySelectorAll(".kind-tab")
    .forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.kind === filters.kind),
    );
  document
    .querySelectorAll(".specialty-card")
    .forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.spec === filters.specialty),
    );
  const groups = new Map();
  for (const q of qs) {
    const key = JSON.stringify([q.specialty, q.kind, q.topic]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  let html = "";
  for (const s of manifest.specialties) {
    const blocks = [...groups.values()]
      .filter((g) => g[0].specialty === s.id)
      .sort((a, b) =>
        (a[0].chapter + " " + a[0].topic).localeCompare(
          b[0].chapter + " " + b[0].topic,
          "pt-BR",
        ),
      );
    if (!blocks.length) continue;
    html += `<div class="catalog-spec"><h3>${icon(specIcon(s.id))} ${e(s.label)} <span>${number(blocks.reduce((n, g) => n + g.length, 0))} questões</span></h3><div class="topic-grid">`;
    for (const g of blocks) {
      const q = g[0],
        keys = g.filter((x) => parseKey(x)).length;
      html += `<article class="topic-card"><div class="card-top">${chip(q.oral ? "Prova oral" : q.kind === "objective" ? "Objetivas" : "Discursivas", q.oral ? "oral" : "")}${/patologia/i.test(q.topic) ? chip("Patologia") : ""}<span class="card-count">${number(g.length)} <span>questões</span></span></div>${q.chapter ? `<div class="chapter-label">${e(q.chapter)}</div>` : ""}<h4>${e(q.topic)}</h4><p>${q.kind === "objective" ? `${keys} com correção automática` : "Responda por escrito ou treine em voz alta"}</p>${button("train-topic", `Treinar assunto ${icon("arrow")}`, "card-button", `data-spec="${q.specialty}" data-topic="${e(q.topic)}" data-kind="${q.kind}"`)}</article>`;
    }
    html += "</div></div>";
  }
  document.querySelector("#catalog-groups").innerHTML =
    html ||
    `<div class="empty-state">${icon("search")}<h3>Nenhuma questão por aqui.</h3><p>Tente outro assunto ou retire algum filtro.</p>${button("clear-filters", "Limpar filtros", "button primary")}</div>`;
}
function refreshFilters() {
  const select = document.querySelector("#topic-filter");
  if (select) select.innerHTML = topicOptions();
  renderCatalog();
}
function openSetup(pool, label = "Treino personalizado") {
  if (!pool.length) return toast("Nenhuma questão corresponde aos filtros.");
  setupPool = pool;
  setupLabel = label;
  openModal(
    "Monte seu treino",
    `<form id="setup-form" class="modal-body"><p class="setup-label">${e(label)} <span>· ${number(pool.length)} questões</span></p><fieldset class="mode-choices"><legend>Quando você quer ver as respostas?</legend><label class="mode-choice"><input type="radio" name="mode" value="instant" checked><span class="mode-icon">${icon("bolt")}</span><span><b>Questão por questão</b><small>Responda, confira e passe para a próxima.</small></span></label><label class="mode-choice"><input type="radio" name="mode" value="final"><span class="mode-icon">${icon("book")}</span><span><b>Correção ao final</b><small>Faça o teste inteiro e depois revise as respostas.</small></span></label></fieldset><label>Quantidade de questões<select name="count">${[
      10, 20, 40,
    ]
      .filter((n) => n < pool.length)
      .map(
        (n) =>
          `<option value="${n}" ${n === selectedCount ? "selected" : ""}>${n} questões</option>`,
      )
      .join(
        "",
      )}<option value="all" ${pool.length <= 20 ? "selected" : ""}>Todas (${pool.length})</option></select></label><label class="inline-check"><input type="checkbox" name="random" checked> Embaralhar a ordem das questões</label>${pool.some((q) => q.kind === "objective") ? `<label class="inline-check"><input type="checkbox" name="keyOnly"> Só objetivas com gabarito para correção automática</label>` : ""}<p class="muted tiny">Discursivas usam autoavaliação. Itens sem gabarito ou com divergência ficam fora da nota automática.</p>${active && !active.finished ? '<p class="notice">Iniciar um novo treino substituirá a sessão em andamento. Seu histórico anterior será mantido.</p>' : ""}<button type="submit" class="button primary full">Começar treino ${icon("arrow")}</button></form>`,
  );
}
function startSession(pool, mode, random, count, label) {
  const selected = (random ? shuffle(pool) : pool).slice(
    0,
    count === "all" ? pool.length : Number(count),
  );
  if (!selected.length)
    return toast("Não há questões com gabarito neste recorte.");
  active = {
    id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
    ids: selected.map((q) => q.uid),
    responses: {},
    index: 0,
    mode,
    title: label,
    startedAt: new Date().toISOString(),
    finished: false,
    recorded: false,
  };
  reviewMode = false;
  saveActive();
  closeModal();
  go("#treino");
  window.scrollTo(0, 0);
}
function relatedAnswers(q) {
  const related = (q.related || []).map((uid) => byId.get(uid)).filter(Boolean);
  if (!related.length) return "";
  return `<details class="review-notes"><summary>Respostas relacionadas (${related.length})</summary>${related.map((x) => `<h4>${e(x.id)} · ${e(x.topic)}</h4><div class="prose">${e(x.answer || "Sem resposta disponível na fonte.")}${x.comment ? "\n\n" + e(x.comment) : ""}</div>${x.reviewNote ? `<p class="review-note">${e(x.reviewNote)}</p>` : ""}${images(x.answerImages, true)}`).join("")}</details>`;
}
function answerBlock(q, response) {
  const result = grade(q, response),
    key = parseKey(q),
    titles = {
      correct: "Resposta correta!",
      wrong: "Ainda não. Vamos revisar?",
      blank: "Questão não respondida.",
      pending: "Gabarito ainda não disponível.",
      review: "Este gabarito precisa de revisão.",
      written: "Compare com sua resposta.",
    };
  const comment = q.kind === "discursive" ? q.answer || "" : "";
  return `<section class="answer-block ${result}" id="answer-feedback" tabindex="-1"><div class="feedback-title">${icon(result === "correct" ? "check" : result === "wrong" ? "close" : "book")}<h3>${titles[result]}</h3></div>${key ? `<p class="answer-key">Gabarito: <b>${e(key.join(q.format === "true-false" ? " · " : " / "))}</b></p>` : ""}${!key && q.kind === "objective" && q.answer ? `<p>Resposta registrada na fonte: <b>${e(q.answer)}</b></p>` : ""}${q.keyConflict && !q.reviewed ? `<p class="notice">${e(q.keyConflict)} Este item não entra na nota.</p>` : ""}${q.kind === "discursive" && !comment && !q.comment ? "<p>O comentário ainda não foi preenchido. Você poderá revisitar este item após a atualização.</p>" : ""}${comment ? `<div class="prose">${e(comment)}</div>` : ""}${q.comment ? `<div class="answer-comment"><h4>Comentário</h4><div class="prose">${e(q.comment)}</div></div>` : ""}${q.answerOrigin ? `<p class="answer-origin">${e(q.answerOrigin)}</p>` : ""}${q.reviewNote ? `<p class="review-note"><b>Nota de revisão:</b> ${e(q.reviewNote)}</p>` : ""}${
    q.reviewCodes?.length
      ? `<details class="review-notes"><summary>Notas de revisão (${e(q.reviewCodes.join(", "))})</summary>${q.reviewCodes
          .map((code) => {
            const n = manifest.reviewNotes[code];
            return n
              ? `<h4>${e(code)} · ${e(n.title)}</h4><p>${e(n.text)}</p>${(
                  n.urls || []
                )
                  .filter((x) => /^https?:\/\//.test(x))
                  .map(
                    (x) =>
                      `<a href="${e(x)}" target="_blank" rel="noopener noreferrer">${e(x)}</a>`,
                  )
                  .join("<br>")}`
              : "";
          })
          .join("")}</details>`
      : ""
  }${images(q.answerImages, true)}${relatedAnswers(q)}${q.kind === "discursive" ? `<div class="self-assessment"><p><b>Sua autoavaliação</b><br><span>Use o comentário como referência. Essa avaliação fica separada da nota das objetivas.</span></p>${button("self-good", icon("check") + " Consegui responder", "button small " + (response?.self === "good" ? "selected" : ""), 'aria-pressed="' + (response?.self === "good") + '"')}${button("self-review", "Preciso rever", "button small " + (response?.self === "review" ? "selected" : ""), 'aria-pressed="' + (response?.self === "review") + '"')}</div>` : ""}</section>`;
}
function renderQuiz() {
  const qs = sessionQuestions();
  if (!qs.length) return go("#");
  active.index = Math.max(0, Math.min(active.index, qs.length - 1));
  const q = qs[active.index],
    response = active.responses[q.uid] || {
      value: q.kind === "discursive" ? "" : [],
    };
  const revealed =
      active.finished || (active.mode === "instant" && response.confirmed),
    saved = progress.favorites.includes(q.uid);
  const answered = qs.filter((x) =>
    hasResponse(x, active.responses[x.uid]),
  ).length;
  const key = revealed ? parseKey(q) : null;
  const last = active.index === qs.length - 1;
  let inputs = "";
  if (q.kind === "discursive") {
    inputs = `<label class="written-label">Sua resposta${q.oral ? " (opcional para treino em voz alta)" : ""}<textarea id="written-answer" rows="7" placeholder="Organize seu raciocínio aqui…" ${revealed ? "readonly" : ""}>${e(response.value)}</textarea></label>${q.oral ? `<label class="inline-check spoken-check"><input type="checkbox" id="oral-done" ${response.oralDone ? "checked" : ""} ${revealed ? "disabled" : ""}> Já respondi em voz alta</label>` : ""}`;
  } else if (q.format === "true-false") {
    inputs = `<p class="input-hint">Classifique cada afirmação como verdadeira ou falsa.</p><div class="vf-list">${q.options.map((o, i) => `<div class="vf-row"><span class="vf-statement"><b>${e(o.label)}.</b> ${e(o.text)}</span><div>${["V", "F"].map((v) => `<label class="vf-choice ${revealed && key?.[i] === v ? "is-correct" : ""}"><input type="radio" name="vf-${i}" data-vf="${i}" value="${v}" ${response.value?.[i] === v ? "checked" : ""} ${revealed ? "disabled" : ""}><span>${v}</span></label>`).join("")}</div></div>`).join("")}</div>`;
  } else {
    inputs = `<p class="input-hint">${q.format === "multiple" ? "Marque todas as alternativas corretas." : "Selecione uma alternativa para responder."}</p><div class="alternatives">${q.options.map((o) => `<label class="alternative ${revealed && key?.includes(o.label) ? "is-correct" : ""} ${revealed && key && !key.includes(o.label) && response.value?.includes(o.label) ? "is-wrong" : ""}"><input type="${q.format === "multiple" ? "checkbox" : "radio"}" name="choice" value="${o.label}" ${response.value?.includes(o.label) ? "checked" : ""} ${revealed ? "disabled" : ""}><span class="option-letter">${o.label}</span><span>${e(o.text)}</span>${revealed && key?.includes(o.label) ? icon("check") : ""}</label>`).join("")}</div>`;
  }
  const page = Math.floor(active.index / 30) * 30;
  const confirmDisabled = q.kind === "objective" && !hasResponse(q, response);
  main.innerHTML = `<div class="container training"><div class="training-top"><div><div class="section-overline">${active.finished ? "REVISÃO DO TREINO" : "HORA DE PRATICAR"}</div><h1>${e(active.title)}</h1></div>${button(active.finished ? "results" : "finish", active.finished ? "Voltar ao resultado" : "Encerrar treino", "button small")}</div><div class="session-meter"><span>${icon(active.mode === "instant" ? "bolt" : "book")} ${active.mode === "instant" ? "Questão por questão" : "Correção ao final"}</span><span>${answered} de ${qs.length} respondidas</span><div class="meter"><span style="width:${(100 * answered) / qs.length}%"></span></div></div><div class="training-grid"><article class="question-card"><header class="question-header"><div>${chip(q.id, "code")} ${chip(kindLabel(q))}${q.reconstructed ? chip("Reconstruída") : ""}</div>${button("favorite", icon("star"), "icon-button " + (saved ? "active" : ""), `aria-pressed="${saved}" aria-label="${saved ? "Retirar dos favoritos" : "Salvar nos favoritos"}"`)}</header><div class="question-topic">${e(specialty(q.specialty).label)} ${q.chapter ? " · " + e(q.chapter) : ""} / ${e(q.topic)}</div>${q.context ? `<div class="question-context prose">${e(q.context)}</div>` : ""}<div class="question-stem prose">${e(q.stem)}</div>${images(q.images)}${inputs}${sourceBlock(q)}${revealed ? answerBlock(q, response) : ""}<div class="question-actions">${button("previous", "← Anterior", "button ghost", active.index === 0 ? "disabled" : "")}<div>${!revealed && active.mode === "instant" ? `${button("skip", last ? "Pular e finalizar" : "Pular", "text-button")}${button("confirm", q.kind === "discursive" ? "Ver resposta" : "Confirmar resposta", "button primary", `id="confirm-answer" ${confirmDisabled ? "disabled" : ""}`)}` : button("next", last ? (active.finished ? "Ver resultado" : "Finalizar treino") : (active.mode === "final" && !active.finished ? "Salvar e continuar" : "Próxima questão") + " " + (!last ? icon("arrow") : ""), "button primary")}</div></div></article><aside class="session-sidebar"><h2>Seu treino</h2><p>Questão <b>${active.index + 1}</b> de ${qs.length}</p><div class="question-nav" aria-label="Navegar pelas questões">${qs
    .slice(page, page + 30)
    .map((x, i) => {
      const pos = page + i,
        r = active.responses[x.uid],
        status = active.finished ? grade(x, r) : "";
      return button(
        "jump",
        String(pos + 1),
        "question-dot " +
          (pos === active.index ? "current " : "") +
          (hasResponse(x, r) ? "answered " : "") +
          status,
        `data-index="${pos}" aria-label="Questão ${pos + 1}${hasResponse(x, r) ? ", respondida" : ""}" ${pos === active.index ? 'aria-current="step"' : ""}`,
      );
    })
    .join(
      "",
    )}</div>${qs.length > 30 ? `<div class="nav-pages">${button("nav-back", "←", "button small", page === 0 ? "disabled" : "")}${button("nav-forward", "→", "button small", page + 30 >= qs.length ? "disabled" : "")}</div>` : ""}<div class="sidebar-note">${icon("clock")}<div><b>No seu ritmo.</b><p>Seu treino é salvo automaticamente neste navegador.</p></div></div></aside></div></div>`;
}
function recordSession() {
  const qs = sessionQuestions(),
    report = score(qs, active.responses);
  if (!active.recorded) {
    for (const q of qs) {
      const item = progress.items[q.uid] || {
        attempts: 0,
        correct: 0,
        wrong: 0,
      };
      const outcome = grade(q, active.responses[q.uid]);
      item.attempts++;
      item.last = outcome;
      item.updatedAt = active.finishedAt;
      if (outcome === "correct") item.correct++;
      if (outcome === "wrong") item.wrong++;
      item.self = active.responses[q.uid]?.self || null;
      progress.items[q.uid] = item;
    }
    progress.history.unshift({
      id: active.id,
      title: active.title,
      date: active.finishedAt,
      count: qs.length,
      mode: active.mode,
      score: report,
    });
    progress.history = progress.history.slice(0, 100);
    active.recorded = true;
  } else {
    const h = progress.history.find((x) => x.id === active.id);
    if (h) h.score = report;
  }
  saveProgress();
  saveActive();
  return report;
}
function finishSession() {
  active.finished = true;
  active.finishedAt ||= new Date().toISOString();
  recordSession();
  closeModal();
  go("#resultado");
  window.scrollTo(0, 0);
}
function requestFinish() {
  const remaining = sessionQuestions().filter(
    (q) => !hasResponse(q, active.responses[q.uid]),
  ).length;
  openModal(
    "Finalizar o treino?",
    `<div class="modal-body"><p>${remaining ? `${remaining} questões ainda não foram respondidas. As objetivas com gabarito em branco entram na nota como não respondidas.` : "Suas respostas estão salvas. Vamos conferir o resultado?"}${active.mode === "final" ? " Os gabaritos aparecerão após finalizar." : ""}</p><div class="modal-actions">${button("close-modal", "Continuar treino", "button")}${button("finish-confirmed", "Finalizar e corrigir", "button primary")}</div></div>`,
  );
}
const outcomeLabel = {
  correct: "Acertou",
  wrong: "Errou",
  blank: "Em branco",
  pending: "Sem gabarito",
  review: "Revisão pendente",
  written: "Autoavaliação",
};
function renderResults() {
  if (!active?.finished) return go("#");
  const qs = sessionQuestions(),
    report = score(qs, active.responses);
  main.innerHTML = `<div class="container results-page"><div class="section-overline">TREINO CONCLUÍDO</div><div class="results-heading"><div><h1>Mais um passo dado<span class="orange">.</span></h1><p>${e(active.title)} · ${qs.length} questões</p></div>${button("home", "Voltar ao banco", "button")}</div><div class="score-panel"><div class="score-ring" style="--score:${report.percentage || 0}%"><div><strong>${report.percentage == null ? "—" : report.percentage + "%"}</strong><span>nas objetivas</span></div></div><div class="score-details"><h2>${report.percentage == null ? "Treino de estudo e autoavaliação" : `${report.correct} de ${report.denominator} objetivas com gabarito`}</h2><p>Discursivas e itens sem gabarito confiável ficam separados da nota.</p><div class="result-stats"><div><b>${report.correct}</b><span>acertos</span></div><div><b>${report.wrong}</b><span>erros</span></div><div><b>${report.blank}</b><span>em branco</span></div><div><b>${report.pending + report.review}</b><span>sem correção</span></div><div><b>${report.written}</b><span>discursivas</span></div></div>${report.written ? `<p class="self-summary">Autoavaliação: ${report.selfGood} consegui responder · ${report.selfReview} preciso rever · ${report.written - report.selfGood - report.selfReview} ainda sem avaliar.</p>` : ""}</div></div><div class="results-actions">${button("review-all", icon("book") + " Revisar respostas", "button primary")}${report.wrong ? button("retry-errors", icon("bolt") + " Refazer erros", "button") : ""}${button("retry-all", "Repetir treino", "button ghost")}</div><h2 class="review-heading">Questão por questão</h2><div class="result-list">${qs
    .map((q, i) => {
      const result = grade(q, active.responses[q.uid]);
      return `<div class="result-row"><div><span class="result-status ${result}">${icon(result === "correct" ? "check" : result === "wrong" ? "close" : "book")}</span><span><b>${e(q.id)}</b> · ${e(q.topic)}<small>${e(kindLabel(q))} · ${outcomeLabel[result]}${q.kind === "discursive" && active.responses[q.uid]?.self ? " · " + (active.responses[q.uid].self === "good" ? "consegui responder" : "preciso rever") : ""}</small></span></div>${button("review-question", "Revisar →", "text-button", `data-index="${i}"`)}</div>`;
    })
    .join("")}</div></div>`;
}
function renderProgress() {
  const items = Object.entries(progress.items).filter(([u]) => byId.has(u));
  const acertos = items.reduce((n, [, i]) => n + (i.correct || 0), 0),
    erros = items.reduce((n, [, i]) => n + (i.wrong || 0), 0);
  main.innerHTML = `<div class="container progress-page"><div class="page-heading"><div><div class="section-overline">SEU RITMO, SUA EVOLUÇÃO</div><h1>Meu progresso<span class="orange">.</span></h1><p>Seu histórico de estudo neste navegador.</p></div>${button("home", "Voltar ao banco", "button")}</div><div class="progress-stats"><div><span>${icon("book")}</span><strong>${number(items.length)}</strong><small>questões praticadas</small></div><div><span>${icon("check")}</span><strong>${acertos + erros ? Math.round((100 * acertos) / (acertos + erros)) + "%" : "—"}</strong><small>acertos nas respostas corrigidas</small></div><div><span>${icon("star")}</span><strong>${progress.favorites.filter((u) => byId.has(u)).length}</strong><small>questões favoritas</small></div><div><span>${icon("chart")}</span><strong>${progress.history.length}</strong><small>treinos concluídos</small></div></div><div class="progress-actions">${button("practice-favorites", icon("star") + " Treinar favoritos", "button")}${button("practice-errors", "Rever meus erros", "button primary")}</div><div class="history-heading"><h2>Últimos treinos</h2>${button("export-progress", "Baixar meu histórico", "text-button")}</div>${
    progress.history.length
      ? `<div class="history-list">${progress.history
          .slice(0, 15)
          .map(
            (h) =>
              `<article class="history-item"><span class="history-icon">${icon(h.mode === "instant" ? "bolt" : "book")}</span><div><h3>${e(h.title)}</h3><p>${date(h.date)} · ${h.count} questões · ${h.mode === "instant" ? "questão por questão" : "correção ao final"}</p></div><b>${h.score.percentage == null ? "Autoavaliação" : h.score.percentage + "%"}</b></article>`,
          )
          .join("")}</div>`
      : `<div class="empty-state">${icon("chart")}<h2>Seu primeiro treino começa aqui.</h2><p>Ao concluir uma sessão, você verá seu histórico e poderá refazer os erros.</p>${button("home", "Explorar assuntos", "button primary")}</div>`
  }<p class="muted tiny">O percentual do histórico considera respostas objetivas corrigidas; itens sem gabarito e autoavaliações ficam separados. O histórico é local e pode ser perdido ao limpar os dados do navegador.</p></div>`;
}
function adminRecord(q) {
  const d = drafts[q.uid];
  if (d) return d.next;
  const published = editions.questions[q.uid];
  return (
    published || {
      answer: q.answer,
      comment: q.comment,
      enabled: q.enabled,
      reviewed: Boolean(q.reviewed),
      updatedAt: null,
    }
  );
}
function adminSelection() {
  const matches = baseBank.filter(
    (q) =>
      (!adminSpec || q.specialty === adminSpec) &&
      (!adminQuery ||
        normalize([q.id, q.uid, q.topic, q.stem].join(" ")).includes(
          normalize(adminQuery),
        )),
  );
  return { matches, q: baseBank.find((q) => q.uid === adminUid) || matches[0] };
}
function renderAdmin() {
  const repo = inferRepository(location, config.github),
    count = Object.keys(drafts).length;
  main.innerHTML = `<div class="container admin-page"><div class="page-heading"><div><div class="section-overline">CUIDE DO BANCO</div><h1>Administração<span class="orange">.</span></h1><p>Revise gabaritos e adicione comentários às respostas.</p></div>${button("home", "Voltar ao banco", "button")}</div><div class="admin-top"><section class="admin-connect"><h2>${icon("lock")} Publicação pelo GitHub</h2><p>As alterações públicas usam a permissão de escrita do seu repositório.</p>${github.token ? `<div class="connected">${icon("check")} Conectado como <b>${e(github.user)}</b> · ${e(github.config.owner + "/" + github.config.repo)}</div><div class="connect-actions">${button("reload-remote", "Atualizar edições publicadas", "button small")}${button("disconnect", "Desconectar", "text-button")}</div>` : `<form id="connect-form"><div class="repo-fields"><label>Usuário / organização<input name="owner" value="${e(repo.owner)}" required autocapitalize="none"></label><label>Repositório<input name="repo" value="${e(repo.repo)}" required autocapitalize="none"></label><label>Branch<input name="branch" value="${e(repo.branch)}" required></label></div><label>Token pessoal do GitHub<input type="password" name="token" placeholder="Token com Contents: Read and write" required autocomplete="off" spellcheck="false"></label><p class="tiny muted">O token fica apenas na memória desta aba. Configure acesso somente a este repositório.</p><button class="button primary" type="submit">Conectar ao GitHub</button></form>`}<p id="admin-status" class="admin-status" role="status"></p></section><section class="admin-publish"><span class="icon-tile">${icon("book")}</span><h2>${count} ${count === 1 ? "rascunho" : "rascunhos"}</h2><p>Rascunhos aparecem só no editor. O treino usa as edições publicadas.</p>${button("publish", icon("arrow") + " Publicar alterações", "button primary full", !count || !github.token ? "disabled" : "")}${button("export-editions", "Baixar edicoes.json", "button full", !count ? "disabled" : "")}<p class="tiny muted">Você também pode substituir data/edicoes.json no repositório com o arquivo baixado.</p></section></div><section class="admin-editor"><div class="editor-heading"><h2>Editar uma questão</h2><div class="admin-search"><select id="admin-specialty" aria-label="Filtrar especialidade">${specialtyOptions(adminSpec)}</select><input id="admin-search" type="search" value="${e(adminQuery)}" placeholder="Código, assunto ou palavra-chave" aria-label="Buscar questão para editar"></div></div><div id="admin-question-selection"></div><div id="admin-fields"></div></section></div>`;
  renderAdminFields();
}
function renderAdminFields() {
  const { matches, q } = adminSelection();
  const selection = document.querySelector("#admin-question-selection"),
    fields = document.querySelector("#admin-fields");
  if (!q || !matches.length) {
    selection.innerHTML = "<p>Nenhuma questão encontrada.</p>";
    fields.innerHTML = "";
    return;
  }
  const included = matches.includes(q) ? q : matches[0];
  adminUid = included.uid;
  const limit = matches.slice(0, 150);
  if (!limit.includes(included)) limit.unshift(included);
  selection.innerHTML = `<label>Questão (${matches.length} encontradas)<select id="admin-question">${limit.map((x) => `<option value="${e(x.uid)}" ${x.uid === included.uid ? "selected" : ""}>${e(x.id + " · " + x.topic)}</option>`).join("")}</select></label>${matches.length > 150 ? '<p class="tiny muted">Mostrando as primeiras 150. Use a busca para refinar.</p>' : ""}`;
  const r = adminRecord(included);
  const uncertain =
    included.kind === "objective" &&
    r.answer &&
    !parseKey({ ...included, ...r, keyConflict: "" });
  fields.innerHTML = `<div class="admin-question-preview">${chip(included.id, "code")} ${chip(kindLabel(included))}${included.reconstructed ? chip("Reconstruída") : ""}<div class="prose">${e(included.context)}${included.context ? "\n\n" : ""}${e(included.stem)}</div>${included.options.length ? `<ol class="preview-options">${included.options.map((o) => `<li><b>${e(o.label)})</b> ${e(o.text)}</li>`).join("")}</ol>` : ""}${images(included.images)}${sourceBlock(included)}</div><form id="edit-form"><input type="hidden" name="uid" value="${e(included.uid)}"><label>${included.kind === "discursive" ? "Resposta / comentário de referência" : included.format === "true-false" ? "Gabarito V/F, na ordem das afirmações" : "Alternativa correta"}${included.kind === "discursive" ? `<textarea name="answer" rows="7" maxlength="20000" placeholder="Escreva a resposta esperada para esta questão…">${e(r.answer || "")}</textarea>` : `<input name="answer" value="${e(uncertain ? "" : r.answer || "")}" placeholder="${included.format === "true-false" ? "Ex.: V, F, V, F" : "Ex.: A (vazio = sem gabarito)"}" maxlength="100">`}</label>${uncertain ? `<p class="notice">Resposta antiga preservada: ${e(r.answer)}. Escolha um único gabarito válido para este enunciado ou deixe vazio para retirar a correção automática.</p>` : ""}<label>Comentário adicional<textarea name="comment" rows="5" maxlength="30000" placeholder="Explique o raciocínio, os pontos principais ou o que esperar na prova oral…">${e(r.comment || "")}</textarea></label><div class="editor-checks"><label class="inline-check"><input type="checkbox" name="enabled" ${r.enabled ? "checked" : ""}> Questão ativa no banco</label><label class="inline-check"><input type="checkbox" name="reviewed" ${r.reviewed ? "checked" : ""}> Gabarito revisado por mim</label></div><p class="tiny muted">Marcar como revisado permite corrigir automaticamente itens com divergências antigas, usando o gabarito que você definiu.</p><div class="editor-actions"><button type="submit" class="button primary">Salvar rascunho</button>${drafts[included.uid] ? button("discard-draft", "Descartar rascunho deste item", "text-button") : ""}</div></form>`;
}
function download(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], {
      type: "application/json;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderRoute() {
  if (!manifest) return;
  const hash = location.hash;
  if (hash === "#treino") renderQuiz();
  else if (hash === "#resultado") renderResults();
  else if (hash === "#progresso") renderProgress();
  else if (hash === "#admin") renderAdmin();
  else {
    renderHome();
    if (hash === "#banco")
      requestAnimationFrame(() =>
        document
          .querySelector("#banco")
          ?.scrollIntoView({ behavior: "smooth" }),
      );
  }
  document
    .querySelectorAll(".nav a")
    .forEach((a) =>
      a.setAttribute(
        "aria-current",
        a.getAttribute("href") === hash ? "page" : "false",
      ),
    );
}
function updateResponse(values) {
  const q = sessionQuestions()[active.index];
  active.responses[q.uid] = {
    ...(active.responses[q.uid] || {
      value: q.kind === "discursive" ? "" : [],
    }),
    ...values,
  };
  saveActive();
  const confirm = document.querySelector("#confirm-answer");
  if (confirm)
    confirm.disabled =
      q.kind === "objective" && !hasResponse(q, active.responses[q.uid]);
}
function navigate(index) {
  active.index = Math.max(0, Math.min(index, active.ids.length - 1));
  saveActive();
  renderQuiz();
  document
    .querySelector(".question-card")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function setAdminStatus(text, error = false) {
  const p = document.querySelector("#admin-status");
  if (p) {
    p.textContent = text;
    p.classList.toggle("error", error);
  } else toast(text);
}

main.addEventListener("input", (event) => {
  if (event.target.name === "query") {
    filters.query = event.target.value;
    renderCatalog();
  }
  if (event.target.id === "written-answer" && !active.finished)
    updateResponse({ value: event.target.value });
  if (event.target.id === "admin-search") {
    adminQuery = event.target.value;
    renderAdminFields();
  }
});
main.addEventListener("change", (event) => {
  const t = event.target;
  if (t.name === "specialty" && t.id === "specialty-filter") {
    filters.specialty = t.value;
    filters.topic = "";
    refreshFilters();
  }
  if (t.name === "topic") {
    filters.topic = t.value;
    renderCatalog();
  }
  if (t.name === "kind") {
    filters.kind = t.value;
    filters.topic = "";
    refreshFilters();
  }
  if (t.id === "favorites-filter") {
    filters.savedOnly = t.checked;
    renderCatalog();
  }
  if (t.name === "choice" && !active.finished) {
    const q = sessionQuestions()[active.index];
    updateResponse({
      value:
        q.format === "multiple"
          ? [...main.querySelectorAll("[name=choice]:checked")].map(
              (x) => x.value,
            )
          : [t.value],
    });
  }
  if (t.dataset.vf !== undefined && !active.finished) {
    const q = sessionQuestions()[active.index],
      a = [
        ...(active.responses[q.uid]?.value || Array(q.options.length).fill("")),
      ];
    a[Number(t.dataset.vf)] = t.value;
    updateResponse({ value: a });
  }
  if (t.id === "oral-done" && !active.finished)
    updateResponse({ oralDone: t.checked });
  if (t.id === "admin-specialty") {
    adminSpec = t.value;
    renderAdminFields();
  }
  if (t.id === "admin-question") {
    adminUid = t.value;
    renderAdminFields();
  }
});
async function onSubmit(event) {
  const form = event.target;
  if (
    !["filter-form", "setup-form", "connect-form", "edit-form"].includes(
      form.id,
    )
  )
    return;
  event.preventDefault();
  const f = new FormData(form);
  if (form.id === "filter-form")
    return openSetup(
      visiblePool(),
      filters.topic ||
        specialty(filters.specialty)?.label ||
        "Treino personalizado",
    );
  if (form.id === "setup-form") {
    let pool = setupPool;
    if (f.has("keyOnly"))
      pool = pool.filter((q) => q.kind !== "objective" || parseKey(q));
    selectedCount = Number(f.get("count")) || 20;
    return startSession(
      pool,
      f.get("mode"),
      f.has("random"),
      f.get("count"),
      setupLabel,
    );
  }
  if (form.id === "edit-form") {
    const q = baseBank.find((x) => x.uid === f.get("uid"));
    try {
      const next = validateEdit(q, {
        answer: f.get("answer"),
        comment: f.get("comment"),
        enabled: f.has("enabled"),
        reviewed: f.has("reviewed"),
        updatedAt: new Date().toISOString(),
      });
      drafts[q.uid] = {
        base: drafts[q.uid]
          ? drafts[q.uid].base
          : editions.questions[q.uid] || null,
        next,
      };
      write(KEYS.drafts, drafts);
      renderAdmin();
      toast("Rascunho salvo. Publique para disponibilizar a todos.");
    } catch (error) {
      toast(error.message);
    }
  }
  if (form.id === "connect-form") {
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    const token = String(f.get("token"));
    form.querySelector("[name=token]").value = "";
    setAdminStatus("Conectando ao seu repositório…");
    try {
      const result = await github.connect(
        {
          owner: String(f.get("owner")),
          repo: String(f.get("repo")),
          branch: String(f.get("branch")),
        },
        token,
        baseBank,
      );
      editions = result.editions;
      rebuild();
      renderAdmin();
      setAdminStatus(
        "Conectado. A publicação exige permissão Contents: Read and write.",
      );
    } catch (error) {
      setAdminStatus(error.message, true);
      submit.disabled = false;
    }
  }
}
main.addEventListener("submit", onSubmit);
modal.addEventListener("submit", onSubmit);

async function onAction(event) {
  const b = event.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const action = b.dataset.action,
    qs = sessionQuestions(),
    q = qs[active?.index || 0];
  if (action === "close-modal") return closeModal();
  if (action === "home") return go("#");
  if (action === "resume") {
    reviewMode = false;
    return go("#treino");
  }
  if (action === "clear-filters") {
    filters = {
      specialty: "",
      topic: "",
      kind: "objective",
      query: "",
      savedOnly: false,
      errorsOnly: false,
    };
    return renderHome();
  }
  if (action === "specialty") {
    filters.specialty =
      filters.specialty === b.dataset.spec ? "" : b.dataset.spec;
    filters.topic = "";
    document.querySelector("#specialty-filter").value = filters.specialty;
    refreshFilters();
    document.querySelector("#banco").scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (action === "kind") {
    filters.kind = b.dataset.kind;
    filters.topic = "";
    document
      .querySelectorAll("[name=kind]")
      .forEach((x) => (x.checked = x.value === filters.kind));
    return refreshFilters();
  }
  if (action === "train-topic")
    return openSetup(
      filterQuestions(visiblePool(), {
        specialty: b.dataset.spec,
        topic: b.dataset.topic,
        kind: b.dataset.kind,
      }),
      b.dataset.topic,
    );
  if (action === "favorite") {
    progress.favorites = progress.favorites.includes(q.uid)
      ? progress.favorites.filter((u) => u !== q.uid)
      : [...progress.favorites, q.uid];
    saveProgress();
    renderQuiz();
    return;
  }
  if (action === "zoom") {
    if (!isImagePath(b.dataset.src)) return;
    const dlg = document.querySelector("#image-modal");
    dlg.innerHTML = `${button("close-image", icon("close"), "icon-button", 'aria-label="Fechar imagem ampliada"')}<img src="./${e(b.dataset.src)}" alt="Imagem ampliada da questão">`;
    dlg.showModal();
    return;
  }
  if (action === "close-image")
    return document.querySelector("#image-modal").close();
  if (action === "previous") return navigate(active.index - 1);
  if (action === "jump") return navigate(Number(b.dataset.index));
  if (action === "nav-back")
    return navigate(Math.max(0, Math.floor(active.index / 30) * 30 - 30));
  if (action === "nav-forward")
    return navigate(Math.floor(active.index / 30) * 30 + 30);
  if (action === "confirm") {
    if (q.kind === "objective" && !hasResponse(q, active.responses[q.uid]))
      return;
    updateResponse({ confirmed: true });
    renderQuiz();
    document.querySelector("#answer-feedback")?.focus({ preventScroll: true });
    document
      .querySelector("#answer-feedback")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  if (action === "next" || action === "skip") {
    if (active.index === qs.length - 1)
      return active.finished ? go("#resultado") : requestFinish();
    return navigate(active.index + 1);
  }
  if (action === "finish") return requestFinish();
  if (action === "finish-confirmed") return finishSession();
  if (action === "results") return go("#resultado");
  if (action === "review-all" || action === "review-question") {
    active.index = Number(b.dataset.index) || 0;
    reviewMode = true;
    saveActive();
    return go("#treino");
  }
  if (action === "retry-all" || action === "retry-errors")
    return openSetup(
      action === "retry-errors"
        ? qs.filter((x) => grade(x, active.responses[x.uid]) === "wrong")
        : qs,
      action === "retry-errors" ? "Revisão dos erros" : active.title,
    );
  if (action === "self-good" || action === "self-review") {
    updateResponse({ self: action === "self-good" ? "good" : "review" });
    if (active.finished) {
      if (progress.items[q.uid])
        progress.items[q.uid].self = active.responses[q.uid].self;
      recordSession();
    }
    renderQuiz();
    return;
  }
  if (action === "practice-favorites")
    return openSetup(
      filterQuestions(bank, { savedOnly: true }, progress),
      "Meus favoritos",
    );
  if (action === "practice-errors")
    return openSetup(
      filterQuestions(bank, { errorsOnly: true }, progress),
      "Revisão dos meus erros",
    );
  if (action === "export-progress")
    return download("prepmed-meu-historico.json", progress);
  if (action === "discard-draft") {
    delete drafts[adminUid];
    write(KEYS.drafts, drafts);
    return renderAdmin();
  }
  if (action === "disconnect") {
    github.disconnect();
    renderAdmin();
    return toast("Desconectado. O token foi removido da memória da aba.");
  }
  if (action === "reload-remote") {
    b.disabled = true;
    try {
      const result = await github.read(baseBank);
      editions = result.editions;
      rebuild();
      renderAdmin();
      setAdminStatus(
        "Edições publicadas atualizadas. Seus rascunhos foram preservados.",
      );
    } catch (error) {
      setAdminStatus(error.message, true);
      b.disabled = false;
    }
    return;
  }
  if (action === "export-editions") {
    try {
      download(
        "edicoes.json",
        validateEditions(mergeDrafts(editions, drafts), baseBank),
      );
      toast(
        "Arquivo pronto. Substitua data/edicoes.json no repositório para publicar.",
      );
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (action === "publish") {
    const n = Object.keys(drafts).length;
    return openModal(
      "Publicar as alterações?",
      `<div class="modal-body"><p>${n} ${n === 1 ? "questão será atualizada" : "questões serão atualizadas"} em <b>${e(github.config.owner + "/" + github.config.repo)}</b>, branch <b>${e(github.config.branch)}</b>.</p><p>O GitHub registrará um commit; as mudanças aparecerão para seus colegas após a publicação do Pages.</p><div class="modal-actions">${button("close-modal", "Voltar", "button")}${button("publish-confirmed", "Publicar no GitHub", "button primary")}</div></div>`,
    );
  }
  if (action === "publish-confirmed") {
    b.disabled = true;
    b.textContent = "Publicando…";
    try {
      const result = await github.publish(drafts, baseBank);
      editions = result.editions;
      drafts = {};
      write(KEYS.drafts, drafts);
      rebuild();
      closeModal();
      renderAdmin();
      setAdminStatus(
        "Alterações publicadas no repositório. Aguarde a atualização do GitHub Pages.",
      );
    } catch (error) {
      closeModal();
      setAdminStatus(error.message, true);
      toast("Publicação não concluída. Seus rascunhos foram preservados.");
    }
  }
}
main.addEventListener("click", onAction);
modal.addEventListener("click", onAction);
document.querySelector("#image-modal").addEventListener("click", onAction);
document
  .querySelector("#about-button")
  .addEventListener("click", () => manifest && about());
window.addEventListener("hashchange", () => {
  renderRoute();
  if (location.hash !== "#banco") window.scrollTo(0, 0);
});
window.addEventListener("pagehide", () => github.disconnect());

async function init() {
  try {
    const get = async (path) => {
      const r = await fetch(path, { cache: "no-store" });
      if (!r.ok) throw new Error(`Falha ao carregar ${path}.`);
      return r.json();
    };
    manifest = await get("./data/manifest.json");
    const chunks = await Promise.all(
      manifest.specialties.map((s) => get("./data/" + s.file)),
    );
    baseBank = chunks.flat();
    if (baseBank.length !== manifest.total)
      throw new Error(
        "O banco está incompleto. Confira os arquivos da publicação.",
      );
    [editions, config] = await Promise.all([
      get("./data/edicoes.json").then((x) => validateEditions(x, baseBank)),
      get("./site.config.json"),
    ]);
    rebuild();
    if (active) {
      active.ids = (active.ids || []).filter((u) => byId.has(u));
      active.responses ||= {};
      if (!active.ids.length) active = null;
    }
    if (!drafts || typeof drafts !== "object" || Array.isArray(drafts))
      drafts = {};
    renderRoute();
  } catch (error) {
    main.innerHTML = `<div class="container empty-state load-error"><h1>Não foi possível abrir o banco.</h1><p>${e(error.message)}</p><p>Abra o site pelo GitHub Pages ou por um servidor local.</p><button class="button primary" id="reload-app">Tentar novamente</button></div>`;
    document
      .querySelector("#reload-app")
      .addEventListener("click", () => location.reload());
  }
}
init();
