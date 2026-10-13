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

1. Suba esta pasta para um repositório Git (privado recomendado) e importe na Vercel — o framework Next.js é detectado sozinho.
   Alternativa: `npx vercel` dentro da pasta.
2. (Opcional) Configure `NEXT_PUBLIC_MAPS_PROVIDER=mapbox` e `NEXT_PUBLIC_MAPS_API_KEY=<token>` para habilitar camadas Mapbox.
3. **Privacidade:** a base embutida contém CNPJs, endereços e faturamento. Ative *Deployment Protection* (senha / Vercel Authentication)
   no projeto, pois URLs da Vercel são públicas por padrão.

## Dados

- **Embutidos:** `public/data/base.json` (gerado a partir de `Relatório Roteiro Promotor.xlsx` + `Relatório Roteiro Rota Nova.xlsx`).
  Para regenerar: `npm run prepare-data -- "<Relatório Roteiro Promotor.xlsx>" "<Relatório Roteiro Rota Nova.xlsx>"`
- **Upload:** página *Carga de Planilhas* — arraste os `.xlsx`/`.xls`. A leitura roda num **Web Worker** (SheetJS) e as abas são
  reconhecidas pelos cabeçalhos canonizados (`" Valor YTD "` → `valor_ytd`). A base enviada fica salva no IndexedDB do navegador
  até ser restaurada a oficial. Envie o arquivo completo (com as abas Roteiros, Venda e 302) para manter o cadastro consistente.

O mesmo código (`lib/extract.ts` → `lib/analyze.ts`) é usado no script de geração e no navegador, então os números são idênticos.

## Regras de negócio

| Regra | Implementação |
|---|---|
| Chave do cliente | `clientKey()` — texto sem `.0` e sem espaços |
| Média mensal | Venda acumulada (Jan–Jul) ÷ **7** |
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

Leaflet + `leaflet.markercluster`, camadas: CARTO Voyager / Positron / Dark Matter, OpenStreetMap, Esri Satélite
(+ rótulos), Mapbox opcional. Geocodificação de endereços via OpenStreetMap Nominatim (uso moderado, sem chave).

Marca/cores: `lib/brand.ts`.

## Segurança de dependências

O pacote `xlsx` publicado no npm (0.18.5) tem um alerta conhecido do `npm audit`. Como as planilhas lidas são as da própria
Dilnor, o risco é baixo; se preferir, troque no `package.json` pela versão oficial atual da SheetJS:
`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` e rode `npm install`.
