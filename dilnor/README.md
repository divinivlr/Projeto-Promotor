# Dilnor · Análise de Promotores & Rotas

Painel executivo 100% client-side (Next.js 15 App Router + Tailwind + Leaflet) para análise de promotores,
carteiras e rotas territoriais da **Dilnor Distribuidora**. Pronto para deploy na Vercel.

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # produção
```

Node 18.18+ (recomendado 20 ou 22).

## Deploy na Vercel

1. Suba esta pasta para um repositório Git (privado recomendado) e importe na Vercel — o Next.js é detectado sozinho.
   Alternativa: `npx vercel` dentro da pasta.
2. **Publicação online da base (para todos):**
   - Vercel → projeto → **Storage → Create → Blob** → conecte ao projeto (cria `BLOB_READ_WRITE_TOKEN`).
   - **Settings → Environment Variables** → `ADMIN_PASSWORD` = senha de quem pode publicar.
   - **Redeploy**.
3. (Opcional) `NEXT_PUBLIC_MAPS_PROVIDER=mapbox` e `NEXT_PUBLIC_MAPS_API_KEY=<token>` para camadas Mapbox.
4. **Privacidade:** a base contém CNPJs, endereços e faturamento. Ative *Deployment Protection* (senha) no projeto.

## Dados

- **Base vigente** (o que todos veem), nesta ordem:
  1. a última versão **publicada online** pela página *Atualizar Base* (Vercel Blob, via `/api/base`);
  2. senão, a base **embutida** no deploy: `public/data/base.json`.
- **Atualizar Base** (menu Dados): arraste o `Relatório Roteiro Promotor.xlsx` (abas *Relatório de Roteiros*, *Venda*, *302*).
  A leitura roda num Web Worker; o site mostra a comparação (promotores novos/atualizados/removidos, clientes, visitas, venda)
  antes de publicar. Modos:
  - **Incluir / atualizar promotores** — só os promotores da planilha entram ou são substituídos; os demais ficam;
  - **Substituir roteiro inteiro** — o roteiro passa a ser exatamente o da planilha.
  Depois: **Publicar para todos** (senha `ADMIN_PASSWORD`) ou **Aplicar só neste navegador** (teste).
  As 10 últimas publicações ficam no histórico e podem ser restauradas.
- Layouts aceitos do relatório de roteiros: coluna “Data Visita” (uma linha por visita) **ou** colunas Segunda…Sábado
  marcadas com “X” (layout 2026). Linhas de promotor sem cliente/dia = promotor sem roteiro.
- A proposta “Rota Nova” foi retirada do site; abas desse tipo são ignoradas.
- Para regenerar a base embutida: `npm run prepare-data -- "<Relatório Roteiro Promotor.xlsx>"`.

O mesmo código (`lib/extract.ts` → `lib/analyze.ts`) é usado no script e no navegador, então os números são idênticos.

## Regras de negócio

| Regra | Implementação |
|---|---|
| Chave do cliente | `clientKey()` — texto sem `.0` e sem espaços |
| Média mensal | Valor YTD da aba Venda ÷ **11** (Jan–Nov/2026) — ajustável ao publicar uma nova base |
| Curva ABCD | Participação acumulada: A ≤ 50% · B ≤ 80% · C ≤ 95% · D (ajustável na tela) |
| Ramo | Remove "SUPERMERCADO" → "1 A 4 CHECK-OUTS" |
| Documentos | Dígitos verificadores oficiais de CNPJ (14) e CPF (11) |
| Distâncias | Haversine (km) |
| SEM ROTEIRO | Promotores mantidos como capacidade ociosa |
| Coordenadas | ausente / zerada / fora de PE isoladas; lat-long invertidas corrigidas e sinalizadas; > 35 km do centro da cidade = divergência |
| Construtor | máx. 6 clientes/dia · raio 10 km do cliente anterior · score = Média mensal ÷ (1 + km) · CNPJ válido + venda > 0 + ativo + coordenada |

## Estrutura

```
app/            páginas (Visão Geral, Rotas, Promotores, Clientes, Ineficiências, Potencial, ABCD,
                Roteiro Semanal, Construtor, Executivo, Qualidade, Dados)
components/     Shell (menu retrátil, filtros globais com chips, tema), mapa Leaflet, tabelas, gráficos
lib/            extract (planilhas), analyze (regras), routing (heurísticas), export (CSV/XLSX/PDF), utils
workers/        parse.worker.ts (leitura das planilhas fora da thread principal)
scripts/        prepare-data.ts (gera public/data/base.json)
```

## Mapas

Leaflet + `leaflet.markercluster`, **somente provedores gratuitos e sem API key** (definidos em `components/map/basemaps.ts`):

| Camada | Fonte |
|---|---|
| Ruas · OpenStreetMap (padrão no modo claro) | tile.openstreetmap.org |
| Ruas detalhadas · Esri | World_Street_Map |
| **Satélite híbrido (ruas e cidades)** | World_Imagery + Reference/World_Transportation + Reference/World_Boundaries_and_Places (rótulos sempre ligados) |
| Satélite (sem rótulos) | World_Imagery |
| Cinza claro · Esri / Escuro · Esri (padrão no modo escuro) | Canvas/World_Light_Gray_* / Canvas/World_Dark_Gray_* |
| Topográfico · OpenTopoMap | tile.opentopomap.org |
| Mapbox Ruas / Satélite (opcional) | só aparecem com `NEXT_PUBLIC_MAPS_API_KEY` |

- **Fallback automático:** se a camada ativa não carregar nenhum tile (6 erros seguidos), o mapa troca sozinho para a próxima
  (OSM → Esri Ruas → OpenTopoMap → Cinza Esri; Satélite → Esri Ruas) e mostra um aviso.
- A camada escolhida é lembrada por navegador (separadamente para modo claro e escuro).
- OpenStreetMap: navegadores não permitem definir `User-Agent`; a identificação exigida pela política de uso do OSM é feita
  pelo cabeçalho `Referer` (política `strict-origin-when-cross-origin` explícita) e a atribuição aparece no rodapé do mapa.
- CARTO foi removido (os tiles passaram a vir com marca d'água "API KEY REQUIRED").

Geocodificação de endereços via OpenStreetMap Nominatim (uso moderado, sem chave).

Marca/cores: `lib/brand.ts`.

## Segurança de dependências

O pacote `xlsx` publicado no npm (0.18.5) tem um alerta conhecido do `npm audit`. Como as planilhas lidas são as da própria
Dilnor, o risco é baixo; se preferir, troque no `package.json` pela versão oficial atual da SheetJS:
`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` e rode `npm install`.
