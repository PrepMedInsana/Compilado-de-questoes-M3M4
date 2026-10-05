# PrepMed Insano

Banco de questões dos rodízios M3 e M4, preparado para GitHub Pages. A interface usa laranja e branco e funciona em computador e celular.

**O banco já está integrado: 1.343 itens, sendo 586 objetivos e 757 discursivos, com 39 imagens preservadas.**

| Especialidade                          | Itens |
| -------------------------------------- | ----: |
| Neuroclínica e neurocirurgia           |   929 |
| Endocrinologia                         |   131 |
| Otorrino, cabeça e pescoço e Patologia |   196 |
| Oftalmologia                           |    87 |

## O que o site faz

- Filtra especialidade, assunto, formato e palavras-chave ou código da questão.
- Permite iniciar um treino pelos filtros ou pelos cartões de assuntos.
- Separa objetivas, discursivas e prova oral. A prova oral de neuro mantém temas e subtemas.
- Oferece correção após cada questão ou somente ao finalizar o treino.
- Permite escolher a quantidade de questões e embaralhar a ordem.
- Corrige alternativas e sequências V/F; mostra a origem do gabarito e os comentários.
- Preserva imagens nos enunciados e nas respostas, com ampliação.
- Salva favoritos, sessão em andamento e histórico neste navegador.
- Permite refazer erros e comparar discursivas com o comentário de referência.
- Tem painel administrativo para revisar gabaritos, escrever comentários e ativar/desativar questões.

## Publicar no GitHub Pages

O passo a passo curto está em [PUBLICAR.md](PUBLICAR.md).

1. Crie um repositório, por exemplo `prepmed-insano`, na sua conta.
2. Coloque **o conteúdo desta pasta** na raiz do repositório. `index.html` deve ficar na raiz, e a pasta `.github` também deve ser enviada.
3. Use a branch `main`.
4. Abra **Settings → Pages → Build and deployment → Source → GitHub Actions**.
5. Na aba **Actions**, acompanhe o fluxo **Publicar PrepMed Insano**. Após concluir, o endereço aparece em Settings → Pages.

O fluxo testa o projeto, prepara `dist/` e publica o site. Os caminhos são relativos, portanto funciona tanto em uma página de projeto quanto na página da conta. As edições de gabaritos disparam esse mesmo fluxo.

