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

A partir da raiz do projeto:

    docker compose up --build

Apos a inicializacao, a interface fica acessivel no navegador.

## Importacao dos dados

Baixe o extrato do Brasil da Geofabrik e importe com osm2pgsql em modo slim,
depois construa a topologia com pgr_createTopology. Os comandos completos
estao no Apendice do trabalho.

## Licenca

MIT
