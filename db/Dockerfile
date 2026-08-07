# Base PostGIS (já traz postgis e hstore). pgRouting não vem incluso na
# imagem postgis/postgis, então é instalado a partir do repositório PGDG
# que já está configurado nela.
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgrouting \
    && rm -rf /var/lib/apt/lists/*

# Habilita as extensões automaticamente na criação do banco (volume vazio).
COPY init/ /docker-entrypoint-initdb.d/