Documentação oficial: [fluxos personalizados do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Editar os gabaritos e comentários pelo painel

Entre em **Administração**. Busque uma questão pelo código, por assunto ou por uma palavra do enunciado.

Nas objetivas, informe a letra correta; para V/F, informe a sequência inteira, como `F, F, V, V`. Um campo vazio retira o gabarito. Nas discursivas, escreva a resposta de referência e, se quiser, um comentário adicional. Os campos aceitam texto simples com quebras de linha.

**Salvar rascunho** guarda a alteração apenas no editor deste navegador. O treino continua usando a versão publicada. Para disponibilizar a alteração aos colegas, escolha uma das opções:

### Publicar diretamente no GitHub

1. No GitHub, abra **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Escolha somente o repositório do site e habilite **Repository permissions → Contents → Read and write**. Defina uma expiração.
3. No painel do site, confira usuário, repositório e branch; informe o token e clique em **Conectar ao GitHub**.
4. Salve as alterações como rascunho e clique em **Publicar alterações**. Confirme o repositório e a quantidade de itens.
5. Aguarde o fluxo de publicação na aba Actions do GitHub. A atualização passa a valer para todos quando o Pages for atualizado.

O site é estático: a autorização real de escrita vem das permissões do GitHub. Abrir o painel não permite alterar o repositório de outra pessoa. O token fica somente na memória da aba; não é gravado em arquivos nem no armazenamento do navegador. Ao desconectar ou sair da página, ele é descartado.

O editor modifica apenas `data/edicoes.json`, preserva as outras questões e usa o SHA do arquivo para impedir sobrescritas concorrentes. Se outro administrador alterar o mesmo item, a publicação é interrompida e o rascunho é preservado. Recarregue as edições publicadas, descarte o rascunho desse item e reaplique a alteração após comparar o conteúdo.

Documentação oficial: [API de conteúdo dos repositórios](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28) e [tokens pessoais](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

### Publicar um arquivo manualmente

Use **Baixar edicoes.json** e substitua o arquivo de mesmo nome na pasta `data/` do repositório. Antes de exportar, confira se a versão publicada no editor é a mais recente, especialmente se houver mais de um administrador. O próximo fluxo do GitHub Pages disponibilizará as edições.

Se o site estiver em um domínio próprio, ou o repositório usar outra branch, ajuste `site.config.json`:

```json
{
  "github": {
    "owner": "SEU_USUARIO",
    "repo": "prepmed-insano",
    "branch": "main"
  }
}
```

Em `github.io`, o usuário e o repositório são inferidos do endereço quando esses campos estão vazios. Para outra branch, ajuste também `.github/workflows/pages.yml`.

## Como as respostas são avaliadas

- Objetivas com uma alternativa válida: acerto/erro pelo gabarito publicado.
- V/F: a sequência precisa coincidir inteira, na ordem das afirmações.
- Questões sem gabarito ou com divergência explícita: são itens de estudo e ficam fora da nota automática.
- Marcação de várias alternativas em um enunciado de resposta única: aguarda revisão, sem assumir que todas são corretas.
- Objetiva em branco com gabarito válido: entra no denominador da nota, como não respondida.
- Discursivas e orais: comparação com a resposta/comentário e autoavaliação; não recebem correção automática do texto.

Marcar **Gabarito revisado por mim** permite usar a resposta definida por você em itens com divergências antigas. A origem do gabarito e as notas da fonte continuam disponíveis na revisão.

No modo de correção ao final, os gabaritos ficam ocultos na interface até a conclusão. Como este é um site público de treinamento, os dados podem ser consultados nos arquivos do repositório.

## Atualizar o banco de questões

Os quatro bancos estão em `data/neuro.json`, `data/endocrino.json`, `data/otorrino.json` e `data/oftalmo.json`. Fontes e notas ficam em `data/manifest.json`; quadros antigos sem enunciados correspondentes foram preservados em `data/gabaritos-originais.json`.

Para converter uma versão atualizada do banco compilado usado nos documentos:

```bash
python scripts/import-bank.py CAMINHO/work/final_bank_numbered.json --source-root CAMINHO
```

`CAMINHO` é a pasta que contém o banco extraído e suas imagens em `work/`. A conversão atualiza os quatro arquivos e o manifesto, copia as imagens e **preserva `data/edicoes.json`**. Mantenha os mesmos `uid` para preservar favoritos, histórico e edições existentes.

Para incluir questões manualmente, veja [docs/FORMATO_DO_BANCO.md](docs/FORMATO_DO_BANCO.md). Atualize também os totais do manifesto. Gabaritos e comentários editados pelo painel ficam separados das fontes originais.

## Rodar localmente

Instale Node.js 22 ou superior e, dentro desta pasta, execute:

```bash
npm ci
npm test
npm start
```

Abra `http://localhost:4173`. Para preparar os arquivos públicos, execute `npm run build`; eles ficam em `dist/`. Também é possível servir a pasta com `python -m http.server 8000`.

Não abra `index.html` com duplo clique: os JSONs precisam ser carregados por HTTP. O site publicado não depende de Node.js, servidor próprio, serviços pagos ou bibliotecas externas carregadas por CDN. `happy-dom` é usado apenas nos testes de desenvolvimento.

## Validação

Os testes verificam dados, imagens, filtros, notas, V/F, autoavaliação, ambos os modos de treino, edição, permissões, preservação de rascunhos, conflitos de publicação e leitura de arquivos grandes. Testes de interface usam DOM simulado, com respostas da API do GitHub simuladas, sem publicar alterações reais. O CSS possui regras para computador e celular e respeita redução de movimento.

A prévia visual em um navegador real não pôde ser aberta no ambiente de geração. Confira o resultado com `npm start` antes de publicar. Os fluxos de GitHub foram validados com testes isolados; a conta real será configurada por você.

## Estrutura

```text
index.html                  Página principal
styles.css                  Tema laranja e branco e regras responsivas
js/app.js                   Filtros, sessões, revisão, progresso e editor
js/core.js                  Regras de filtro, validação e correção
js/github.js                Autenticação e publicação das edições
data/                       Bancos, manifesto, fontes e gabaritos
assets/questions/           Imagens das questões e das respostas
scripts/                    Servidor local, build e importação
tests/                      Testes de lógica, dados e interface
.github/workflows/pages.yml Publicação no GitHub Pages
```
