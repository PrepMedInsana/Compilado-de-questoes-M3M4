export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const isImagePath = (value) =>
  /^assets\/questions\/[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(value);
export const emptyEditions = () => ({
  schemaVersion: 1,
  updatedAt: null,
  questions: {},
});
export const kindLabel = (q) =>
  q.oral ? "Prova oral" : q.kind === "objective" ? "Objetiva" : "Discursiva";
export function parseKey(q) {
  if (!q.answer || q.kind !== "objective") return null;
  if (q.keyConflict && !q.reviewed) return null;
  if (q.format === "true-false") {
    if (!/^[VF,\s]+$/i.test(q.answer)) return null;
    const values = q.answer.toUpperCase().match(/[VF]/g) || [];
    return values.length === q.options.length && values.length > 0
      ? values
      : null;
  }
  const value = q.answer.trim().toUpperCase();
  if (q.format === "multiple") {
    if (!/^[A-E,\/\s]+$/.test(value)) return null;
    const values = [...new Set(value.match(/[A-E]/g))].sort();
    return values.length &&
      values.every((x) => q.options.some((o) => o.label === x))
      ? values
      : null;
  }
  return q.options.some((o) => o.label === value) ? [value] : null;
}
export const hasResponse = (q, response) =>
  q.kind === "discursive"
    ? Boolean(response?.oralDone || String(response?.value || "").trim())
    : Array.isArray(response?.value) &&
      response.value.length > 0 &&
      response.value.every(Boolean);
export function grade(q, response) {
  if (q.kind === "discursive") return "written";
  const key = parseKey(q);
  if (!key) return q.keyConflict && !q.reviewed ? "review" : "pending";
  if (!hasResponse(q, response)) return "blank";
  let values = response.value.map((x) => String(x).toUpperCase());
  if (q.format === "multiple") values = [...new Set(values)].sort();
  return JSON.stringify(values) === JSON.stringify(key) ? "correct" : "wrong";
}
export function score(questions, responses) {
  const counts = {
    correct: 0,
    wrong: 0,
    blank: 0,
    pending: 0,
    review: 0,
    written: 0,
    selfGood: 0,
    selfReview: 0,
  };
  for (const q of questions) {
    counts[grade(q, responses[q.uid])]++;
    if (q.kind === "discursive" && responses[q.uid]?.self === "good")
      counts.selfGood++;
    if (q.kind === "discursive" && responses[q.uid]?.self === "review")
      counts.selfReview++;
  }
  const denominator = counts.correct + counts.wrong + counts.blank;
  return {
    ...counts,
    denominator,
    percentage: denominator
      ? Math.round((100 * counts.correct) / denominator)
      : null,
  };
}
export function filterQuestions(questions, f = {}, progress = {}) {
  const query = normalize(f.query).trim();
  return questions.filter(
    (q) =>
      q.enabled !== false &&
      (!f.specialty || q.specialty === f.specialty) &&
      (!f.topic || q.topic === f.topic) &&
      (!f.kind ||
        f.kind === "all" ||
        (f.kind === "oral" ? q.oral : q.kind === f.kind)) &&
      (!f.keyOnly || Boolean(parseKey(q))) &&
      (!f.savedOnly || progress.favorites?.includes(q.uid)) &&
      (!f.errorsOnly || progress.items?.[q.uid]?.last === "wrong") &&
      (!query ||
        normalize(
          [
            q.id,
            q.topic,
            q.chapter,
            q.stem,
            q.context,
            ...q.options.map((o) => o.text),
          ].join(" "),
        ).includes(query)),
  );
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function effectiveQuestion(q, editions) {
  const edit = editions.questions[q.uid];
  if (!edit) return q;
  return {
    ...q,
    answer: edit.answer,
    comment: edit.comment,
    enabled: edit.enabled,
    reviewed: edit.reviewed,
    answerOrigin: "Gabarito / comentário atualizado pelo administrador",
    editedAt: edit.updatedAt,
  };
}
export function validateEdit(q, input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Edição inválida.");
  const answer =
    input.answer == null || input.answer === ""
      ? null
      : String(input.answer).trim();
  if (answer && answer.length > 20000)
    throw new Error("Resposta longa demais.");
  if (typeof input.comment !== "string" || input.comment.length > 30000)
    throw new Error("Comentário inválido.");
  if (typeof input.enabled !== "boolean" || typeof input.reviewed !== "boolean")
    throw new Error("Estado da edição inválido.");
  const edit = {
    answer: q.kind === "objective" && answer ? answer.toUpperCase() : answer,
    comment: input.comment,
    enabled: input.enabled,
    reviewed: input.reviewed,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
  };
  if (
    q.kind === "objective" &&
    answer &&
    !parseKey({ ...q, ...edit, keyConflict: "" })
  ) {
    throw new Error(
      q.format === "true-false"
        ? `Informe ${q.options.length} valores V/F, na ordem das afirmações.`
        : "Use uma letra que exista nas alternativas; deixe vazio para retirar o gabarito.",
    );
  }
  return edit;
}
export function validateEditions(value, questions) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !value.questions ||
    typeof value.questions !== "object" ||
    Array.isArray(value.questions)
  )
    throw new Error("Formato do arquivo de edições inválido.");
  const lookup = new Map(questions.map((q) => [q.uid, q]));
  const records = {};
  for (const [uid, edit] of Object.entries(value.questions)) {
    if (!lookup.has(uid))
      throw new Error(`A edição ${uid} não pertence ao banco atual.`);
    records[uid] = validateEdit(lookup.get(uid), edit);
  }
  return {
    schemaVersion: 1,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    questions: records,
  };
}
const stable = (x) =>
  x && typeof x === "object"
    ? JSON.stringify(
        Object.keys(x)
          .sort()
          .map((k) => [k, stable(x[k])]),
      )
    : JSON.stringify(x);
export function mergeDrafts(remote, drafts) {
  const merged = { ...remote.questions };
  for (const [uid, draft] of Object.entries(drafts)) {
    if (stable(remote.questions[uid] || null) !== stable(draft.base || null)) {
      throw new Error(
        `Conflito na questão ${uid}: outro administrador alterou esse item. Recarregue e revise seu rascunho.`,
      );
    }
    merged[uid] = draft.next;
  }
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    questions: merged,
  };
}
export const encodeBase64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
export const decodeBase64 = (str) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(str.replace(/\s/g, "")), (c) => c.charCodeAt(0)),
  );
export function inferRepository(location, config = {}) {
  if (config.owner && config.repo)
    return { ...config, branch: config.branch || "main" };
  if (location.hostname.endsWith(".github.io")) {
    const owner = location.hostname.slice(0, -10);
    const repo = decodeURIComponent(
      location.pathname.split("/").filter(Boolean)[0] || `${owner}.github.io`,
    );
    return { owner, repo, branch: config.branch || "main" };
  }
  return {
    owner: config.owner || "PrepMedInsano",
    repo: config.repo || "prepmed-insano",
    branch: config.branch || "main",
  };
}
