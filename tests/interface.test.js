import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Window } from "happy-dom";
import { encodeBase64, decodeBase64, emptyEditions } from "../js/core.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = (await readFile(path.join(root, "index.html"), "utf8")).replace(
  /<script[^>]*>[\s\S]*?<\/script>/g,
  "",
);
const css = await readFile(path.join(root, "styles.css"), "utf8");
const fixtures = {};
for (const name of [
  "data/manifest.json",
  "data/neuro.json",
  "data/endocrino.json",
  "data/otorrino.json",
  "data/oftalmo.json",
  "data/edicoes.json",
  "site.config.json",
])
  fixtures[name] = await readFile(path.join(root, name), "utf8");
const modules = await Promise.all(
  ["core.js", "github.js", "app.js"].map(async (name) => {
    let text = await readFile(path.join(root, "js", name), "utf8");
    text = text.replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
    return name === "app.js" ? "const e=escapeHTML;\n" + text : text;
  }),
);
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  for (let i = 0; i < 6; i++)
    await new Promise((resolve) => setImmediate(resolve));
};

async function createApp(width = 1440) {
  const window = new Window({
    url: "http://localhost/prepmed-insano/",
    width,
    height: 960,
    // Evaluate only this repository's JavaScript. Question text is JSON, never executable code.
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
    },
  });
  const errors = [];
  window.addEventListener("error", (event) => errors.push(event.message));
  let remote = emptyEditions(),
    sha = "original",
    writes = 0;
  window.fetch = async (input, opts = {}) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com")) {
      if (url.endsWith("/user"))
        return Response.json({ login: "PrepMedInsano" });
      if (url.endsWith("/repos/PrepMedInsano/prepmed-insano"))
        return Response.json({ permissions: { push: true } });
      assert.ok(url.includes("/contents/data/edicoes.json"));
      if (opts.method === "PUT") {
        const body = JSON.parse(opts.body);
        assert.equal(body.sha, sha);
        remote = JSON.parse(decodeBase64(body.content));
        sha = "updated";
        writes++;
        return Response.json({
          commit: {
            html_url:
              "https://github.com/PrepMedInsano/prepmed-insano/commit/test",
          },
        });
      }
      return Response.json({
        encoding: "base64",
        sha,
        content: encodeBase64(JSON.stringify(remote)),
      });
    }
    const local = new URL(url, window.location.href).pathname.replace(
      /^\/prepmed-insano\//,
      "",
    );
    assert.ok(fixtures[local], local);
    return new Response(fixtures[local], { status: 200 });
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.document.write(html);
  const style = window.document.createElement("style");
  style.textContent = css;
  window.document.head.append(style);
  if (!window.HTMLDialogElement.prototype.showModal)
    window.HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
  if (!window.HTMLDialogElement.prototype.close)
    window.HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  window.eval("(()=>{" + modules.join("\n") + "})();");
  await tick();
  const doc = window.document;
  const one = (selector) => {
    const element = doc.querySelector(selector);
    assert.ok(element, `Elemento ausente: ${selector}`);
    return element;
  };
  const click = async (selector) => {
    one(selector).click();
    await tick();
  };
  const fill = async (selector, value, type = "input") => {
    const element = one(selector);
    element.value = value;
    element.dispatchEvent(new window.Event(type, { bubbles: true }));
    await tick();
  };
  const submit = async (selector) => {
    one(selector).dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
    await tick();
  };
  const route = async (hash) => {
    window.location.hash = hash;
    window.dispatchEvent(new window.HashChangeEvent("hashchange"));
    await tick();
  };
  const start = async (id, mode = "instant", kind = "objective") => {
    await route("");
    await fill("#specialty-filter", "");
    await fill(`[name=kind][value="${kind}"]`, kind, "change");
    one(`[name=kind][value="${kind}"]`).checked = true;
    await fill("[name=query]", id);
    await submit("#filter-form");
    one(`#setup-form [name=mode][value="${mode}"]`).checked = true;
    await submit("#setup-form");
    assert.ok(
      doc.querySelector(".question-card"),
      `hash=${window.location.hash}; saved=${window.localStorage.getItem("prepmed:session:v1")}; errors=${JSON.stringify(errors)}; main=${doc.querySelector("#main").textContent.slice(0, 160)}`,
    );
  };
  const finish = async () => {
    await click("[data-action=finish]");
    await click("[data-action=finish-confirmed]");
  };
  const cleanup = async () => window.happyDOM.close();
  return {
    window,
    doc,
    one,
    click,
    fill,
    submit,
    route,
    start,
    finish,
    cleanup,
    errors,
    get writes() {
      return writes;
    },
    get remote() {
      return remote;
    },
  };
}

