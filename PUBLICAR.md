# Colocar o PrepMed Insano no ar

O código e as **1.343 questões** já estão prontos neste pacote.

1. **Extraia o ZIP.** Abra a pasta `PrepMed_Insano`.
2. **Crie um repositório no GitHub.** Sugestão de nome: `prepmed-insano`. Na conta gratuita, use um repositório público para disponibilizar pelo Pages.
3. **Envie o conteúdo da pasta.** `index.html`, `styles.css`, `package.json`, `package-lock.json`, `site.config.json`, as pastas `assets`, `data`, `js`, `scripts`, `tests` e `.github` devem ficar na raiz. Não envie `node_modules` nem `dist`.
4. **Ative o Pages.** No repositório, vá a **Settings → Pages → Build and deployment → Source** e escolha **GitHub Actions**. Use a branch `main`.
5. **Acompanhe a publicação.** Abra **Actions → Publicar PrepMed Insano**. Quando estiver verde, volte a **Settings → Pages** e abra o endereço do site.

Caso tenha enviado os arquivos antes de ativar o Pages, abra o fluxo em **Actions** e use **Run workflow**, na branch `main`.

Se a pasta `.github` não tiver sido enviada, crie `.github/workflows/pages.yml` pelo botão **Add file → Create new file** e copie o conteúdo desse arquivo do pacote.

Para conferir no computador antes de publicar, instale Node.js 22 ou superior, abra um terminal nesta pasta e rode:

```bash
npm ci
npm test
npm start
```

Abra `http://localhost:4173`. O site usa laranja e branco e adapta a interface ao tamanho da tela.

## Alterar respostas depois

No site, abra **Administração**, localize a questão, edite a resposta ou o comentário e clique em **Salvar rascunho**.

- **Com token do GitHub:** conecte o painel ao repositório e use **Publicar alterações**. O token deve ter acesso somente a esse repositório, com **Contents: Read and write**.
- **Sem token:** use **Baixar edicoes.json** e substitua `data/edicoes.json` no GitHub.

Os rascunhos ficam apenas no editor. As edições entram no treino público depois da publicação. O [README.md](README.md) explica a criação do token, a manutenção do banco e as regras de pontuação.

Documentação oficial: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
