import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  Train, MapPin, Clock, MessageSquare, TrendingDown, Users, Search,
  Send, Mic, MicOff, AlertCircle, Loader, Navigation,
  Zap, Volume2, VolumeX
} from 'lucide-react'
import * as api from './api'

// ── Design tokens ─────────────────────────────────────────────
const T = {
  bg:      '#F5F2ED',
  bgDeep:  '#EDEAE4',
  ink:     '#1a1a1a',
  muted:   '#888888',
  rule:    '#D9D5CE',
  red:     '#FF4B2B',
  green:   '#1D9E75',
  amber:   '#F5A623',
  sidebar: '#1a1a1a',
  display: "'Syne', sans-serif",
  mono:    "'DM Mono', monospace",
}

// ── Constants ─────────────────────────────────────────────────
const CROWD_CONFIG = {
  sparse  : { bg: '#1D9E75', text: '#fff',    label: 'SPARSE'   },
  moderate: { bg: '#F5A623', text: '#412402', label: 'MODERATE' },
  crowded : { bg: '#1a1a1a', text: '#fff',    label: 'CROWDED'  },
}
const DAY_NAMES   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Helpers ───────────────────────────────────────────────────
const CrowdChip = ({ level, size = 'md' }) => {
  const c  = CROWD_CONFIG[level] || CROWD_CONFIG.moderate
  const sz = size === 'sm'
    ? { fontSize: '10px', padding: '3px 10px' }
    : { fontSize: '11px', padding: '4px 12px' }
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontFamily: T.mono, fontWeight: 700, letterSpacing: '.1em',
      borderRadius: '2px', whiteSpace: 'nowrap', ...sz,
    }}>
      {c.label}
    </span>
  )
}

const Label = ({ children, style }) => (
  <div style={{
    fontFamily: T.mono, fontSize: '10px', letterSpacing: '.14em',
    color: T.muted, marginBottom: '8px', textTransform: 'uppercase', ...style,
  }}>
    {children}
  </div>
)

const HRule = ({ thick, style }) => (
  <div style={{ height: thick ? '2px' : '1px', background: thick ? T.ink : T.rule, ...style }} />
)

const Spinner = ({ light }) => (
  <Loader size={14} style={{ animation: 'spin 1s linear infinite', color: light ? '#fff' : T.red }} />
)

// ── Map (Leaflet) ─────────────────────────────────────────────
const StationMap = ({ stations, selected, result }) => {
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)
  const markersRef  = useRef([])

  useEffect(() => {
    if (!window.L || mapInstance.current) return
    mapInstance.current = window.L.map(mapRef.current).setView([40.7128, -74.006], 11)
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance.current)
  }, [])

  useEffect(() => {
    if (!mapInstance.current || !window.L) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (!result) return

    const { station_lat: lat, station_lon: lon, station, crowd } = result
    if (lat && lon) {
      const color = CROWD_CONFIG[crowd?.level]?.bg || T.red
      const icon  = window.L.divIcon({
        html: `<div style="width:14px;height:14px;background:${color};border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      })
      const marker = window.L.marker([lat, lon], { icon })
        .addTo(mapInstance.current)
        .bindPopup(`<b>${station}</b><br/>Footfall: ${result.footfall?.toFixed(0)}<br/>Level: ${crowd?.level}`)
        .openPopup()
      markersRef.current.push(marker)
      mapInstance.current.setView([lat, lon], 14)
    }
    result.alternatives?.forEach(alt => {
      if (!alt.lat || !alt.lon) return
      const c2   = CROWD_CONFIG[alt.crowd_level]?.bg || T.muted
      const icon2 = window.L.divIcon({
        html: `<div style="width:10px;height:10px;background:${c2};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5],
      })
      const m = window.L.marker([alt.lat, alt.lon], { icon: icon2 })
        .addTo(mapInstance.current)
        .bindPopup(`<b>${alt.station}</b><br/>${alt.distance_km} km`)
      markersRef.current.push(m)
    })
  }, [result])

  return <div ref={mapRef} style={{ height: '100%', width: '100%', minHeight: '200px', zIndex: 0 }} />
}

