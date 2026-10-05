import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  grade,
  score,
  filterQuestions,
  parseKey,
  validateEdit,
  validateEditions,
  mergeDrafts,
  emptyEditions,
  effectiveQuestion,
  encodeBase64,
  decodeBase64,
  escapeHTML,
  inferRepository,
  shuffle,
  isImagePath,
} from "../js/core.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(root, "data/manifest.json"), "utf8"),
);
const bank = (
  await Promise.all(
    manifest.specialties.map((s) =>
      readFile(path.join(root, "data", s.file), "utf8").then(JSON.parse),
    ),
  )
).flat();
const q = bank.find((q) => q.id === "END020");
const edit = {
  answer: "A",
  comment: "Comentário atualizado",
  enabled: true,
  reviewed: true,
  updatedAt: "2026-10-04T00:00:00Z",
};

test("O banco completo corresponde ao manifesto, com IDs únicos, fontes e imagens locais", async () => {
  assert.ok(bank.length > 0);
  assert.equal(manifest.total, bank.length);
  assert.equal(new Set(bank.map((q) => q.uid)).size, bank.length);
  assert.equal(new Set(bank.map((q) => q.id)).size, bank.length);
  assert.equal(
    bank.filter((q) => q.kind === "objective").length,
    manifest.objective,
  );
  assert.equal(
    bank.filter((q) => q.kind === "discursive").length,
    manifest.discursive,
  );
  for (const { id, count } of manifest.specialties)
    assert.equal(bank.filter((q) => q.specialty === id).length, count);
  const images = new Set();
  for (const q of bank) {
    assert.ok(q.stem.trim(), q.id);
    assert.ok(q.origins.length, q.id);
    assert.ok(q.topic);
    if (q.oral) {
      assert.equal(q.kind, "discursive");
      assert.ok(q.chapter, q.id);
    }
    for (const img of [...q.images, ...q.answerImages]) {
      assert.ok(isImagePath(img), img);
      images.add(img);
      await access(path.join(root, img));
    }
    if (q.kind === "objective") assert.ok(q.options.length >= 2, q.id);
  }
  assert.equal(images.size, manifest.imageCount);
});
test("Corretas, erradas e em branco usam o gabarito; ausentes e divergentes não são pontuadas", () => {
  assert.deepEqual(parseKey(q), ["B"]);
  assert.equal(grade(q, { value: ["B"] }), "correct");
  assert.equal(grade(q, { value: ["A"] }), "wrong");
  assert.equal(grade(q, { value: [] }), "blank");
  assert.equal(grade({ ...q, answer: null }, { value: ["A"] }), "pending");
  assert.equal(
    grade({ ...q, keyConflict: "Divergência" }, { value: ["B"] }),
    "review",
  );
  assert.equal(
    grade(
      { ...q, keyConflict: "Divergência", reviewed: true },
      { value: ["B"] },
    ),
    "correct",
  );
  for (const id of ["ORL007", "ORL011"])
    assert.equal(parseKey(bank.find((x) => x.id === id)), null);
});
test("V/F mantém a ordem das afirmações, sem tratar a sequência como uma alternativa", () => {
  const vf = bank.find((x) => x.id === "ORL097");
  assert.equal(vf.format, "true-false");
  assert.equal(vf.options.length, 4);
  assert.equal(grade(vf, { value: ["F", "F", "V", "V"] }), "correct");
  assert.equal(grade(vf, { value: ["V", "F", "V", "V"] }), "wrong");
  assert.equal(parseKey({ ...vf, answer: "F,V" }), null);
});
test("A nota exclui discursivas e itens sem gabarito; branco com gabarito permanece no denominador", () => {
  const d = bank.find((x) => x.kind === "discursive"),
    pending = { ...q, uid: "sem", answer: null },
    blank = { ...q, uid: "branco" };
  const s = score([q, d, pending, blank], {
    [q.uid]: { value: ["B"] },
    [d.uid]: { value: "Minha resposta", self: "good" },
    sem: { value: ["A"] },
  });
  assert.equal(s.percentage, 50);
  assert.equal(s.denominator, 2);
  assert.equal(s.pending, 1);
  assert.equal(s.written, 1);
  assert.equal(s.selfGood, 1);
  assert.equal(score([d, pending], {}).percentage, null);
});
test("Filtros combinam especialidade, assunto, oral, busca sem acentos, favoritos e erros", () => {
  assert.deepEqual(
    filterQuestions(bank, { query: "END020" }).map((x) => x.uid),
    [q.uid],
  );
  assert.ok(
    filterQuestions(bank, { kind: "oral" }).every((x) => x.oral && x.chapter),
  );
  assert.ok(
    filterQuestions(bank, {
      specialty: "endocrino",
      topic: "Diabetes e insulinoterapia",
      kind: "objective",
    }).length > 0,
  );
  assert.ok(filterQuestions(bank, { query: "cornea" }).length > 0);
  assert.equal(
    filterQuestions([q], { savedOnly: true }, { favorites: [q.uid] }).length,
    1,
  );
  assert.equal(
    filterQuestions(
      [q],
      { errorsOnly: true },
      { items: { [q.uid]: { last: "wrong" } } },
    ).length,
    1,
  );
  assert.equal(filterQuestions([{ ...q, enabled: false }], {}).length, 0);
});
test("Edições são validadas; rascunhos não alteram a questão antes de serem publicados", () => {
  const record = validateEdit(q, edit);
  assert.equal(effectiveQuestion(q, emptyEditions()).answer, "B");
  assert.equal(
    effectiveQuestion(q, { questions: { [q.uid]: record } }).answer,
    "A",
  );
  assert.throws(() => validateEdit(q, { ...edit, answer: "Z" }));
  assert.throws(() => validateEdit(q, { ...edit, comment: 12 }));
  assert.throws(() =>
    validateEditions(
      { schemaVersion: 1, questions: { desconhecida: edit } },
      bank,
    ),
  );
  assert.throws(() =>
    validateEditions({ schemaVersion: 2, questions: {} }, bank),
  );
});
test("Publicação preserva alterações de outras questões e bloqueia concorrência no mesmo item", () => {
  const remote = {
    schemaVersion: 1,
    questions: { outra: { ...edit, answer: "D" } },
  };
  const result = mergeDrafts(remote, { [q.uid]: { base: null, next: edit } });
  assert.deepEqual(result.questions.outra, remote.questions.outra);
  assert.deepEqual(result.questions[q.uid], edit);
  assert.throws(
    () =>
      mergeDrafts(
        { questions: { [q.uid]: { ...edit, answer: "C" } } },
        { [q.uid]: { base: null, next: edit } },
      ),
    /Conflito/,
  );
  assert.throws(
    () =>
      mergeDrafts(
        {
          questions: {
            [q.uid]: { ...edit, comment: "Atualização concorrente" },
          },
        },
        { [q.uid]: { base: edit, next: { ...edit, answer: "C" } } },
      ),
    /Conflito/,
  );
});
test("Base64 preserva acentos, símbolos e texto extenso; textos HTML são escapados", () => {
  const value = "Hipófise 🧠 — 6,8% <texto>\n".repeat(10000);
  assert.equal(decodeBase64(encodeBase64(value)), value);
  assert.equal(
    escapeHTML('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
  assert.equal(isImagePath("javascript:alert(1)"), false);
});
test("O repositório é inferido em Pages de projeto e Pages da conta; embaralhar preserva todos os itens", () => {
  assert.deepEqual(
    inferRepository({
      hostname: "prepmedinsano.github.io",
      pathname: "/prepmed-insano/",
    }),
    { owner: "prepmedinsano", repo: "prepmed-insano", branch: "main" },
  );
  assert.equal(
    inferRepository({ hostname: "prepmedinsano.github.io", pathname: "/" })
      .repo,
    "prepmedinsano.github.io",
  );
  const out = shuffle([1, 2, 3, 4], () => 0.1);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4]);
});