test("Interface: filtrar, corrigir imediatamente, salvar favorito e consultar histórico", async () => {
  const app = await createApp();
  try {
    assert.ok(app.doc.querySelector(".hero"));
    assert.match(app.one(".hero-numbers").textContent, /1\.343/);
    assert.equal(
      app.window
        .getComputedStyle(app.one(".topic-grid"))
        .gridTemplateColumns.replace(/\s/g, ""),
      "repeat(3,1fr)",
    );
    await app.start("END020");
    await app.click("[name=choice][value=B]");
    await app.click("[data-action=confirm]");
    assert.match(app.one(".feedback-title").textContent, /Resposta correta/);
    await app.click("[data-action=favorite]");
    await app.finish();
    assert.match(app.one(".score-details h2").textContent, /1 de 1/);
    await app.route("#progresso");
    assert.match(app.one(".history-item").textContent, /100%/);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.cleanup();
  }
});
test("Interface: no modo final o gabarito fica oculto até finalizar; revisão é somente leitura", async () => {
  const app = await createApp();
  try {
    await app.start("END020", "final");
    await app.click("[name=choice][value=B]");
    assert.equal(app.doc.querySelector(".answer-block"), null);
    await app.click("[data-action=next]");
    assert.equal(app.doc.querySelector(".answer-block"), null);
    await app.click("[data-action=finish-confirmed]");
    assert.match(app.one(".score-details h2").textContent, /1 de 1/);
    await app.click("[data-action=review-all]");
    assert.ok(app.one("[name=choice]").disabled);
    assert.match(app.one(".feedback-title").textContent, /Resposta correta/);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.cleanup();
  }
});
test("Interface: prova oral preserva temas, comentário e autoavaliação separada da nota", async () => {
  const app = await createApp(390);
  try {
    assert.equal(app.window.matchMedia("(max-width:470px)").matches, true);
    assert.equal(
      app.window.getComputedStyle(app.one(".topic-grid")).gridTemplateColumns,
      "1fr",
    );
    await app.start("NEU788", "instant", "oral");
    await app.fill(
      "#written-answer",
      'TC e RM. <img src=x onerror="alert(1)">',
    );
    await app.click("[data-action=confirm]");
    assert.match(app.one(".answer-block").textContent, /TC inicialmente/);
    await app.click("[data-action=self-good]");
    await app.finish();
    assert.match(app.one(".self-summary").textContent, /1 consegui responder/);
    assert.match(app.one(".score-details h2").textContent, /autoavaliação/);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.cleanup();
  }
});
test("Interface: sequência V/F pode ser respondida e corrigida", async () => {
  const app = await createApp();
  try {
    await app.start("ORL097");
    for (const [index, value] of ["F", "F", "V", "V"].entries())
      await app.click(`[data-vf="${index}"][value="${value}"]`);
    await app.click("[data-action=confirm]");
    assert.match(app.one(".feedback-title").textContent, /Resposta correta/);
  } finally {
    await app.cleanup();
  }
});
test("Interface: rascunho não modifica o treino; publicação usa o GitHub e nunca armazena o token", async () => {
  const app = await createApp();
  try {
    await app.route("#admin");
    await app.fill("#admin-search", "END020");
    await app.fill("#edit-form [name=answer]", "A");
    await app.fill(
      "#edit-form [name=comment]",
      "Comentário de teste <script>alert(1)</script>",
    );
    app.one("#edit-form [name=reviewed]").checked = true;
    await app.submit("#edit-form");
    await app.start("END020");
    await app.click("[name=choice][value=B]");
    await app.click("[data-action=confirm]");
    assert.match(app.one(".feedback-title").textContent, /Resposta correta/);
    await app.route("#admin");
    await app.fill("#connect-form [name=token]", "token-de-teste-sem-validade");
    await app.submit("#connect-form");
    assert.ok(app.doc.querySelector(".connected"));
    await app.click("[data-action=publish]");
    await app.click("[data-action=publish-confirmed]");
    assert.equal(app.writes, 1);
    assert.equal(app.remote.questions.F72LASTdiabetes.answer, "A");
    assert.ok(
      !JSON.stringify(app.window.localStorage).includes(
        "token-de-teste-sem-validade",
      ),
    );
    await app.start("END020");
    await app.click("[name=choice][value=A]");
    await app.click("[data-action=confirm]");
    assert.match(app.one(".feedback-title").textContent, /Resposta correta/);
    assert.equal(app.doc.querySelector(".answer-comment script"), null);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.cleanup();
  }
});
