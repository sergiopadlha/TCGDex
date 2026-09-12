# TCGdex — Catálogo de Cartas

Site estático (HTML + CSS + JS puro, sem build) que consome a API pública
[TCGdex](https://tcgdex.dev/pt-br) e lista as cartas com todos os filtros suportados.

## Como rodar

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tcgdex-site/serve.ps1
```

Depois abra <http://localhost:8765>. (A API envia `Access-Control-Allow-Origin: *`,
então abrir o `index.html` direto pelo `file://` também funciona na maioria dos navegadores.)

## Funcionalidades

- Listagem em grade com imagens (`.../low.webp`) e detalhe da carta em modal (`.../high.webp`).
- Idioma: pt, en, fr, es, it, de — troca o prefixo do endpoint (`/v2/{lang}/...`).
- Paginação (`pagination:page`, `pagination:itemsPerPage`) e ordenação (`sort:field`, `sort:order`).

### Filtros implementados

| Campo | Parâmetro | Operador usado |
|---|---|---|
| Nome, ID, nº no set, ilustrador | `name`, `id`, `localId`, `illustrator` | match parcial (padrão) |
| Categoria, tipo, raridade, estágio, sufixo, tipo de treinador, tipo de energia, marca de regulação | `category`, `types`, `rarity`, `stage`, `suffix`, `trainerType`, `energyType`, `regulationMark` | `eq:` |
| Pokédex nacional | `dexId` | `eq:` |
| HP mínimo/máximo | `hp` (repetido) | `gte:` + `lte:` |
| Recuo máximo | `retreat` | `lte:` |
| Set (multisseleção) | `set` | `eq:a\|b\|c` |
| Série (multisseleção) | `set` com todos os sets das séries escolhidas | `eq:a\|b\|c` |

Série e set são listas de seleção múltipla (Ctrl/Shift). Escolher séries filtra a lista de sets
em cascata; se nenhum set estiver marcado, a busca usa todos os sets das séries selecionadas.
Sets marcados têm precedência sobre a série.

As opções dos selects são carregadas dos endpoints de enum da própria API
(`/types`, `/rarities`, `/categories`, `/stages`, `/suffixes`, `/trainer-types`,
`/energy-types`, `/regulation-marks`, `/series`, `/sets`), então acompanham o idioma escolhido.

## Limitações conhecidas da API (contornadas no código)

- **Acentos quebram o `eq:`**: a API não decodifica os bytes UTF-8 do query string,
  então `types=eq:Água` retorna vazio. Para valores acentuados o app cai para match
  parcial no maior trecho sem acento do valor (`Água` → `gua`, `Estágio 1` → `gio 1`).
  Ver `enumFilterValue()` em `app.js`.
- **Intervalo numérico** precisa de parâmetros repetidos (`hp=gte:100&hp=lte:150`);
  o formato com pipe (`hp=gte:100|lte:150`) retorna vazio.
- **Sem total de resultados**: a resposta não traz cabeçalho de contagem, então o
  botão "Próxima" é habilitado quando a página veio cheia.
- **Ordenação** só é confiável por campos presentes no `CardBrief` (`name`, `id`, `localId`);
  por isso as demais opções não foram expostas.
- O filtro "apenas cartas com imagem" é aplicado no cliente (a API não expõe esse filtro).
