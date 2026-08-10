from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import json
import time
import hashlib
import math
import os
import re
import threading
import unicodedata
import urllib.request
import urllib.parse

app = FastAPI(title="Routing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Conexão ao banco lida via variáveis de ambiente (com defaults para o
# ambiente Docker Compose, onde o host é o nome do serviço "db").
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "db"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME", "mydatabase"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "postgres"),
}

# Maior componente conectado da malha nacional. O importer grava o valor na
# tabela config_roteamento após o pgr_createTopology; o fallback via variável
# de ambiente cobre bancos antigos que não têm a tabela.
COMPONENT_FALLBACK = int(os.getenv("COMPONENT", "37"))
_componente_nacional_cache = None


def componente_nacional(cur) -> int:
    global _componente_nacional_cache
    if _componente_nacional_cache is None:
        try:
            cur.execute("SELECT valor FROM config_roteamento WHERE chave = 'componente_nacional'")
            row = cur.fetchone()
            _componente_nacional_cache = int(row[0]) if row else COMPONENT_FALLBACK
        except Exception:
            cur.connection.rollback()
            _componente_nacional_cache = COMPONENT_FALLBACK
    return _componente_nacional_cache


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


class RouteRequest(BaseModel):
    origem_lat: float
    origem_lng: float
    destino_lat: float
    destino_lng: float
    algoritmo: str = "dijkstra"


class CidadeRequest(BaseModel):
    nome: str


# ─── Helpers ────────────────────────────────────────────────────────────────

def format_distance(meters: float) -> str:
    if meters < 1000:
        return f"{int(round(meters / 10) * 10)} m"
    return f"{meters / 1000:.1f} km"


def bearing(ax, ay, bx, by) -> float:
    dx = bx - ax
    dy = by - ay
    angle = math.degrees(math.atan2(dx, dy))
    return (angle + 360) % 360


def turn_direction(bear_in: float, bear_out: float) -> tuple:
    diff = (bear_out - bear_in + 360) % 360
    if diff > 180:
        diff -= 360
    if -15 <= diff <= 15:
        return "straight", "↑", "Siga em frente"
    elif 15 < diff <= 60:
        return "slight_right", "↗", "Vire levemente à direita"
    elif 60 < diff <= 120:
        return "right", "→", "Vire à direita"
    elif diff > 120:
        return "sharp_right", "↪", "Vire acentuadamente à direita"
    elif -60 <= diff < -15:
        return "slight_left", "↖", "Vire levemente à esquerda"
    elif -120 <= diff < -60:
        return "left", "←", "Vire à esquerda"
    else:
        return "sharp_left", "↩", "Vire acentuadamente à esquerda"


def highway_label(hw: str) -> str:
    mapping = {
        "motorway": "rodovia", "trunk": "via expressa",
        "primary": "via principal", "secondary": "via secundária",
        "tertiary": "via local", "residential": "rua residencial",
        "service": "via de serviço", "unclassified": "via",
    }
    return mapping.get(hw, hw or "via") if hw else "via"


def build_instructions(segments: list) -> list:
    if not segments:
        return []

    instructions = []
    first = segments[0]
    road_name = first["name"] or highway_label(first["highway"])

    instructions.append({
        "tipo": "start", "icone": "◉",
        "texto": f"Siga pela {road_name}",
        "distancia": format_distance(first["length_m"]),
        "distancia_m": round(first["length_m"]),
        "nome_rua": road_name,
    })

    accumulated = first["length_m"]
    current_name = road_name

    for i in range(1, len(segments)):
        prev = segments[i - 1]
        curr = segments[i]

        bear_in  = bearing(prev["start_x"], prev["start_y"], prev["end_x"], prev["end_y"])
        bear_out = bearing(curr["start_x"], curr["start_y"], curr["end_x"], curr["end_y"])
        mtype, icon, label = turn_direction(bear_in, bear_out)

        new_name = curr["name"] or highway_label(curr["highway"]) or current_name
        road_changed = new_name != current_name
        significant  = mtype != "straight"

        if road_changed or significant:
            dest_name = f" na {new_name}" if new_name != current_name else ""
            instructions.append({
                "tipo": mtype, "icone": icon,
                "texto": f"{label}{dest_name}",
                "distancia": format_distance(accumulated),
                "distancia_m": round(accumulated),
                "nome_rua": new_name,
            })
            accumulated = curr["length_m"]
            current_name = new_name
        else:
            accumulated += curr["length_m"]

    instructions.append({
        "tipo": "arrive", "icone": "◎",
        "texto": "Você chegou ao destino",
        "distancia": format_distance(accumulated),
        "distancia_m": round(accumulated),
        "nome_rua": "",
    })

    return instructions


