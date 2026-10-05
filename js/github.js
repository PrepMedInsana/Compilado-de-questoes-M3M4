import {
  encodeBase64,
  decodeBase64,
  validateEditions,
  mergeDrafts,
} from "./core.js";

export class GitHubEditor {
  constructor(fetcher = globalThis.fetch) {
    this.fetcher = fetcher;
    this.token = null;
    this.config = null;
  }
  async request(endpoint, options = {}, raw = false) {
    const response = await this.fetcher("https://api.github.com" + endpoint, {
      ...options,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${this.token}`,
        ...options.headers,
      },
    });
    if (!response.ok) {
      const reasons = {
        401: "Token inválido ou expirado.",
        403: "Sem permissão para esta operação. Verifique Contents: Read and write e o repositório selecionado no token.",
        404: "Repositório, branch ou arquivo de edições não encontrado. Confira a configuração.",
        409: "O arquivo foi atualizado durante a publicação. Suas alterações continuam como rascunho; recarregue e revise antes de publicar.",
        422: "O GitHub recusou a alteração. Verifique a branch, o tamanho do arquivo e as regras do repositório.",
      };
      throw new Error(
        reasons[response.status] ||
          `Não foi possível acessar o GitHub (${response.status}).`,
      );
    }
    return raw ? response.text() : response.json();
  }
  get prefix() {
    return `/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}`;
  }
  async connect(config, token, questions) {
    if (
      !/^[\w.-]+$/.test(config.owner) ||
      !/^[\w.-]+$/.test(config.repo) ||
      !config.branch.trim()
    )
      throw new Error("Preencha usuário, repositório e branch corretamente.");
    this.config = { ...config };
    this.token = token.trim();
    if (!this.token) throw new Error("Informe seu token do GitHub.");
    try {
      const user = await this.request("/user");
      const repo = await this.request(this.prefix);
      if (
        repo.permissions &&
        !(
          repo.permissions.push ||
          repo.permissions.admin ||
          repo.permissions.maintain
        )
      )
        throw new Error(
          "Sua conta não tem permissão de escrita neste repositório.",
        );
      const file = await this.read(questions);
      this.user = user.login;
      return { user: user.login, ...file };
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }
  async read(questions) {
    const endpoint = `${this.prefix}/contents/data/edicoes.json?ref=${encodeURIComponent(this.config.branch)}`;
    const file = await this.request(endpoint, {
      headers: { Accept: "application/vnd.github.object+json" },
    });
    if (!file.sha) throw new Error("Arquivo de edições inválido.");
    let content;
    if (
      file.encoding === "base64" &&
      typeof file.content === "string" &&
      file.content.length
    )
      content = decodeBase64(file.content);
    else if (file.encoding === "none")
      content = await this.request(
        endpoint,
        { headers: { Accept: "application/vnd.github.raw+json" } },
        true,
      );
    else throw new Error("Formato do arquivo de edições inválido.");
    return {
      editions: validateEditions(JSON.parse(content), questions),
      sha: file.sha,
    };
  }
  async publish(drafts, questions) {
    if (!this.token) throw new Error("Conecte-se ao GitHub para publicar.");
    if (!Object.keys(drafts).length)
      throw new Error("Não há rascunhos para publicar.");
    const remote = await this.read(questions);
    const editions = validateEditions(
      mergeDrafts(remote.editions, drafts),
      questions,
    );
    const result = await this.request(
      `${this.prefix}/contents/data/edicoes.json`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Atualiza gabaritos e comentários (${Object.keys(drafts).length} itens)`,
          content: encodeBase64(JSON.stringify(editions, null, 2) + "\n"),
          sha: remote.sha,
          branch: this.config.branch,
        }),
      },
    );
    return { editions, commit: result.commit?.html_url || null };
  }
  disconnect() {
    this.token = null;
    this.config = null;
    this.user = null;
  }
}
