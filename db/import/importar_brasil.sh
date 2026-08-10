#!/bin/bash
# Importação automática do extrato do Brasil (OSM) + topologia nacional.
#
# Roda como serviço "importer" do docker-compose. É idempotente:
#   - se planet_osm_line já existe, pula o osm2pgsql;
#   - se o PBF não existe, baixa o extrato do Brasil da Geofabrik;
#   - se a topologia de planet_osm_roads já existe, pula o pgr_createTopology;
#   - ao final grava o maior componente conectado em config_roteamento,
#     de onde o backend lê (nada de número mágico no código).
#
# Variáveis (todas com default no docker-compose.yml):
#   PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD  conexão
#   OSM2PGSQL_CACHE  MB de cache do osm2pgsql (default 2048)
#   PBF              caminho do .pbf dentro do container (default /data/brazil.osm.pbf)
#   PBF_URL          URL do extrato, usada só se o PBF não existir
set -euo pipefail

PBF="${PBF:-/data/brazil.osm.pbf}"
PBF_URL="${PBF_URL:-https://download.geofabrik.de/south-america/brazil-latest.osm.pbf}"
CACHE="${OSM2PGSQL_CACHE:-2048}"

psql_q() { psql -X -A -t -v ON_ERROR_STOP=1 -c "$1"; }

echo "[importer] aguardando o banco..."
until pg_isready -q; do sleep 2; done

# ── 1. osm2pgsql (planet_osm_line / planet_osm_roads etc.) ──────────────────
if [ "$(psql_q "SELECT to_regclass('public.planet_osm_line') IS NOT NULL")" = "t" ]; then
    echo "[importer] planet_osm_line já existe — importação pulada."
else
    if [ ! -f "$PBF" ]; then
        echo "[importer] extrato não encontrado em $PBF."
        echo "[importer] baixando de $PBF_URL (~1,9 GB; retomável se interrompido)..."
        wget -c -O "${PBF}.part" "$PBF_URL"
        mv "${PBF}.part" "$PBF"
        echo "[importer] download concluído: $PBF"
    fi
    echo "[importer] iniciando osm2pgsql ($PBF, cache ${CACHE} MB). Isso leva horas na primeira vez."
    osm2pgsql --slim --hstore --cache "$CACHE" --flat-nodes /tmp/nodes.bin \
        -H "$PGHOST" -P "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" "$PBF"
    rm -f /tmp/nodes.bin
    echo "[importer] osm2pgsql concluído."
fi

# ── 2. Topologia da malha nacional (planet_osm_roads) ───────────────────────
if [ "$(psql_q "SELECT to_regclass('public.planet_osm_roads_vertices_pgr') IS NOT NULL")" = "t" ]; then
    echo "[importer] topologia nacional já existe — pgr_createTopology pulado."
else
    echo "[importer] criando topologia nacional (pgr_createTopology em planet_osm_roads)..."
    psql_q "ALTER TABLE planet_osm_roads ADD COLUMN IF NOT EXISTS source integer"
    psql_q "ALTER TABLE planet_osm_roads ADD COLUMN IF NOT EXISTS target integer"
    psql -X -v ON_ERROR_STOP=1 -c "SET statement_timeout = 0;
        SELECT pgr_createTopology('planet_osm_roads', 0.0001, 'way', 'osm_id');"
    psql_q "CREATE INDEX IF NOT EXISTS planet_osm_roads_source_idx ON planet_osm_roads (source)"
    psql_q "CREATE INDEX IF NOT EXISTS planet_osm_roads_target_idx ON planet_osm_roads (target)"
    echo "[importer] topologia concluída."
fi

# ── 3. Maior componente conectado → config_roteamento ───────────────────────
if [ "$(psql_q "SELECT to_regclass('public.config_roteamento') IS NOT NULL")" = "t" ] && \
   [ "$(psql_q "SELECT EXISTS (SELECT 1 FROM config_roteamento WHERE chave='componente_nacional')")" = "t" ]; then
    echo "[importer] componente nacional já registrado — cálculo pulado."
else
    echo "[importer] identificando o maior componente conectado da malha nacional..."
    psql_q "CREATE TABLE IF NOT EXISTS config_roteamento (chave text PRIMARY KEY, valor bigint NOT NULL)"
    psql -X -v ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = 0;
INSERT INTO config_roteamento (chave, valor)
SELECT 'componente_nacional', component
FROM pgr_connectedComponents(
    'SELECT osm_id AS id, source, target, ST_Length(way) AS cost FROM planet_osm_roads'
)
GROUP BY component
ORDER BY count(*) DESC
LIMIT 1
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
SQL
    echo "[importer] componente nacional: $(psql_q "SELECT valor FROM config_roteamento WHERE chave='componente_nacional'")"
fi

echo "[importer] pronto — banco completo para roteamento nacional e aba Cidades."