# ─── SQL ────────────────────────────────────────────────────────────────────

def build_route_sql(algoritmo: str, origem_id: int, destino_id: int) -> str:
    base = "SELECT osm_id AS id, source, target, ST_Length(way) AS cost FROM planet_osm_roads"
    astar = """SELECT osm_id AS id, source, target, ST_Length(way) AS cost,
               ST_X(ST_StartPoint(way)) AS x1, ST_Y(ST_StartPoint(way)) AS y1,
               ST_X(ST_EndPoint(way)) AS x2, ST_Y(ST_EndPoint(way)) AS y2
               FROM planet_osm_roads"""

    if algoritmo == "dijkstra":
        func = f"pgr_dijkstra('{base}', {origem_id}, {destino_id}, false)"
    elif algoritmo == "astar":
        func = f"pgr_aStar($${astar}$$, {origem_id}, {destino_id}, directed := false)"
    elif algoritmo == "bdastar":
        func = f"pgr_bdAstar($${astar}$$, {origem_id}, {destino_id}, directed := false)"
    else:
        raise ValueError(f"Algoritmo inválido: {algoritmo}")

    return f"""
        SELECT
            ST_AsGeoJSON(ST_Transform(ST_Union(r.way), 4326)) AS geojson,
            json_agg(json_build_object(
                'seq',      d.seq,
                'name',     r.name,
                'highway',  r.highway,
                'length_m', ST_Length(r.way),
                'start_x',  ST_X(ST_Transform(ST_StartPoint(r.way), 4326)),
                'start_y',  ST_Y(ST_Transform(ST_StartPoint(r.way), 4326)),
                'end_x',    ST_X(ST_Transform(ST_EndPoint(r.way), 4326)),
                'end_y',    ST_Y(ST_Transform(ST_EndPoint(r.way), 4326))
            ) ORDER BY d.seq) AS segments
        FROM planet_osm_roads r
        JOIN {func} d ON r.osm_id = d.edge
    """


def find_nearest_vertex(cur, lng: float, lat: float) -> int:
    cur.execute("""
        SELECT v.id FROM planet_osm_roads_vertices_pgr v
        JOIN (
            SELECT node FROM pgr_connectedComponents(
                'SELECT osm_id AS id, source, target, ST_Length(way) AS cost FROM planet_osm_roads'
            ) WHERE component = %s
        ) c ON v.id = c.node
        ORDER BY v.the_geom <-> ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 3857)
        LIMIT 1
    """, (componente_nacional(cur), lng, lat))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Vértice não encontrado")
    return row[0]


# ─── Malha urbana detalhada ──────────────────────────────────────────────────
#
#   A malha nacional (planet_osm_roads) só tem as vias principais. Para rotas
#   dentro de uma cidade é preciso planet_osm_line, que inclui ruas locais mas
#   não vem com topologia. Este bloco reproduz, sob demanda, o procedimento que
#   foi validado à mão para Uberlândia:
#
#     bbox do Nominatim → cidade_<slug>_roads → pgr_nodeNetwork (quebra as vias
#     nos cruzamentos) → pgr_createTopology (numera source/target) → registro em
#     cidades_preparadas com o maior componente conectado.
#
#   Leva minutos, então roda numa thread e o progresso é lido via /cidade/status.

TOLERANCIA = 0.0001          # graus de tolerância do noding/topologia
BBOX_GRAUS_MAX = 2.0         # trava contra bbox de estado/país (~220 km)

# Jobs em andamento: slug → dict de progresso. Cidades concluídas moram na
# tabela cidades_preparadas; o dict só guarda o que ainda está rodando.
JOBS = {}
JOBS_LOCK = threading.Lock()

