import test from "node:test";
import assert from "node:assert/strict";
import { GitHubEditor } from "../js/github.js";
import { encodeBase64, decodeBase64, emptyEditions } from "../js/core.js";
const q = {
  uid: "uma",
  kind: "objective",
  format: "single",
  options: [{ label: "A" }, { label: "B" }],
};
const edit = {
  answer: "A",
  comment: "Comentário com ação 🧠",
  enabled: true,
  reviewed: true,
  updatedAt: null,
};
const config = {
  owner: "PrepMedInsano",
  repo: "prepmed-insano",
  branch: "main",
};
test("O painel autentica e publica somente edicoes.json, com SHA e branch; token não entra no arquivo", async () => {
  const requests = [];
  const fake = async (url, opts) => {
    requests.push([url, opts]);
    if (url.endsWith("/user")) return Response.json({ login: "PrepMedInsano" });
    if (url.endsWith("/repos/PrepMedInsano/prepmed-insano"))
      return Response.json({ permissions: { push: true } });
    if (opts.method === "PUT")
      return Response.json({
        commit: {
          html_url:
            "https://github.com/PrepMedInsano/prepmed-insano/commit/fake",
        },
      });
    return Response.json({
      encoding: "base64",
      sha: "sha-original",
      content: encodeBase64(JSON.stringify(emptyEditions())),
    });
  };
  const client = new GitHubEditor(fake);
  await client.connect(config, "token-de-teste", [q]);
  const result = await client.publish({ uma: { base: null, next: edit } }, [q]);
  const [url, options] = requests.find(([, opts]) => opts.method === "PUT");
  assert.ok(url.endsWith("/contents/data/edicoes.json"));
  const body = JSON.parse(options.body);
  assert.equal(body.sha, "sha-original");
  assert.equal(body.branch, "main");
  const decoded = decodeBase64(body.content);
  assert.ok(decoded.includes("ação 🧠"));
  assert.ok(!decoded.includes("token-de-teste"));
  assert.equal(result.editions.questions.uma.answer, "A");
  client.disconnect();
  assert.equal(client.token, null);
});
test("Permissão insuficiente bloqueia conexão e descarta o token", async () => {
  const client = new GitHubEditor(async (url) =>
    Response.json(
      url.endsWith("/user")
        ? { login: "visitante" }
        : { permissions: { push: false } },
    ),
  );
  await assert.rejects(() => client.connect(config, "token", [q]), /permissão/);
  assert.equal(client.token, null);
});
test("Conflitos HTTP 409 preservam o rascunho e não são repetidos automaticamente", async () => {
  let writes = 0;
  const client = new GitHubEditor(async (url, opts) => {
    if (opts.method === "PUT") {
      writes++;
      return Response.json({}, { status: 409 });
    }
    if (url.endsWith("/user")) return Response.json({ login: "dono" });
    if (url.endsWith("/repos/PrepMedInsano/prepmed-insano"))
      return Response.json({ permissions: { push: true } });
    return Response.json({
      encoding: "base64",
      sha: "original",
      content: encodeBase64(JSON.stringify(emptyEditions())),
    });
  });
  await client.connect(config, "token", [q]);
  const drafts = { uma: { base: null, next: edit } };
  await assert.rejects(() => client.publish(drafts, [q]), /atualizado/);
  assert.equal(writes, 1);
  assert.equal(drafts.uma.next.answer, "A");
});
test("Arquivos maiores que 1 MB usam a leitura raw da API, mantendo o SHA da edição", async () => {
  let rawReads = 0;
  const client = new GitHubEditor(async (url, opts) => {
    if (opts.headers.Accept === "application/vnd.github.raw+json") {
      rawReads++;
      return new Response(
        JSON.stringify({ schemaVersion: 1, questions: { uma: edit } }),
      );
    }
    return Response.json({ encoding: "none", sha: "large-file", content: "" });
  });
  client.config = config;
  client.token = "token";
  const result = await client.read([q]);
  assert.equal(rawReads, 1);
  assert.equal(result.sha, "large-file");
  assert.equal(result.editions.questions.uma.answer, "A");
});
