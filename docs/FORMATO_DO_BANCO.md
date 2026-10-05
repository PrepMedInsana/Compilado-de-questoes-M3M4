# Formato das questões

O site lê os JSONs de `data/`. Cada banco é um array de questões. Preserve os IDs existentes: `uid` identifica o item nas edições e no histórico, e `id` é o código apresentado ao estudante.

Exemplo de uma nova questão objetiva:

```json
{
  "uid": "nova-endocrino-001",
  "id": "END132",
  "specialty": "endocrino",
  "kind": "objective",
  "format": "single",
  "topic": "Tireoide",
  "chapter": "",
  "oral": false,
  "stem": "Digite o enunciado completo aqui.",
  "context": "",
  "options": [
    { "label": "A", "text": "Primeira alternativa." },
    { "label": "B", "text": "Segunda alternativa." },
    { "label": "C", "text": "Terceira alternativa." },
    { "label": "D", "text": "Quarta alternativa." }
  ],
  "images": [],
  "answer": null,
  "comment": "",
  "answerOrigin": "",
  "answerImages": [],
  "related": [],
  "reviewNote": "",
  "reviewCodes": [],
  "keyConflict": "",
  "reconstructed": false,
  "origins": [
    {
      "source": "NOVA01",
      "original": "1",
      "file": "Nome da prova de origem",
      "pages": [1]
    }
  ],
  "enabled": true
}
```

| Campo          | Valores / finalidade                                        |
| -------------- | ----------------------------------------------------------- |
| `specialty`    | `neuro`, `endocrino`, `otorrino`, `oftalmo`                 |
| `kind`         | `objective` ou `discursive`                                 |
| `format`       | `single`, `multiple`, `true-false` ou `written`             |
| `topic`        | Assunto usado nos filtros e cartões                         |
| `chapter`      | Tema maior das provas orais, quando houver                  |
| `oral`         | `true` para item de prova oral                              |
| `answer`       | Letra, sequência V/F, texto de referência ou `null`         |
| `comment`      | Comentário adicional, em texto simples                      |
| `images`       | Imagens do enunciado                                        |
| `answerImages` | Imagens reveladas apenas na resposta                        |
| `related`      | UIDs de respostas relacionadas, acessíveis na revisão       |
| `keyConflict`  | Divergência que impede pontuação até revisão administrativa |
| `origins`      | Identificação da fonte                                      |

Para discursivas, use `kind: "discursive"`, `format: "written"` e `options: []`. A resposta de referência fica em `answer`; o comentário adicional fica em `comment`. Na prova oral, use `oral: true`, com o tema maior em `chapter` e o subtema em `topic`.

Para V/F, cada objeto de `options` é uma afirmação, e `answer` contém a sequência, por exemplo `V, F, V, F`. Para enunciados que realmente exigem múltipla seleção, use `format: "multiple"` e um gabarito como `A / C`.

Imagens devem estar em `assets/questions/`. Use nomes com letras, números, hífen ou sublinhado, sem espaços; formatos suportados: PNG, JPG, JPEG e WebP. Exemplo: `assets/questions/caso_001.png`. A importação automática cria nomes únicos e copia os arquivos.

Após adicionar questões ou imagens, atualize `total`, `objective`, `discursive`, `imageCount` e o `count` da especialidade em `data/manifest.json`. Execute `npm test` antes de enviar as alterações. O importador faz esse trabalho automaticamente ao converter o banco compilado.

Para corrigir apenas um gabarito, prefira o painel administrativo: ele mantém a fonte original e grava a revisão em `data/edicoes.json`.