ETAPAS = [
    ("geocode",    5,  "Consultando o Nominatim"),
    ("extracao",   20, "Extraindo as vias do bbox"),
    ("noding",     45, "Quebrando as vias nos cruzamentos (pgr_nodeNetwork)"),
    ("topologia",  70, "Montando a topologia (pgr_createTopology)"),
    ("componente", 90, "Identificando o maior componente conectado"),
    ("concluido",  100, "Concluída"),
]


#   O nome derivado mais longo é cidade_<slug>_roads_noded_vertices_pgr, que
#   soma 32 caracteres além do slug. Como o Postgres trunca identificadores em
#   63 bytes *em silêncio*, o slug precisa caber em 31 — senão o nome que o
#   pgr_createTopology cria deixa de bater com o que o roteamento procura.
SLUG_MAX = 31


def slugify(nome: str) -> str:
    """Nome da cidade → identificador seguro para nome de tabela."""
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").lower()
    s = re.sub(r"_+", "_", s).strip("_")
    if len(s) > SLUG_MAX:
        # Corta e assina com um hash do nome inteiro, senão duas cidades com o
        # mesmo prefixo longo disputariam as mesmas tabelas.
        s = s[:SLUG_MAX - 7].rstrip("_") + "_" + hashlib.md5(s.encode()).hexdigest()[:6]
    if not re.fullmatch(r"[a-z][a-z0-9_]*", s or ""):
        raise HTTPException(status_code=400, detail=f"Nome de cidade inválido: {nome!r}")
    return s


def tabelas_cidade(slug: str) -> dict:
    return {
        "roads": f"cidade_{slug}_roads",
        "noded": f"cidade_{slug}_roads_noded",
        "vertices": f"cidade_{slug}_roads_noded_vertices_pgr",
    }


def nominatim(q: str, limit: int = 5) -> list:
    url = (f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(q)}"
           f"&format=json&limit={limit}&countrycodes=br")
    request = urllib.request.Request(url, headers={"User-Agent": "RoutingApp/1.0"})
    with urllib.request.urlopen(request, timeout=30) as resp:
        return json.loads(resp.read())


def bbox_cidade(nome: str) -> dict:
    """Bounding box do LIMITE da cidade no Nominatim.

    A busca é filtrada para pegar o polígono administrativo (o limite da
    cidade) e não um ponto de interesse: prefere-se o resultado com
    class='boundary' e type='administrative', cujo boundingbox cobre toda a
    área do município. Cai para um nó de lugar (city/town/...) só se não houver
    limite administrativo."""
    resultados = nominatim(nome, limit=10)
    if not resultados:
        raise ValueError(f"Cidade não encontrada no Nominatim: {nome}")

    def com_bbox(r):
        return bool(r.get("boundingbox"))

    # 1. Limite administrativo (polígono da cidade) — o caso desejado.
    escolhido = next(
        (r for r in resultados
         if r.get("class") == "boundary" and r.get("type") == "administrative" and com_bbox(r)),
        None,
    )
    # 2. Sem limite administrativo: um lugar do tipo cidade/município.
    if escolhido is None:
        escolhido = next(
            (r for r in resultados
             if r.get("type") in {"city", "town", "municipality", "village"} and com_bbox(r)),
            None,
        )
    # 3. Último recurso: qualquer resultado que traga bounding box.
    if escolhido is None:
        escolhido = next((r for r in resultados if com_bbox(r)), None)

    if not escolhido:
        raise ValueError(f"O Nominatim não retornou bounding box para: {nome}")

    # Nominatim devolve boundingbox = [lat_min, lat_max, lon_min, lon_max] (strings).
    lat_min, lat_max, lon_min, lon_max = (float(v) for v in escolhido["boundingbox"])
    if (lat_max - lat_min) > BBOX_GRAUS_MAX or (lon_max - lon_min) > BBOX_GRAUS_MAX:
        raise ValueError(
            "A área encontrada é grande demais para uma malha urbana "
            f"({lat_max - lat_min:.2f}° × {lon_max - lon_min:.2f}°). Refine o nome da cidade."
        )

    # O ST_MakeEnvelope (na extração das vias) recebe estes campos reordenados
    # como (min_lon, min_lat, max_lon, max_lat) = (lon_min, lat_min, lon_max, lat_max).
    return {
        "display_name": escolhido.get("display_name", nome),
        "min_lat": lat_min, "max_lat": lat_max,
        "min_lon": lon_min, "max_lon": lon_max,
        "lat": float(escolhido["lat"]), "lon": float(escolhido["lon"]),
    }


