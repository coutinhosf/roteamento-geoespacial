# Sistema de Roteamento Geoespacial

Sistema web para calculo de caminhos minimos sobre a malha viaria brasileira,
comparando os algoritmos Dijkstra, A* e A* bidirecional. Desenvolvido como
Trabalho de Conclusao de Curso (UFU).

## Tecnologias

- PostgreSQL + PostGIS + pgRouting
- FastAPI (back-end)
- React + Leaflet (front-end)
- Docker + Docker Compose

## Como executar

1. Copie `.env.example` para `.env` e defina a senha do banco.

2. A partir da raiz do projeto:

       docker compose up --build

Pronto: nada precisa ser rodado a mao. O servico `importer` faz tudo sozinho:
baixa o extrato do Brasil da Geofabrik (~1,9 GB) para `./data/` caso ele ainda
nao exista, roda o osm2pgsql (modo slim), monta a topologia da malha nacional
(pgr_createTopology) e registra o maior componente conectado na tabela
`config_roteamento`, de onde o back-end le. **A primeira subida leva horas**
(download + importacao do Brasil inteiro) e usa dezenas de GB de disco;
acompanhe com `docker compose logs -f importer`. Nas subidas seguintes o
importer verifica que o banco ja esta pronto e sai em segundos.

Se voce ja tem o `brazil.osm.pbf` baixado, copie-o para `./data/` antes do
`up` e o download e pulado. Para fixar o mesmo extrato usado no TCC
(5 ago. 2026) em vez do `latest`, defina `PBF_URL` no `.env`
(veja `.env.example`).

O back-end so inicia depois que o importer termina. Apos a inicializacao, a
interface fica acessivel no navegador (porta 80).

## Cidades

A malha nacional cobre apenas as vias principais. Para rotas urbanas, use a
aba **Cidades** da interface: informe o nome do municipio e o sistema busca o
limite no Nominatim, extrai as vias locais de `planet_osm_line` e monta a
topologia da cidade (pgr_nodeNetwork + pgr_createTopology) automaticamente.

## Licenca

MIT
