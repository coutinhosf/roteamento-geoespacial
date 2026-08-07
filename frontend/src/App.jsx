import { useState, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const API = '/api'

const TURN_COLORS = {
  start:       'var(--accent)',
  arrive:      'var(--accent3)',
  straight:    'var(--muted)',
  right:       'var(--accent2)',
  left:        'var(--accent2)',
  slight_right:'var(--accent2)',
  slight_left: 'var(--accent2)',
  sharp_right: '#ff6b35',
  sharp_left:  '#ff6b35',
}

function FitBounds({ geojson }) {
  const map = useMap()
  useEffect(() => {
    if (!geojson) return
    try {
      const layer = window.L.geoJSON(geojson)
      map.fitBounds(layer.getBounds(), { padding: [40, 40] })
    } catch {}
  }, [geojson, map])
  return null
}

function AddressInput({ label, value, onChange, onSelect, icon, color }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  const handleChange = (e) => {
    const v = e.target.value
    onChange(v)
    clearTimeout(timer.current)
    if (v.length < 3) { setSuggestions([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API}/geocode?q=${encodeURIComponent(v + ' Brasil')}`)
        setSuggestions((await res.json()).slice(0, 5))
      } catch {}
      setLoading(false)
    }, 400)
  }

  const select = (item) => {
    onChange(item.display_name.split(',').slice(0, 2).join(','))
    onSelect({ lat: parseFloat(item.lat), lng: parseFloat(item.lon) })
    setSuggestions([])
  }

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        <span style={{ color }}>{icon}</span> {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input value={value} onChange={handleChange}
          placeholder={`Digite ${label.toLowerCase()}...`}
          style={{ width: '100%', padding: '10px 14px', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'DM Sans' }}
          onFocus={e => e.target.style.borderColor = color}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; setTimeout(() => setSuggestions([]), 200) }}
        />
        {loading && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: color, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
      </div>
      {suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={() => select(s)}
              style={{ padding: '10px 14px', fontSize: 13, cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--panel)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight: 500 }}>{s.display_name.split(',')[0]}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.display_name.split(',').slice(1, 3).join(',')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ALGORITMOS = [
  { id: 'dijkstra', label: 'Dijkstra', color: 'var(--accent)',  hex: '#00e5a0', desc: 'Clássico, sempre ótimo',   weight: 8,   opacity: 0.35 },
  { id: 'astar',    label: 'A*',       color: 'var(--accent2)', hex: '#0099ff', desc: 'Heurística geográfica',   weight: 5,   opacity: 0.7  },
  { id: 'bdastar',  label: 'Bi-A*',    color: 'var(--accent3)', hex: '#ff6b35', desc: 'Bidirecional, mais rápido', weight: 2.5, opacity: 1    },
]

function InstructionItem({ step, index, active, onClick }) {
  const color = TURN_COLORS[step.tipo] || 'var(--muted)'
  return (
    <div onClick={() => onClick(index)}
      style={{
        display: 'flex', gap: 12, padding: '10px 12px',
        background: active ? 'var(--panel)' : 'transparent',
        borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
        borderLeft: active ? `3px solid ${color}` : '3px solid transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#ffffff08' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: `${color}20`,
        border: `1px solid ${color}40`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 16, color, flexShrink: 0,
      }}>
        {step.icone}
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>
          {step.texto}
        </div>
        {step.nome_rua && step.tipo !== 'start' && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {step.nome_rua}
          </div>
        )}
      </div>
      {/* Distance */}
      <div style={{ fontSize: 11, fontFamily: 'Space Mono', color, flexShrink: 0, paddingTop: 2 }}>
        {step.distancia}
      </div>
    </div>
  )
}

/* ── Malha urbana detalhada ───────────────────────────────────────────────
   Cidades preparadas sob demanda (planet_osm_line + pgr_nodeNetwork). O
   preparo leva minutos, então o POST só dispara o job e o andamento vem do
   /cidade/status.                                                          */

const ETAPA_LABEL = {
  geocode:    'Nominatim',
  extracao:   'Extraindo vias',
  noding:     'Noding',
  topologia:  'Topologia',
  componente: 'Componentes',
  concluido:  'Concluída',
}

const fmtNum = n => (n == null ? '—' : n.toLocaleString('pt-BR'))

function MalhaBadge({ malha }) {
  const detalhada = malha.tipo === 'cidade'
  return (
    <div style={{
      marginTop: 12, padding: '6px 10px', borderRadius: 8,
      background: 'var(--panel)',
      border: `1px solid ${detalhada ? 'var(--accent)' : 'var(--border)'}`,
      fontSize: 10, fontFamily: 'Space Mono',
      color: detalhada ? 'var(--accent)' : 'var(--muted)',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span>{detalhada ? '◆' : '◇'}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {detalhada ? `Malha detalhada · ${malha.nome}` : 'Malha nacional'}
      </span>
    </div>
  )
}

function CidadeCard({ cidade }) {
  const { bbox } = cidade
  return (
    <div style={{ padding: '11px 12px', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--accent)', fontSize: 11 }}>◆</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cidade.nome}
        </div>
        <span style={{ fontSize: 9, fontFamily: 'Space Mono', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 5px' }}>
          PRONTA
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
        {[
          ['Vias',      fmtNum(cidade.n_vias)],
          ['Segmentos', fmtNum(cidade.n_segmentos)],
          ['Maior comp.', cidade.pct_componente != null ? `${cidade.pct_componente}%` : '—'],
        ].map(([rotulo, valor]) => (
          <div key={rotulo}>
            <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>{rotulo}</div>
            <div style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--text)', marginTop: 2 }}>{valor}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 9, fontFamily: 'Space Mono', color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        cidade_{cidade.slug}_roads_noded · comp. {cidade.componente}<br />
        bbox {bbox.min_lat.toFixed(3)}, {bbox.min_lon.toFixed(3)} → {bbox.max_lat.toFixed(3)}, {bbox.max_lon.toFixed(3)}
      </div>
    </div>
  )
}

/* ── Estatísticas das repetições ──────────────────────────────────────────
   A 1ª execução é descartada (cache frio do Postgres/pgRouting); média e
   desvio padrão amostral (n-1) são calculados sobre as restantes.          */

const fmtMs = v => (v >= 100 ? v.toFixed(0) : v.toFixed(1))

function estatisticas(tempos) {
  const descartada = tempos.length > 1
  const amostra = descartada ? tempos.slice(1) : tempos
  const n = amostra.length
  const media = amostra.reduce((s, t) => s + t, 0) / n
  const desvio = n > 1
    ? Math.sqrt(amostra.reduce((s, t) => s + (t - media) ** 2, 0) / (n - 1))
    : 0
  return { media, desvio, n, descartada, tempos }
}

const tempoTexto = s => `${fmtMs(s.media)} ms ± ${fmtMs(s.desvio)} (n=${s.n})`

/* ── Comparison → PNG ─────────────────────────────────────────────────────
   Desenhado à mão num <canvas> em vez de html2canvas: sem dependência nova,
   sem risco de CORS/tiles e sem depender do layout renderizado.            */

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return }
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y,     x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x,     y + h, r)
  ctx.arcTo(x,     y + h, x,     y,     r)
  ctx.arcTo(x,     y,     x + w, y,     r)
  ctx.closePath()
}

function exportarComparacaoPNG(comparacao, melhorId, rota, repeticoes) {
  const W = 940, H = 470, S = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * S
  canvas.height = H * S
  const ctx = canvas.getContext('2d')
  ctx.scale(S, S)

  const C = {
    bg: '#0d0f14', panel: '#13161e', panel2: '#1a1e28',
    border: '#252a38', text: '#e8eaf0', muted: '#6b7280', accent: '#00e5a0',
  }

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)

  // Header
  ctx.fillStyle = C.accent
  ctx.font = '700 11px "Space Mono", monospace'
  ctx.fillText('OSM ROUTING', 40, 44)
  ctx.fillStyle = C.text
  ctx.font = '600 26px "DM Sans", sans-serif'
  ctx.fillText('Comparação de Algoritmos', 40, 78)
  ctx.fillStyle = C.muted
  ctx.font = '400 12px "DM Sans", sans-serif'
  if (rota) ctx.fillText(rota, 40, 100)
  ctx.font = '400 11px "Space Mono", monospace'
  ctx.fillText(
    repeticoes > 1
      ? `${repeticoes} execuções por algoritmo · 1ª descartada (cache frio) · média ± desvio padrão`
      : '1 execução por algoritmo (sem descarte de cache frio)',
    40, 120)

  ctx.strokeStyle = C.border
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(40, 138); ctx.lineTo(W - 40, 138); ctx.stroke()

  // Cards
  const gap = 20, top = 164, cardH = 226
  const cardW = (W - 80 - gap * (comparacao.length - 1)) / comparacao.length

  comparacao.forEach((item, i) => {
    const meta = ALGORITMOS.find(a => a.id === item.id)
    const x = 40 + i * (cardW + gap)
    const melhor = item.id === melhorId
    const cor = meta?.hex || C.muted

    ctx.fillStyle = melhor ? `${cor}14` : C.panel
    roundRect(ctx, x, top, cardW, cardH, 12); ctx.fill()
    ctx.strokeStyle = melhor ? cor : C.border
    ctx.lineWidth = melhor ? 2 : 1
    roundRect(ctx, x, top, cardW, cardH, 12); ctx.stroke()

    // Título do algoritmo
    ctx.fillStyle = cor
    ctx.font = '700 18px "Space Mono", monospace'
    ctx.fillText(meta?.label || item.id, x + 20, top + 38)

    if (melhor) {
      const badge = 'MAIS RÁPIDO'
      ctx.font = '700 9px "Space Mono", monospace'
      const bw = ctx.measureText(badge).width + 16
      ctx.fillStyle = cor
      roundRect(ctx, x + cardW - bw - 20, top + 22, bw, 20, 10); ctx.fill()
      ctx.fillStyle = '#000'
      ctx.fillText(badge, x + cardW - bw - 12, top + 36)
    }

    if (!item.data) {
      ctx.fillStyle = '#ff6b6b'
      ctx.font = '400 12px "DM Sans", sans-serif'
      const palavras = String(item.erro).split(' ')
      let linha = '', ly = top + 78
      palavras.forEach(p => {
        const teste = linha ? `${linha} ${p}` : p
        if (ctx.measureText(teste).width > cardW - 40) { ctx.fillText(linha, x + 20, ly); ly += 18; linha = p }
        else linha = teste
      })
      if (linha) ctx.fillText(linha, x + 20, ly)
      return
    }

    const s = item.stats
    const linhas = [
      ['Distância',   `${item.data.total_km} km`,       C.text, null],
      ['Tempo médio', `${fmtMs(s.media)} ms`,           melhor ? cor : C.text,
                      `± ${fmtMs(s.desvio)} ms  (n=${s.n})`],
      ['Instruções',  `${item.data.instrucoes.length}`, C.text, null],
    ]
    let y = top + 74
    linhas.forEach(([rotulo, valor, vc, sub]) => {
      ctx.fillStyle = C.muted
      ctx.font = '400 11px "DM Sans", sans-serif'
      ctx.fillText(rotulo.toUpperCase(), x + 20, y)
      ctx.fillStyle = vc
      ctx.font = '700 20px "Space Mono", monospace'
      ctx.fillText(valor, x + 20, y + 26)
      y += 48
      if (sub) {
        ctx.fillStyle = C.muted
        ctx.font = '400 12px "Space Mono", monospace'
        ctx.fillText(sub, x + 20, y - 4)
        y += 16
      }
    })
  })

  // Rodapé
  ctx.fillStyle = C.muted
  ctx.font = '400 11px "Space Mono", monospace'
  ctx.fillText(new Date().toLocaleString('pt-BR'), 40, H - 24)
  const rodape = 'pgRouting + OpenStreetMap Brasil'
  ctx.fillText(rodape, W - 40 - ctx.measureText(rodape).width, H - 24)

  const km = comparacao.find(c => c.id === melhorId)?.data?.total_km
    ?? comparacao.find(c => c.data)?.data?.total_km ?? 0
  const nome = `comparacao_${Math.round(km)}km.png`

  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}

export default function App() {
  const [origem, setOrigem]           = useState('')
  const [destino, setDestino]         = useState('')
  const [origemCoord, setOrigemCoord] = useState(null)
  const [destinoCoord, setDestinoCoord] = useState(null)
  const [algoritmo, setAlgoritmo]     = useState('dijkstra')
  const [modo, setModo]               = useState('unico') // 'unico' | 'comparar'
  const [loading, setLoading]         = useState(false)
  const [resultado, setResultado]     = useState(null)
  const [comparacao, setComparacao]   = useState(null) // [{ id, data, erro, stats }]
  const [repeticoes, setRepeticoes]   = useState('5')  // execuções por algoritmo
  const [progresso, setProgresso]     = useState(null) // { label, i, n }
  const [erro, setErro]               = useState(null)
  const [activeStep, setActiveStep]   = useState(null)
  const [aberto, setAberto]           = useState(null) // accordion: id do algoritmo
  const [tab, setTab]                 = useState('form') // 'form' | 'steps' | 'cidades'

  // Malha detalhada
  const [cidadeNome, setCidadeNome]   = useState('')
  const [cidades, setCidades]         = useState([])
  const [prep, setPrep]               = useState(null) // job de preparo em curso
  const [prepErro, setPrepErro]       = useState(null)

  const algoAtual = ALGORITMOS.find(a => a.id === algoritmo)

  const nRep        = Math.max(1, parseInt(repeticoes, 10) || 1)
  const comparados  = comparacao?.filter(c => c.data) || []
  const melhor      = comparados.length
    ? comparados.reduce((a, b) => (b.stats.media < a.stats.media ? b : a))
    : null
  const melhorId    = melhor?.id ?? null

  /* ── Malha detalhada ─────────────────────────────────────────────────── */

  const carregarCidades = async () => {
    try {
      const res = await fetch(`${API}/cidades`)
      const body = await res.json()
      setCidades(body.cidades || [])
      // Preparo iniciado em outra sessão/aba continua sendo acompanhado aqui
      setPrep(p => (p ? p : (body.em_andamento?.[0] || null)))
    } catch {}
  }

  useEffect(() => { carregarCidades() }, [])

  useEffect(() => {
    if (prep?.status !== 'preparando' || !prep?.slug) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API}/cidade/status?slug=${encodeURIComponent(prep.slug)}`)
        if (!res.ok) return
        const body = await res.json()
        setPrep(body)
        if (body.status !== 'preparando') carregarCidades()
      } catch {}
    }, 3000)
    return () => clearInterval(timer)
  }, [prep?.status, prep?.slug])

  const prepararCidade = async () => {
    const nome = cidadeNome.trim()
    if (nome.length < 3) { setPrepErro('Digite o nome da cidade'); return }
    setPrepErro(null)
    setPrep({ slug: null, nome, status: 'preparando', etapa: 'geocode', progresso: 0, mensagem: 'Iniciando...' })
    try {
      const res = await fetch(`${API}/cidade/preparar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.detail || `Erro ${res.status}`)
      setPrep(body)
    } catch (e) {
      setPrep(null)
      setPrepErro(e.message)
    }
  }

  const trocarModo = (m) => {
    if (m === modo) return
    setModo(m)
    setResultado(null); setComparacao(null); setErro(null)
    setActiveStep(null); setAberto(null); setProgresso(null); setTab('form')
  }

  const fetchRota = async (algo) => {
    const res = await fetch(`${API}/rota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origem_lat: origemCoord.lat, origem_lng: origemCoord.lng, destino_lat: destinoCoord.lat, destino_lng: destinoCoord.lng, algoritmo: algo })
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(body?.detail || `Erro ${res.status}`)
    return body
  }

  const calcular = async () => {
    if (!origemCoord || !destinoCoord) { setErro('Selecione origem e destino nas sugestões'); return }
    setLoading(true); setErro(null)
    setResultado(null); setComparacao(null)
    setActiveStep(null); setAberto(null)

    if (modo === 'unico') {
      try {
        const data = await fetchRota(algoritmo)
        setResultado(data)
        setTab('steps')
      } catch (e) { setErro(e.message) }
      setLoading(false)
      return
    }

    // Modo comparar: nRep execuções por algoritmo, TUDO em sequência — nenhuma
    // requisição concorrente, senão os algoritmos disputam o banco e os tempos
    // ficam distorcidos. Erro isolado por algoritmo.
    const resultados = []
    for (const a of ALGORITMOS) {
      const tempos = []
      let data = null, erroAlgo = null
      for (let i = 0; i < nRep; i++) {
        setProgresso({ label: a.label, i: i + 1, n: nRep })
        try {
          const r = await fetchRota(a.id)
          tempos.push(r.tempo_ms)
          data = r
        } catch (e) { erroAlgo = e.message; break }
      }
      resultados.push({
        id: a.id, data, erro: erroAlgo,
        stats: tempos.length ? estatisticas(tempos) : null,
      })
      setComparacao([...resultados]) // preenche os cards conforme termina
    }
    setProgresso(null)
    if (!resultados.some(r => r.data)) setErro('Nenhum algoritmo retornou uma rota')
    setLoading(false)
  }

  const rotasMapa = modo === 'comparar'
    ? comparados.map(c => ({ ...c, meta: ALGORITMOS.find(a => a.id === c.id) }))
    : []
  const geojsonFit = modo === 'comparar' ? comparados[0]?.data?.geojson : resultado?.geojson

  const stepsCount = modo === 'comparar' ? comparados.length : (resultado ? resultado.instrucoes.length : 0)
  const temResultado = modo === 'comparar' ? !!comparacao : !!resultado

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <style>{`
        @keyframes spin    { to { transform: translateY(-50%) rotate(360deg); } }
        @keyframes fadeIn  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse   { 0%,100%{opacity:1}50%{opacity:.5} }
        @keyframes spinC   { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── SIDEBAR ── */}
      <div style={{ width: 360, background: 'var(--panel)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', zIndex: 100 }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'Space Mono', fontSize: 10, color: 'var(--accent)', letterSpacing: 2, marginBottom: 4 }}>OSM ROUTING</div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Roteamento</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>pgRouting + OpenStreetMap Brasil</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'form',    label: 'Rota' },
            { id: 'steps',   label: `Instruções${stepsCount ? ` (${stepsCount})` : ''}` },
            { id: 'cidades', label: `Cidades${cidades.length ? ` (${cidades.length})` : ''}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '10px 4px', background: 'none', border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--muted)',
              fontFamily: 'DM Sans', fontSize: 12.5, cursor: 'pointer', marginBottom: -1,
              whiteSpace: 'nowrap',
            }}>
              {t.label}
              {t.id === 'cidades' && prep?.status === 'preparando' && (
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginLeft: 5, animation: 'pulse 1.5s ease infinite' }} />
              )}
            </button>
          ))}
        </div>

        {/* ── TAB: FORM ── */}
        {tab === 'form' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AddressInput label="Origem"  value={origem}  onChange={setOrigem}  onSelect={setOrigemCoord}  icon="◉" color="var(--accent)" />
            <AddressInput label="Destino" value={destino} onChange={setDestino} onSelect={setDestinoCoord} icon="◎" color="var(--accent3)" />

            {/* Modo */}
            <div>
              <label style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Modo</label>
              <div style={{ display: 'flex', gap: 4, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
                {[{ id: 'unico', label: 'Único' }, { id: 'comparar', label: 'Comparar' }].map(m => (
                  <button key={m.id} onClick={() => trocarModo(m.id)} style={{
                    flex: 1, padding: '7px 4px', border: 'none', borderRadius: 6,
                    background: modo === m.id ? 'var(--accent)' : 'transparent',
                    color: modo === m.id ? '#000' : 'var(--muted)',
                    fontWeight: modo === m.id ? 600 : 400,
                    cursor: 'pointer', fontSize: 12, fontFamily: 'Space Mono', transition: 'all 0.2s',
                  }}>{m.label}</button>
                ))}
              </div>
            </div>

            {/* Repetições — só no modo comparar */}
            {modo === 'comparar' && (
              <div>
                <label style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Repetições</label>
                <input type="number" min={1} step={1} value={repeticoes}
                  onChange={e => setRepeticoes(e.target.value)}
                  onBlur={() => setRepeticoes(String(Math.max(1, parseInt(repeticoes, 10) || 1)))}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'Space Mono' }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
                  {nRep > 1
                    ? <>Cada algoritmo roda {nRep}×. A 1ª execução é descartada (cache frio); média ± desvio padrão sobre as {nRep - 1} restantes.</>
                    : <>Com 1 repetição não há descarte de cache frio — o tempo é de uma única execução (n=1).</>}
                </p>
              </div>
            )}

            {/* Algorithm */}
            <div>
              <label style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Algoritmo</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {ALGORITMOS.map(a => {
                  const sel = modo === 'comparar' || algoritmo === a.id
                  return (
                    <button key={a.id} onClick={() => setAlgoritmo(a.id)} disabled={modo === 'comparar'} style={{
                      flex: 1, padding: '8px 4px', border: `1px solid ${sel ? a.color : 'var(--border)'}`,
                      borderRadius: 8, background: sel ? `${a.color}15` : 'var(--panel2)',
                      color: sel ? a.color : 'var(--muted)',
                      cursor: modo === 'comparar' ? 'default' : 'pointer',
                      fontSize: 12, fontFamily: 'Space Mono', transition: 'all 0.2s'
                    }}>{a.label}</button>
                  )
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                {modo === 'comparar' ? 'Os três algoritmos rodam em sequência, um de cada vez' : algoAtual?.desc}
              </p>
            </div>

            <button onClick={calcular} disabled={loading} style={{
              padding: 13, background: loading ? 'var(--panel2)' : 'var(--accent)',
              color: loading ? 'var(--muted)' : '#000', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}>
              {loading
                ? <><div style={{ width: 14, height: 14, border: '2px solid #333', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spinC 0.6s linear infinite' }} />
                    {progresso ? `${progresso.label} ${progresso.i}/${progresso.n}` : (modo === 'comparar' ? 'Comparando...' : 'Calculando...')}</>
                : (modo === 'comparar' ? `⇄ Comparar (${nRep}× cada)` : '→ Calcular Rota')}
            </button>

            {erro && <div style={{ padding: '12px 14px', background: '#ff3b3b15', border: '1px solid #ff3b3b40', borderRadius: 8, fontSize: 13, color: '#ff6b6b' }}>⚠ {erro}</div>}

            {/* Resultado — modo único */}
            {modo === 'unico' && resultado && (
              <div style={{ padding: 16, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 10, animation: 'fadeIn 0.3s ease' }}>
                <div style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--muted)', marginBottom: 12, letterSpacing: 1 }}>RESULTADO</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Algoritmo</div>
                    <div style={{ fontSize: 13, fontFamily: 'Space Mono', color: algoAtual?.color, marginTop: 2 }}>{resultado.algoritmo}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Distância</div>
                    <div style={{ fontSize: 13, fontFamily: 'Space Mono', color: 'var(--text)', marginTop: 2 }}>{resultado.total_km} km</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Tempo</div>
                    <div style={{ fontSize: 13, fontFamily: 'Space Mono', color: 'var(--accent)', marginTop: 2 }}>{resultado.tempo_ms} ms</div>
                  </div>
                </div>
                {resultado.malha && <MalhaBadge malha={resultado.malha} />}
                <button onClick={() => setTab('steps')} style={{ marginTop: 12, width: '100%', padding: '8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'Space Mono' }}>
                  Ver instruções →
                </button>
              </div>
            )}

            {/* Quadro comparativo — modo comparar */}
            {modo === 'comparar' && comparacao && (
              <div style={{ padding: 16, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 10, animation: 'fadeIn 0.3s ease' }}>
                <div style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--muted)', marginBottom: 4, letterSpacing: 1 }}>COMPARAÇÃO</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
                  {nRep > 1 ? `${nRep} execuções · 1ª descartada` : '1 execução · sem descarte'}
                </div>

                {comparados[0]?.data?.malha && (
                  <div style={{ marginTop: -4, marginBottom: 12 }}>
                    <MalhaBadge malha={comparados[0].data.malha} />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {comparacao.map(item => {
                    const meta = ALGORITMOS.find(a => a.id === item.id)
                    const best = item.id === melhorId
                    return (
                      <div key={item.id} style={{
                        padding: '10px 8px', borderRadius: 8,
                        background: best ? `${meta.color}15` : 'var(--panel)',
                        border: `1px solid ${best ? meta.color : 'var(--border)'}`,
                        position: 'relative',
                      }}>
                        <div style={{ fontSize: 12, fontFamily: 'Space Mono', color: meta.color, fontWeight: 700 }}>{meta.label}</div>
                        {!item.data ? (
                          <div style={{ fontSize: 10, color: '#ff6b6b', marginTop: 8, lineHeight: 1.35, wordBreak: 'break-word' }}>⚠ {item.erro}</div>
                        ) : (
                          <>
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Dist.</div>
                              <div style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--text)', whiteSpace: 'nowrap' }}>{item.data.total_km} km</div>
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Tempo médio</div>
                              <div style={{ fontSize: 11, fontFamily: 'Space Mono', color: best ? meta.color : 'var(--text)', fontWeight: best ? 700 : 400, whiteSpace: 'nowrap' }}>{fmtMs(item.stats.media)} ms</div>
                              <div style={{ fontSize: 9, fontFamily: 'Space Mono', color: 'var(--muted)', whiteSpace: 'nowrap', marginTop: 1 }}>± {fmtMs(item.stats.desvio)}</div>
                              <div style={{ fontSize: 9, fontFamily: 'Space Mono', color: 'var(--muted)', whiteSpace: 'nowrap' }}>n={item.stats.n}</div>
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Instr.</div>
                              <div style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--text)' }}>{item.data.instrucoes.length}</div>
                            </div>
                            {item.erro && (
                              <div style={{ fontSize: 9, color: '#ff6b6b', marginTop: 6, lineHeight: 1.3, wordBreak: 'break-word' }}>⚠ {item.erro}</div>
                            )}
                            {best && (
                              <div style={{ marginTop: 8, fontSize: 8, fontFamily: 'Space Mono', letterSpacing: 0.5, color: '#000', background: meta.color, borderRadius: 4, padding: '2px 4px', textAlign: 'center' }}>
                                MAIS RÁPIDO
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {comparados.length > 0 && !loading && (
                  <>
                    <button onClick={() => exportarComparacaoPNG(comparacao, melhorId, [origem, destino].filter(Boolean).join('  →  '), nRep)}
                      style={{ marginTop: 12, width: '100%', padding: '9px', background: 'var(--panel)', border: '1px solid var(--accent)', borderRadius: 8, color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'Space Mono' }}>
                      ⤓ Salvar comparação (PNG)
                    </button>
                    <button onClick={() => setTab('steps')} style={{ marginTop: 8, width: '100%', padding: '8px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Space Mono' }}>
                      Ver instruções →
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: STEPS ── */}
        {tab === 'steps' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!temResultado ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🗺</div>
                Calcule uma rota para ver as instruções
              </div>
            ) : modo === 'unico' ? (
              <>
                {/* Summary bar */}
                <div style={{ padding: '12px 16px', background: 'var(--panel2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{resultado.instrucoes.length} passos</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 12, fontFamily: 'Space Mono', color: 'var(--text)' }}>{resultado.total_km} km</span>
                    <span style={{ fontSize: 12, fontFamily: 'Space Mono', color: 'var(--accent)' }}>{resultado.tempo_ms} ms</span>
                  </div>
                </div>
                {/* Steps list */}
                <div style={{ padding: '8px' }}>
                  {resultado.instrucoes.map((step, i) => (
                    <InstructionItem
                      key={i} step={step} index={i}
                      active={activeStep === i}
                      onClick={setActiveStep}
                    />
                  ))}
                </div>
              </>
            ) : (
              /* Accordion — um por algoritmo, todos colapsados por padrão */
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {comparacao.map(item => {
                  const meta = ALGORITMOS.find(a => a.id === item.id)
                  const open = aberto === item.id
                  const best = item.id === melhorId
                  return (
                    <div key={item.id} style={{ border: `1px solid ${open || best ? meta.color : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--panel2)' }}>
                      <div onClick={() => setAberto(open ? null : item.id)}
                        style={{ padding: '11px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: open ? `${meta.color}12` : 'transparent', transition: 'background 0.15s' }}
                        onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#ffffff08' }}
                        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}>
                        <span style={{ fontSize: 11, color: meta.color, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontFamily: 'Space Mono', color: meta.color, fontWeight: 700 }}>
                            {meta.label}{best ? ' ★' : ''}
                          </div>
                          {!item.data
                            ? <div style={{ fontSize: 10, color: '#ff6b6b', marginTop: 3, wordBreak: 'break-word' }}>⚠ {item.erro}</div>
                            : <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontFamily: 'Space Mono' }}>
                                {item.data.total_km} km · {tempoTexto(item.stats)} · {item.data.instrucoes.length} passos
                              </div>}
                        </div>
                      </div>
                      {open && item.data && (
                        <div style={{ padding: '4px 6px 8px', borderTop: '1px solid var(--border)', animation: 'fadeIn 0.2s ease' }}>
                          {item.data.instrucoes.map((step, i) => (
                            <InstructionItem
                              key={i} step={step} index={i}
                              active={activeStep === `${item.id}-${i}`}
                              onClick={() => setActiveStep(`${item.id}-${i}`)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: CIDADES ── */}
        {tab === 'cidades' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              A malha nacional só tem as vias principais. Prepare uma cidade para rotear
              pelas ruas locais: as vias do bbox viram uma tabela própria, os cruzamentos
              são conectados e a topologia é montada. Leva alguns minutos.
            </p>

            {/* Nome + preparar */}
            <div>
              <label style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                <span style={{ color: 'var(--accent)' }}>◆</span> Cidade
              </label>
              <input value={cidadeNome}
                onChange={e => setCidadeNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && prep?.status !== 'preparando') prepararCidade() }}
                placeholder="Ex.: Monte Alegre de Minas"
                style={{ width: '100%', padding: '10px 14px', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'DM Sans' }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <button onClick={prepararCidade} disabled={prep?.status === 'preparando'} style={{
              padding: 13,
              background: prep?.status === 'preparando' ? 'var(--panel2)' : 'var(--accent)',
              color: prep?.status === 'preparando' ? 'var(--muted)' : '#000',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
              cursor: prep?.status === 'preparando' ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {prep?.status === 'preparando'
                ? <><div style={{ width: 14, height: 14, border: '2px solid #333', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spinC 0.6s linear infinite' }} />
                    Preparando...</>
                : '⚙ Preparar cidade'}
            </button>

            {prepErro && (
              <div style={{ padding: '12px 14px', background: '#ff3b3b15', border: '1px solid #ff3b3b40', borderRadius: 8, fontSize: 13, color: '#ff6b6b' }}>⚠ {prepErro}</div>
            )}

            {/* Progresso do preparo */}
            {prep && (
              <div style={{ padding: 16, background: 'var(--panel2)', border: `1px solid ${prep.status === 'erro' ? '#ff3b3b40' : 'var(--border)'}`, borderRadius: 10, animation: 'fadeIn 0.3s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {prep.nome}
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'Space Mono', color: prep.status === 'erro' ? '#ff6b6b' : 'var(--accent)' }}>
                    {ETAPA_LABEL[prep.etapa] || prep.etapa}
                  </span>
                </div>

                {prep.status !== 'erro' && (
                  <>
                    <div style={{ height: 6, background: 'var(--panel)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${prep.progresso || 0}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{prep.mensagem}</span>
                      <span style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--accent)' }}>{prep.progresso || 0}%</span>
                    </div>
                  </>
                )}

                {prep.erro && (
                  <div style={{ fontSize: 12, color: '#ff6b6b', lineHeight: 1.45, wordBreak: 'break-word' }}>⚠ {prep.erro}</div>
                )}

                {(prep.n_vias != null || prep.n_segmentos != null) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 12 }}>
                    {[
                      ['Vias',      fmtNum(prep.n_vias)],
                      ['Segmentos', fmtNum(prep.n_segmentos)],
                      ['Maior comp.', prep.pct_componente != null ? `${prep.pct_componente}%` : '—'],
                    ].map(([rotulo, valor]) => (
                      <div key={rotulo}>
                        <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>{rotulo}</div>
                        <div style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--text)', marginTop: 2 }}>{valor}</div>
                      </div>
                    ))}
                  </div>
                )}

                {prep.aviso && (
                  <div style={{ fontSize: 10, color: 'var(--accent3)', marginTop: 8, lineHeight: 1.4 }}>ⓘ {prep.aviso}</div>
                )}
              </div>
            )}

            {/* Cidades disponíveis */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Disponíveis
                </label>
                <button onClick={carregarCidades} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontFamily: 'Space Mono', cursor: 'pointer' }}>
                  ↻ atualizar
                </button>
              </div>

              {cidades.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
                  Nenhuma cidade preparada ainda
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cidades.map(c => <CidadeCard key={c.slug} cidade={c} />)}
                </div>
              )}

              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.45 }}>
                Rotas com origem e destino dentro do bbox de uma cidade preparada usam
                automaticamente a malha detalhada dela.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── MAP ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={[-15.7, -47.9]} zoom={5} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />

          { modo === 'unico' && resultado?.geojson && (
            <>
              <GeoJSON key={`u-halo-${resultado.tempo_ms}`} data={resultado.geojson}
                style={{ color: algoAtual?.color || '#00e5a0', weight: 12, opacity: 0.25 }} />
              <GeoJSON key={`u-${resultado.tempo_ms}`} data={resultado.geojson}
                style={{ color: algoAtual?.color || '#00e5a0', weight: 5, opacity: 1 }} />
            </>
          )}

        {modo === 'comparar' && rotasMapa.map(r => (
          <GeoJSON key={`c-${r.id}-${r.data.tempo_ms}`} data={r.data.geojson}
            style={{ color: r.meta.hex, weight: r.meta.weight + 2, opacity: 1, dashArray: r.meta.dash }} />
        ))}

          {geojsonFit && <FitBounds geojson={geojsonFit} />}
        </MapContainer>

        {/* Legenda — modo comparar */}
        {modo === 'comparar' && comparados.length > 0 && (
          <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 500, background: 'rgba(19,22,30,0.92)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', backdropFilter: 'blur(6px)' }}>
            <div style={{ fontSize: 9, fontFamily: 'Space Mono', color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>ROTAS</div>
            {rotasMapa.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ width: 22, height: Math.max(3, r.meta.weight / 1.6), background: r.meta.hex, opacity: Math.max(0.5, r.meta.opacity), borderRadius: 2, display: 'inline-block' }} />
                <span style={{ fontSize: 11, fontFamily: 'Space Mono', color: 'var(--text)' }}>{r.meta.label}</span>
                <span style={{ fontSize: 10, fontFamily: 'Space Mono', color: r.id === melhorId ? r.meta.hex : 'var(--muted)', marginLeft: 'auto' }}>{tempoTexto(r.stats)}</span>
              </div>
            ))}
          </div>
        )}

        {!temResultado && !loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🗺</div>
            <div style={{ fontFamily: 'Space Mono', fontSize: 12, color: 'var(--muted)', background: 'rgba(13,15,20,0.8)', padding: '8px 16px', borderRadius: 8 }}>
              Digite os endereços e calcule a rota
            </div>
          </div>
        )}

        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spinC 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: 'Space Mono', fontSize: 12, color: 'var(--accent)', background: 'rgba(13,15,20,0.8)', padding: '8px 16px', borderRadius: 8, animation: 'pulse 1.5s ease infinite' }}>
              {modo === 'comparar'
                ? (progresso ? `${progresso.label} — execução ${progresso.i}/${progresso.n}` : 'Rodando os 3 algoritmos...')
                : 'Calculando rota...'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