def garantir_tabela_controle(cur) -> None:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cidades_preparadas (
            slug             text PRIMARY KEY,
            nome             text NOT NULL,
            display_name     text,
            min_lat          double precision NOT NULL,
            max_lat          double precision NOT NULL,
            min_lon          double precision NOT NULL,
            max_lon          double precision NOT NULL,
            componente       bigint,
            n_vias           integer,
            n_segmentos      integer,
            n_nos            integer,
            n_nos_componente integer,
            pct_componente   double precision,
            criado_em        timestamptz NOT NULL DEFAULT now()
        )
    """)


def maior_componente(cur, tabela_noded: str) -> tuple:
    """(componente, nós no componente, nós no total) da malha noded."""
    cur.execute(f"""
        SELECT component, count(*) AS nos
        FROM pgr_connectedComponents(
            'SELECT id, source, target, ST_Length(way) AS cost FROM {tabela_noded}'
        )
        GROUP BY component
        ORDER BY nos DESC
    """)
    linhas = cur.fetchall()
    if not linhas:
        raise ValueError("A topologia ficou vazia — nenhum componente conectado")
    total = sum(l[1] for l in linhas)
    return linhas[0][0], linhas[0][1], total


def set_job(slug: str, **campos) -> None:
    with JOBS_LOCK:
        job = JOBS.setdefault(slug, {})
        job.update(campos)


def etapa_job(slug: str, etapa: str) -> None:
    _, progresso, mensagem = next(e for e in ETAPAS if e[0] == etapa)
    set_job(slug, etapa=etapa, progresso=progresso, mensagem=mensagem)


def preparar_cidade_worker(slug: str, nome: str) -> None:
    """Roda o pipeline completo numa thread; erros viram status do job."""
    conn = None
    try:
        etapa_job(slug, "geocode")
        bbox = bbox_cidade(nome)
        set_job(slug, bbox=bbox, display_name=bbox["display_name"])

        conn = get_conn()
        conn.autocommit = True   # cada DDL do pgRouting confirma sozinho
        cur = conn.cursor()
        cur.execute("SET statement_timeout = 0")
        t = tabelas_cidade(slug)

        # 1. Vias de planet_osm_line dentro do bbox
        etapa_job(slug, "extracao")
        for tabela in (t["vertices"], t["noded"], f"{t['roads']}_vertices_pgr", t["roads"]):
            cur.execute(f"DROP TABLE IF EXISTS {tabela} CASCADE")

        cur.execute(f"""
            CREATE TABLE {t['roads']} AS
            SELECT osm_id, name, highway, way
            FROM planet_osm_line
            WHERE highway IS NOT NULL
              AND way && ST_Transform(ST_MakeEnvelope(%s, %s, %s, %s, 4326), 3857)
        """, (bbox["min_lon"], bbox["min_lat"], bbox["max_lon"], bbox["max_lat"]))

        cur.execute(f"SELECT count(*), count(DISTINCT osm_id) FROM {t['roads']}")
        n_vias, n_distintos = cur.fetchone()
        if n_vias == 0:
            raise ValueError(
                "Nenhuma via encontrada no bounding box. O extrato do OSM "
                "carregado no banco provavelmente não cobre essa cidade."
            )

        # pgr_nodeNetwork exige id único; extratos do osm2pgsql raramente
        # repetem osm_id em linhas, mas se repetirem mantemos a via mais longa.
        if n_distintos < n_vias:
            cur.execute(f"""
                DELETE FROM {t['roads']} a USING {t['roads']} b
                WHERE a.osm_id = b.osm_id
                  AND (ST_Length(a.way), a.ctid) < (ST_Length(b.way), b.ctid)
            """)
            set_job(slug, aviso=f"{n_vias - n_distintos} via(s) com osm_id repetido foram descartadas")
            n_vias = n_distintos

        cur.execute(f"CREATE UNIQUE INDEX ON {t['roads']} (osm_id)")
        cur.execute(f"CREATE INDEX ON {t['roads']} USING gist (way)")
        set_job(slug, n_vias=n_vias)

        # 2. Quebra as vias nos cruzamentos
        etapa_job(slug, "noding")
        cur.execute("SELECT pgr_nodeNetwork(%s, %s, %s, %s)",
                    (t["roads"], TOLERANCIA, "osm_id", "way"))

        cur.execute(f"SELECT count(*) FROM {t['noded']}")
        n_segmentos = cur.fetchone()[0]
        set_job(slug, n_segmentos=n_segmentos)

        # 3. Topologia (source/target). pgr_nodeNetwork já cria as colunas nas
        #    versões atuais; o IF NOT EXISTS mantém o passo idempotente.
        etapa_job(slug, "topologia")
        cur.execute(f"ALTER TABLE {t['noded']} ADD COLUMN IF NOT EXISTS source integer")
        cur.execute(f"ALTER TABLE {t['noded']} ADD COLUMN IF NOT EXISTS target integer")
        cur.execute("SELECT pgr_createTopology(%s, %s, %s, %s)",
                    (t["noded"], TOLERANCIA, "way", "id"))
        cur.execute(f"CREATE INDEX IF NOT EXISTS {t['noded']}_source_idx ON {t['noded']} (source)")
        cur.execute(f"CREATE INDEX IF NOT EXISTS {t['noded']}_target_idx ON {t['noded']} (target)")
        cur.execute(f"CREATE INDEX IF NOT EXISTS {t['noded']}_old_id_idx ON {t['noded']} (old_id)")

        # 4. Maior componente conectado
        etapa_job(slug, "componente")
        componente, nos_componente, n_nos = maior_componente(cur, t["noded"])
        pct = round(100.0 * nos_componente / n_nos, 2) if n_nos else 0.0

        # 5. Registro
        garantir_tabela_controle(cur)
        cur.execute("""
            INSERT INTO cidades_preparadas (
                slug, nome, display_name, min_lat, max_lat, min_lon, max_lon,
                componente, n_vias, n_segmentos, n_nos, n_nos_componente,
                pct_componente, criado_em
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
            ON CONFLICT (slug) DO UPDATE SET
                nome = EXCLUDED.nome,
                display_name = EXCLUDED.display_name,
                min_lat = EXCLUDED.min_lat, max_lat = EXCLUDED.max_lat,
                min_lon = EXCLUDED.min_lon, max_lon = EXCLUDED.max_lon,
                componente = EXCLUDED.componente,
                n_vias = EXCLUDED.n_vias, n_segmentos = EXCLUDED.n_segmentos,
                n_nos = EXCLUDED.n_nos, n_nos_componente = EXCLUDED.n_nos_componente,
                pct_componente = EXCLUDED.pct_componente,
                criado_em = now()
        """, (slug, nome, bbox["display_name"],
              bbox["min_lat"], bbox["max_lat"], bbox["min_lon"], bbox["max_lon"],
              componente, n_vias, n_segmentos, n_nos, nos_componente, pct))

        cur.close()
        etapa_job(slug, "concluido")
        set_job(slug, status="pronta", componente=componente, n_nos=n_nos,
                n_nos_componente=nos_componente, pct_componente=pct,
                terminado_em=time.time())

    except Exception as e:
        set_job(slug, status="erro", erro=str(e), terminado_em=time.time())
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def listar_cidades(cur) -> list:
    garantir_tabela_controle(cur)
    cur.execute("""
        SELECT slug, nome, display_name, min_lat, max_lat, min_lon, max_lon,
               componente, n_vias, n_segmentos, n_nos, n_nos_componente,
               pct_componente, criado_em
        FROM cidades_preparadas
        ORDER BY nome
    """)
    return [{
        "slug": r[0], "nome": r[1], "display_name": r[2],
        "bbox": {"min_lat": r[3], "max_lat": r[4], "min_lon": r[5], "max_lon": r[6]},
        "componente": r[7], "n_vias": r[8], "n_segmentos": r[9],
        "n_nos": r[10], "n_nos_componente": r[11],
        "pct_componente": float(r[12]) if r[12] is not None else None,
        "criado_em": r[13].isoformat() if r[13] else None,
    } for r in cur.fetchall()]


def cidade_para_rota(cur, req: RouteRequest):
    """Cidade preparada cujo bbox contém origem E destino (a menor, se houver
    mais de uma). Qualquer problema aqui cai no roteamento nacional."""
    try:
        cur.execute("""
            SELECT slug, nome, componente
            FROM cidades_preparadas
            WHERE %s BETWEEN min_lat AND max_lat AND %s BETWEEN min_lon AND max_lon
              AND %s BETWEEN min_lat AND max_lat AND %s BETWEEN min_lon AND max_lon
              AND to_regclass('public.cidade_' || slug || '_roads_noded') IS NOT NULL
              AND to_regclass('public.cidade_' || slug || '_roads_noded_vertices_pgr') IS NOT NULL
            ORDER BY (max_lat - min_lat) * (max_lon - min_lon) ASC
            LIMIT 1
        """, (req.origem_lat, req.origem_lng, req.destino_lat, req.destino_lng))
        linha = cur.fetchone()
    except Exception:
        cur.connection.rollback()
        return None

    if not linha:
        return None

    slug, nome, componente = linha
    if componente is None:   # registro antigo/incompleto: descobre na hora
        componente, _, _ = maior_componente(cur, tabelas_cidade(slug)["noded"])
    return {"slug": slug, "nome": nome, "componente": componente}


def build_route_sql_cidade(algoritmo: str, slug: str, origem_id: int, destino_id: int) -> str:
    """Mesmo SQL do roteamento nacional, trocando a malha: as arestas vêm da
    tabela noded (id/source/target) e nome/highway vêm da tabela de vias
    original pelo old_id."""
    t = tabelas_cidade(slug)
    base = f"SELECT id, source, target, ST_Length(way) AS cost FROM {t['noded']}"
    astar = f"""SELECT id, source, target, ST_Length(way) AS cost,
               ST_X(ST_StartPoint(way)) AS x1, ST_Y(ST_StartPoint(way)) AS y1,
               ST_X(ST_EndPoint(way)) AS x2, ST_Y(ST_EndPoint(way)) AS y2
               FROM {t['noded']}"""

    if algoritmo == "dijkstra":
        func = f"pgr_dijkstra('{base}', {origem_id}, {destino_id}, false)"
    elif algoritmo == "astar":
        func = f"pgr_aStar($${astar}$$, {origem_id}, {destino_id}, directed := false)"
    elif algoritmo == "bdastar":
        func = f"pgr_bdAstar($${astar}$$, {origem_id}, {destino_id}, directed := false)"
    else:
        raise ValueError(f"Algoritmo inválido: {algoritmo}")

    return f"""
        SELECT
            ST_AsGeoJSON(ST_Transform(ST_Union(n.way), 4326)) AS geojson,
            json_agg(json_build_object(
                'seq',      d.seq,
                'name',     v.name,
                'highway',  v.highway,
                'length_m', ST_Length(n.way),
                'start_x',  ST_X(ST_Transform(ST_StartPoint(n.way), 4326)),
                'start_y',  ST_Y(ST_Transform(ST_StartPoint(n.way), 4326)),
                'end_x',    ST_X(ST_Transform(ST_EndPoint(n.way), 4326)),
                'end_y',    ST_Y(ST_Transform(ST_EndPoint(n.way), 4326))
            ) ORDER BY d.seq) AS segments
        FROM {t['noded']} n
        JOIN {func} d ON n.id = d.edge
        LEFT JOIN {t['roads']} v ON v.osm_id = n.old_id
    """


def find_nearest_vertex_cidade(cur, slug: str, componente: int, lng: float, lat: float) -> int:
    t = tabelas_cidade(slug)
    cur.execute(f"""
        SELECT v.id FROM {t['vertices']} v
        JOIN (
            SELECT node FROM pgr_connectedComponents(
                'SELECT id, source, target, ST_Length(way) AS cost FROM {t['noded']}'
            ) WHERE component = %s
        ) c ON v.id = c.node
        ORDER BY v.the_geom <-> ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 3857)
        LIMIT 1
    """, (componente, lng, lat))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Vértice não encontrado na malha da cidade")
    return row[0]


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.post("/rota")
def calcular_rota(req: RouteRequest):
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Origem e destino dentro do bbox de uma cidade preparada → malha
        # urbana detalhada. Fora disso, segue a malha nacional de sempre.
        cidade = cidade_para_rota(cur, req)

        if cidade:
            id_origem  = find_nearest_vertex_cidade(cur, cidade["slug"], cidade["componente"], req.origem_lng, req.origem_lat)
            id_destino = find_nearest_vertex_cidade(cur, cidade["slug"], cidade["componente"], req.destino_lng, req.destino_lat)
            sql = build_route_sql_cidade(req.algoritmo, cidade["slug"], id_origem, id_destino)
            malha = {"tipo": "cidade", "slug": cidade["slug"], "nome": cidade["nome"],
                     "tabela": tabelas_cidade(cidade["slug"])["noded"],
                     "componente": cidade["componente"]}
        else:
            id_origem  = find_nearest_vertex(cur, req.origem_lng, req.origem_lat)
            id_destino = find_nearest_vertex(cur, req.destino_lng, req.destino_lat)
            sql = build_route_sql(req.algoritmo, id_origem, id_destino)
            malha = {"tipo": "nacional", "slug": None, "nome": "Malha nacional",
                     "tabela": "planet_osm_roads", "componente": componente_nacional(cur)}

        start = time.time()
        cur.execute(sql)
        elapsed = round((time.time() - start) * 1000, 2)

        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="Rota não encontrada")

        geojson  = json.loads(row[0])
        segments = row[1] or []
        total_m  = sum(s.get("length_m", 0) for s in segments)

        return {
            "geojson":    geojson,
            "algoritmo":  req.algoritmo,
            "tempo_ms":   elapsed,
            "total_km":   round(total_m / 1000, 2),
            "instrucoes": build_instructions(segments),
            "origem_id":  id_origem,
            "destino_id": id_destino,
            "malha":      malha,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cidade/preparar", status_code=202)
def preparar_cidade(req: CidadeRequest):
    """Dispara a construção da malha urbana. Responde na hora; o andamento sai
    em /cidade/status?slug=... (o processo leva minutos)."""
    nome = (req.nome or "").strip()
    if len(nome) < 3:
        raise HTTPException(status_code=400, detail="Informe o nome da cidade")

    slug = slugify(nome)

    with JOBS_LOCK:
        atual = JOBS.get(slug)
        if atual and atual.get("status") == "preparando":
            return {**atual, "ja_em_andamento": True}
        JOBS[slug] = {
            "slug": slug, "nome": nome, "status": "preparando",
            "etapa": "geocode", "progresso": 0,
            "mensagem": "Iniciando...", "erro": None,
            "iniciado_em": time.time(),
        }

    threading.Thread(target=preparar_cidade_worker, args=(slug, nome), daemon=True).start()

    with JOBS_LOCK:
        return dict(JOBS[slug])


@app.get("/cidade/status")
def status_cidade(slug: str):
    with JOBS_LOCK:
        job = dict(JOBS.get(slug, {}))

    conn = get_conn()
    cur = conn.cursor()
    try:
        registrada = next((c for c in listar_cidades(cur) if c["slug"] == slug), None)
        conn.commit()
    finally:
        cur.close()
        conn.close()

    if job:
        return {**job, "cidade": registrada}
    if registrada:
        return {"slug": slug, "nome": registrada["nome"], "status": "pronta",
                "etapa": "concluido", "progresso": 100, "mensagem": "Concluída",
                "erro": None, "cidade": registrada}
    raise HTTPException(status_code=404, detail=f"Nenhuma preparação para '{slug}'")


@app.get("/cidades")
def cidades():
    conn = get_conn()
    cur = conn.cursor()
    try:
        preparadas = listar_cidades(cur)
        conn.commit()
    finally:
        cur.close()
        conn.close()

    with JOBS_LOCK:
        em_andamento = [dict(j) for j in JOBS.values() if j.get("status") == "preparando"]

    return {"cidades": preparadas, "em_andamento": em_andamento}


@app.get("/geocode")
def geocode(q: str):
    return nominatim(q, limit=5)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def preparar_tabela_controle():
    """A tabela de controle precisa existir antes do primeiro /rota, senão a
    seleção de malha cairia no fallback a cada requisição."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        garantir_tabela_controle(cur)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[startup] não foi possível criar cidades_preparadas: {e}")