// ── Voice INPUT hook ──────────────────────────────────────────
const useVoiceInput = (onResult) => {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const supported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const toggle = useCallback(() => {
    if (!supported) return
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    recRef.current = new SR()
    recRef.current.continuous = false
    recRef.current.interimResults = false
    recRef.current.lang = 'en-US'
    recRef.current.onresult = (e) => { onResult(e.results[0][0].transcript); setListening(false) }
    recRef.current.onerror = () => setListening(false)
    recRef.current.onend   = () => setListening(false)
    recRef.current.start(); setListening(true)
  }, [listening, onResult, supported])

  return { listening, toggle, supported }
}

// ══════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  const now = new Date()

  const [tab,       setTab]       = useState('predict')
  const [stations,  setStations]  = useState([])
  const [stFilter,  setStFilter]  = useState('')
  const [station,   setStation]   = useState('')
  const [hour,      setHour]      = useState(now.getHours())
  const [dow,       setDow]       = useState(now.getDay() === 0 ? 6 : now.getDay() - 1)
  const [month,     setMonth]     = useState(now.getMonth())
  const [isWeekend, setIsWeekend] = useState(now.getDay() === 0 || now.getDay() === 6 ? 1 : 0)
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)
  const [error,     setError]     = useState('')
  const [messages,  setMessages]  = useState([{
    role: 'assistant',
    text: 'Ask me about NYC subway crowds in any language.\n"Is Times Sq busy at 6pm?"\n"¿Está llena la 34th St a las 8am?"\n"Est-ce bondé à Canal St le matin?"',
  }])
  const [chatInput, setChatInput] = useState('')
  const chatEnd = useRef(null)
  const [isMuted, setIsMuted]     = useState(false)
  const synthRef = useRef(window.speechSynthesis)

  const speakText = useCallback((text) => {
    if (isMuted || !window.speechSynthesis) return
    synthRef.current.cancel()
    const clean = text
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[•*_~`#]/g, '')
      .replace(/\n+/g, '. ')
      .trim()
    if (!clean) return
    const u = new SpeechSynthesisUtterance(clean)
    const v = synthRef.current.getVoices()
    const pref = v.find(x => x.lang.startsWith('en') && x.name.toLowerCase().includes('natural'))
      || v.find(x => x.lang.startsWith('en')) || v[0]
    if (pref) u.voice = pref
    synthRef.current.speak(u)
  }, [isMuted])

  useEffect(() => () => synthRef.current.cancel(), [])
  useEffect(() => { synthRef.current.cancel() }, [tab])

  const voice = useVoiceInput((text) => setChatInput(prev => prev + text))

  useEffect(() => {
    api.getStations()
      .then(r => {
        setStations(r.data.stations)
        if (r.data.stations.length) setStation(r.data.stations[0].name)
      })
      .catch(() => setError('Backend not running. Start uvicorn first.'))
  }, [])

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { setIsWeekend(dow >= 5 ? 1 : 0) }, [dow])

  const filteredStations = stations.filter(s =>
    s.name.toLowerCase().includes(stFilter.toLowerCase())
  )

  const handlePredict = async () => {
    if (!station) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await api.predict(station, hour, dow, month + 1, isWeekend)
      setResult({ type: 'predict', ...r.data })
    } catch (e) { setError(e.response?.data?.detail || 'Prediction failed.') }
    finally { setLoading(false) }
  }

  const handleRecommend = async () => {
    if (!station) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await api.recommend(station, hour, dow, month + 1, isWeekend)
      setResult({ type: 'recommend', ...r.data })
    } catch (e) { setError(e.response?.data?.detail || 'Recommendation failed.') }
    finally { setLoading(false) }
  }

  const handleChat = async () => {
    const msg = chatInput.trim()
    if (!msg) return
    setChatInput('')
    setMessages(m => [...m, { role: 'user', text: msg }])
    setLoading(true)
    try {
      const r = await api.chat(msg, station, hour, dow, month + 1, isWeekend)
      const reply = r.data.message
      setMessages(m => [...m, { role: 'assistant', text: reply }])
      speakText(reply)
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Error — check GEMINI_API_KEY in .env' }])
    } finally { setLoading(false) }
  }

  const actionLabel  = tab === 'predict' ? '→ PREDICT NOW' : tab === 'recommend' ? '→ GET RECOMMENDATION' : null
  const handleAction = tab === 'predict' ? handlePredict : handleRecommend

  // ── Sidebar ───────────────────────────────────────────────
  const Sidebar = () => (
    <div style={{
      width: '300px', flexShrink: 0,
      background: T.sidebar, color: T.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: T.mono, overflowY: 'auto',
    }}>
      {/* Station */}
      <div style={{ padding: '22px 20px 0' }}>
        <Label style={{ color: '#666', marginBottom: '10px' }}>STATION</Label>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '8px' }}>
          <Search size={12} color="#555" />
          <input
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: '#777', fontFamily: T.mono, fontSize: '12px', width: '100%',
            }}
            placeholder="Search..."
            value={stFilter}
            onChange={e => setStFilter(e.target.value)} />
        </div>

        {/* Station list */}
        <div>
          {filteredStations.slice(0, 7).map(s => (
            <div key={s.name} onClick={() => setStation(s.name)}
              style={{
                padding: '9px 10px', fontSize: '12px', cursor: 'pointer',
                borderLeft: s.name === station ? `3px solid ${T.red}` : '3px solid transparent',
                color: s.name === station ? '#F5F2ED' : '#666',
                fontWeight: s.name === station ? 500 : 400,
                transition: 'color 0.15s',
              }}>
              {s.name}
            </div>
          ))}
          {filteredStations.length > 7 && (
            <div style={{ padding: '6px 10px', fontSize: '10px', color: '#444' }}>
              +{filteredStations.length - 7} more — refine search
            </div>
          )}
        </div>
      </div>

      <HRule style={{ margin: '18px 0', borderColor: '#2a2a2a' }} />

      {/* Hour */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
          <Label style={{ color: '#666', marginBottom: 0 }}>HOUR</Label>
          <span style={{ fontFamily: T.mono, fontSize: '18px', fontWeight: 700, color: T.red }}>
            {String(hour).padStart(2, '0')}:00
          </span>
        </div>
        <input type="range" min={0} max={23} value={hour}
          onChange={e => setHour(parseInt(e.target.value))}
          className="red-range"
          style={{ width: '100%', marginBottom: '6px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#444' }}>
          <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>

      <HRule style={{ margin: '18px 0', borderColor: '#2a2a2a' }} />

      {/* Day + Month */}
      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div>
          <Label style={{ color: '#666' }}>DAY</Label>
          <select
            style={{
              background: '#111', border: 'none', color: T.bg,
              fontFamily: T.mono, fontSize: '13px', fontWeight: 500,
              padding: '9px 10px', width: '100%', outline: 'none',
            }}
            value={dow} onChange={e => setDow(parseInt(e.target.value))}>
            {DAY_NAMES.map((d, i) => (
              <option key={i} value={i} style={{ background: '#111' }}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <Label style={{ color: '#666' }}>MONTH</Label>
          <select
            style={{
              background: '#111', border: 'none', color: T.bg,
              fontFamily: T.mono, fontSize: '13px', fontWeight: 500,
              padding: '9px 10px', width: '100%', outline: 'none',
            }}
            value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTH_FULL.map((m, i) => (
              <option key={i} value={i} style={{ background: '#111' }}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Action button */}
      {actionLabel && (
        <div style={{ padding: '20px 20px 0' }}>
          <button onClick={handleAction} disabled={loading || !station}
            style={{
              background: loading || !station ? '#333' : T.red,
              border: 'none', color: '#fff',
              fontFamily: T.mono, fontWeight: 700,
              fontSize: '13px', letterSpacing: '.1em',
              padding: '14px', width: '100%',
              cursor: loading || !station ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              borderRadius: '2px',
            }}>
            {loading ? <Spinner light /> : actionLabel}
          </button>
        </div>
      )}

      <HRule style={{ margin: '22px 0 0', borderColor: '#2a2a2a' }} />

      {/* View tabs */}
      <div style={{ padding: '16px 20px' }}>
        <Label style={{ color: '#666' }}>VIEW</Label>
        {[
          { id: 'predict',   label: 'PREDICT'   },
          { id: 'recommend', label: 'RECOMMEND' },
          { id: 'chat',      label: 'AI CHAT'   },
        ].map(({ id, label }) => (
          <div key={id} onClick={() => { setTab(id); setResult(null); setError('') }}
            style={{
              fontFamily: T.mono, fontSize: '12px', fontWeight: 700,
              letterSpacing: '.08em', padding: '9px 12px', cursor: 'pointer',
              background: tab === id ? T.red : 'transparent',
              color: tab === id ? '#fff' : '#555',
              borderRadius: '2px', marginBottom: '2px',
              transition: 'background 0.15s, color 0.15s',
            }}>
            {label}
          </div>
        ))}
      </div>
    </div>
  )

  // ── Predict right panel ───────────────────────────────────
  const PredictPanel = () => {
    const pf   = result?.prediction?.predicted_footfall
    const mean = result?.prediction?.station_mean
    const abovePct = pf && mean ? Math.round((pf / mean - 1) * 100) : null

    // Generate hourly chart data (mock distribution based on result)
    const hourlyData = Array.from({ length: 24 }, (_, h) => {
      const base = mean || 5000
      const curve = Math.sin((h - 4) * Math.PI / 12) * 0.5 + 0.5
      const val = Math.round(base * (0.3 + curve * 0.9))
      return { hour: `${h}h`, val, h }
    })

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Hero banner */}
        {result?.type === 'predict' ? (
          <div style={{ background: T.red, padding: '26px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
            <div>
              <Label style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '6px' }}>PREDICTED FOOTFALL</Label>
              <div style={{ fontFamily: T.display, fontSize: '62px', fontWeight: 800, color: '#fff', letterSpacing: '-3px', lineHeight: 1 }}>
                {pf?.toLocaleString()}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                {result.prediction?.station} · {String(hour).padStart(2,'0')}:00 · {DAY_NAMES[dow].slice(0,3).toUpperCase()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <CrowdChip level={result.crowd?.level} />
              <div style={{ marginTop: '16px' }}>
                <Label style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>CAPACITY</Label>
                <div style={{ fontFamily: T.display, fontSize: '42px', fontWeight: 800, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>
                  {result.crowd?.capacity_pct}%
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: T.ink, padding: '28px 32px', flexShrink: 0 }}>
            <Label style={{ color: '#555' }}>FOOTFALL PREDICTION</Label>
            <div style={{ fontFamily: T.display, fontSize: '28px', fontWeight: 800, color: loading ? '#333' : '#2a2a2a', letterSpacing: '-1px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {loading ? 'ANALYSING...' : 'SELECT A STATION & PREDICT →'}
              {loading && <Spinner light />}
            </div>
          </div>
        )}

        {result?.type === 'predict' && (
          <>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${T.rule}`, flexShrink: 0 }}>
              <div style={{ padding: '18px 28px', borderRight: `1px solid ${T.rule}` }}>
                <Label>STATION AVERAGE</Label>
                <div style={{ fontFamily: T.display, fontSize: '38px', fontWeight: 800, letterSpacing: '-2px', color: T.ink, lineHeight: 1 }}>
                  {mean?.toLocaleString()}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: '11px', color: T.muted, marginTop: '5px' }}>passengers / hr</div>
              </div>
              <div style={{ padding: '18px 28px' }}>
                <Label>ABOVE AVERAGE</Label>
                <div style={{ fontFamily: T.display, fontSize: '38px', fontWeight: 800, letterSpacing: '-2px', color: T.red, lineHeight: 1 }}>
                  {abovePct != null ? `+${abovePct}%` : '—'}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: '11px', color: T.muted, marginTop: '5px' }}>
                  vs typical {DAY_NAMES[dow].toLowerCase()}
                </div>
              </div>
            </div>

            {/* Hourly chart */}
            <div style={{ padding: '18px 28px', borderBottom: `1px solid ${T.rule}`, flexShrink: 0 }}>
              <Label>HOURLY DISTRIBUTION TODAY</Label>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={hourlyData} margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="0" stroke={T.rule} vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: T.muted, fontFamily: T.mono }}
                    tickFormatter={(v) => v === `${hour}h` ? v : v}
                    axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={v => [`${v.toLocaleString()} pax`, 'Footfall']}
                    contentStyle={{ background: T.ink, border: 'none', fontFamily: T.mono, fontSize: '11px', color: T.bg, borderRadius: '2px' }} />
                  <Bar dataKey="val" radius={[1, 1, 0, 0]} maxBarSize={22}>
                    {hourlyData.map((entry, i) => (
                      <Cell key={i} fill={entry.h === hour ? T.red : T.rule} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Bottom: alternatives + map */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: '280px' }}>
              {/* Quieter nearby placeholder */}
              <div style={{ padding: '18px 28px', borderRight: `1px solid ${T.rule}` }}>
                <Label>QUIETER NEARBY</Label>
                <div style={{ fontFamily: T.mono, fontSize: '12px', color: T.muted, paddingTop: '8px' }}>
                  Use the Recommend tab to find nearby quieter stations.
                </div>
              </div>
              {/* Map */}
              <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column' }}>
                <Label>STATION MAP</Label>
                <div style={{ flex: 1, minHeight: '200px' }}>
                  <StationMap stations={stations} selected={station} result={{
                    station_lat: stations.find(s => s.name === station)?.lat,
                    station_lon: stations.find(s => s.name === station)?.lon,
                    station,
                    crowd: result.crowd,
                    footfall: pf,
                    alternatives: [],
                  }} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Recommend right panel ─────────────────────────────────
  const RecommendPanel = () => {
    const pf = result?.footfall
    const hourlyData = result?.best_time?.all_predictions
      ? Object.entries(result.best_time.all_predictions).map(([h, v]) => ({ hour: `${h}h`, val: Math.round(v), h: parseInt(h) }))
      : []

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {result?.type === 'recommend' ? (
          <>
            {/* Hero */}
            <div style={{ background: T.red, padding: '26px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <Label style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '6px' }}>CURRENT FOOTFALL</Label>
                <div style={{ fontFamily: T.display, fontSize: '62px', fontWeight: 800, color: '#fff', letterSpacing: '-3px', lineHeight: 1 }}>
                  {pf?.toFixed(0)}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                  {result.station} · {result.hour_used}:00
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <CrowdChip level={result.crowd?.level} />
                <div style={{ marginTop: '16px' }}>
                  <Label style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>BEST HOUR</Label>
                  <div style={{ fontFamily: T.display, fontSize: '42px', fontWeight: 800, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>
                    {result.best_time?.best_hour}:00
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: '11px', color: 'rgba(255,255,255,0.65)', marginTop: '4px' }}>
                    −{result.best_time?.pct_reduction}% less crowded
                  </div>
                </div>
              </div>
            </div>

            {/* Chart */}
            {hourlyData.length > 0 && (
              <div style={{ padding: '18px 28px', borderBottom: `1px solid ${T.rule}`, flexShrink: 0 }}>
                <Label>HOURLY DISTRIBUTION</Label>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={hourlyData} margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" stroke={T.rule} vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: T.muted, fontFamily: T.mono }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      formatter={v => [`${v.toLocaleString()} pax`, 'Footfall']}
                      contentStyle={{ background: T.ink, border: 'none', fontFamily: T.mono, fontSize: '11px', color: T.bg, borderRadius: '2px' }} />
                    <Bar dataKey="val" radius={[1, 1, 0, 0]} maxBarSize={22}>
                      {hourlyData.map((entry, i) => (
                        <Cell key={i}
                          fill={entry.h === result.best_time?.best_hour ? T.green
                              : entry.h === result.hour_used ? T.red
                              : T.rule} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: '16px', fontFamily: T.mono, fontSize: '10px', color: T.muted, marginTop: '6px' }}>
                  {[{ c: T.green, l: 'Best' }, { c: T.red, l: 'Requested' }, { c: T.rule, l: 'Other' }].map(({ c, l }) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '10px', height: '10px', background: c, display: 'inline-block', borderRadius: '1px' }} />{l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Alternatives + Map */}
            <div style={{ display: 'grid', gridTemplateColumns: result.alternatives?.length > 0 ? '1fr 1fr' : '1fr', flex: 1, minHeight: '260px' }}>
              {result.alternatives?.length > 0 && (
                <div style={{ padding: '18px 28px', borderRight: `1px solid ${T.rule}` }}>
                  <Label>QUIETER NEARBY</Label>
                  {result.alternatives.map((alt, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.rule}`, padding: '12px 0' }}>
                      <div>
                        <div style={{ fontFamily: T.display, fontSize: '15px', fontWeight: 700, color: T.ink }}>{alt.station}</div>
                        <div style={{ fontFamily: T.mono, fontSize: '10px', color: T.muted, marginTop: '3px' }}>
                          {alt.distance_km} km · −{alt.pct_less_crowded}%
                        </div>
                      </div>
                      <CrowdChip level={alt.crowd_level} size="sm" />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column' }}>
                <Label>STATION MAP</Label>
                <div style={{ flex: 1 }}>
                  <StationMap stations={stations} selected={station} result={result} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ background: T.ink, padding: '28px 32px' }}>
            <Label style={{ color: '#555' }}>SMART RECOMMENDATION</Label>
            <div style={{ fontFamily: T.display, fontSize: '28px', fontWeight: 800, color: loading ? '#333' : '#2a2a2a', letterSpacing: '-1px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {loading ? 'ANALYSING...' : 'SELECT A STATION & RECOMMEND →'}
              {loading && <Spinner light />}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Chat right panel ──────────────────────────────────────
  const ChatPanel = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Chat header strip */}
      <div style={{ background: T.ink, padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <Label style={{ color: '#555', marginBottom: '2px' }}>MULTILINGUAL AI ASSISTANT</Label>
          <div style={{ fontFamily: T.display, fontSize: '18px', fontWeight: 800, color: T.bg, letterSpacing: '-0.5px' }}>ASK ANYTHING</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {voice.supported && (
            <button onClick={voice.toggle} style={{
              background: voice.listening ? T.red : '#2a2a2a', border: 'none',
              padding: '8px 10px', cursor: 'pointer', color: voice.listening ? '#fff' : '#555', borderRadius: '2px',
            }}>
              {voice.listening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
          <button onClick={() => { if (!isMuted) synthRef.current.cancel(); setIsMuted(m => !m) }}
            style={{
              background: '#2a2a2a', border: `1px solid ${isMuted ? '#333' : T.green}`,
              padding: '8px 10px', cursor: 'pointer', color: isMuted ? '#555' : T.green, borderRadius: '2px',
            }}>
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
      </div>
      <HRule />

      {/* Hint chips */}
      <div style={{ padding: '10px 24px', background: T.bgDeep, borderBottom: `1px solid ${T.rule}`, display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
        {['"Is 42nd St busy at 6pm?"', '"¿Está llena la 34th St?"', '"Est-ce bondé à 18h?"', '"晚上拥挤吗？"'].map(hint => (
          <span key={hint}
            onClick={() => setChatInput(hint.replace(/"/g, ''))}
            style={{ fontFamily: T.mono, fontSize: '10px', color: T.muted, background: T.bg, padding: '3px 8px', border: `1px solid ${T.rule}`, cursor: 'pointer' }}>
            {hint}
          </span>
        ))}
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '72%', padding: '10px 14px',
              fontFamily: T.mono, fontSize: '12px', lineHeight: '1.6', whiteSpace: 'pre-line',
              background: m.role === 'user' ? T.ink : T.bgDeep,
              color: m.role === 'user' ? T.bg : T.ink,
              borderRadius: m.role === 'user' ? '0 10px 10px 10px' : '10px 0 10px 10px',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: T.bgDeep, padding: '10px 14px', fontFamily: T.mono, fontSize: '12px', color: T.muted, borderRadius: '10px 0 10px 10px' }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      {/* Input bar */}
      <div style={{ borderTop: `2px solid ${T.ink}`, display: 'flex', flexShrink: 0 }}>
        <input
          style={{
            flex: 1, padding: '16px 20px',
            background: T.bgDeep, border: 'none', outline: 'none',
            fontFamily: T.mono, fontSize: '13px', color: T.ink,
          }}
          placeholder="Ask in any language..."
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleChat()} />
        <button onClick={handleChat} disabled={loading || !chatInput.trim()}
          style={{
            background: loading || !chatInput.trim() ? '#ccc' : T.red,
            border: 'none', padding: '16px 22px',
            cursor: loading || !chatInput.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Send size={15} color={loading || !chatInput.trim() ? T.muted : '#fff'} />
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.display, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: ${T.rule}; }
        select option { background: #111; color: #F5F2ED; }

        input.red-range { -webkit-appearance: none; appearance: none; background: #333; height: 3px; border-radius: 0; cursor: pointer; }
        input.red-range::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: ${T.red}; border-radius: 50%; border: 2.5px solid ${T.ink}; cursor: pointer; }
        input.red-range::-moz-range-thumb { width: 16px; height: 16px; background: ${T.red}; border-radius: 50%; border: 2.5px solid ${T.ink}; cursor: pointer; }
      `}</style>

      {/* ── HEADER ────────────────────────────────────────── */}
      <div style={{ height: '2px', background: T.ink }} />
      <header style={{ background: T.bg, padding: '15px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
          <span style={{ fontFamily: T.display, fontSize: '22px', fontWeight: 800, letterSpacing: '-1px', color: T.ink }}>
            MTA FOOTFALL
          </span>
          <span style={{ fontFamily: T.mono, fontSize: '11px', color: T.muted, letterSpacing: '.06em' }}>
            NYC · 378 STATIONS
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontFamily: T.mono, fontSize: '11px', color: T.green, letterSpacing: '.08em', fontWeight: 500 }}>
          <span style={{ width: '7px', height: '7px', background: T.green, borderRadius: '50%', display: 'inline-block', animation: 'blink 1.4s infinite' }} />
          LIVE
        </div>
      </header>
      <div style={{ height: '2px', background: T.ink }} />

      {/* ── ERROR ─────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#FFF0ED', borderBottom: `1px solid ${T.red}`, padding: '10px 28px', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: T.mono, fontSize: '12px', color: T.red, flexShrink: 0 }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* ── BODY ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: `1px solid ${T.rule}` }}>
          {tab === 'predict'   && <PredictPanel />}
          {tab === 'recommend' && <RecommendPanel />}
          {tab === 'chat'      && <ChatPanel />}
        </div>
      </div>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <div style={{ height: '2px', background: T.ink }} />
      <footer style={{ padding: '9px 28px', background: T.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: '9px', color: '#bbb', letterSpacing: '.1em' }}>
          SMART TOURISM FRAMEWORK · GLOBAL TRANSFORMER · 63,041 RECORDS · 378 STATIONS
        </span>
        <span style={{ fontFamily: T.mono, fontSize: '9px', color: T.red, letterSpacing: '.1em', fontWeight: 500 }}>
          NYC MTA
        </span>
      </footer>
    </div>
  )
}