import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Train, MapPin, Clock, MessageSquare, TrendingDown, Users, Search,
         Send, Mic, MicOff, AlertCircle, Loader, Navigation, Info,
         ChevronRight, Zap, Volume2, VolumeX } from 'lucide-react'
import * as api from './api'

// ── Constants ─────────────────────────────────────────────────
const CROWD_CONFIG = {
  sparse  : { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#34d399', dot: '#10b981', label: 'Sparse'   },
  moderate: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#fbbf24', dot: '#f59e0b', label: 'Moderate' },
  crowded : { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', text: '#f87171', dot: '#ef4444', label: 'Crowded'  },
}
const DAY_NAMES   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ───────────────────────────────────────────────────
const CrowdBadge = ({ level, size = 'md' }) => {
  const c  = CROWD_CONFIG[level] || CROWD_CONFIG.moderate
  const sz = size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-sm px-3.5 py-1.5'
  return (
    <span className={`inline-flex items-center gap-2 rounded-full font-bold tracking-wide ${sz}`}
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot, boxShadow: `0 0 6px ${c.dot}` }} />
      {c.label.toUpperCase()}
    </span>
  )
}

const Spinner = ({ size = 20 }) => (
  <Loader size={size} className="animate-spin" style={{ color: '#38bdf8' }} />
)

const GlassCard = ({ children, className = '', style = {} }) => (
  <div
    className={`rounded-2xl ${className}`}
    style={{
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(148,163,184,0.1)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      ...style
    }}>
    {children}
  </div>
)

// ── Map using Leaflet ─────────────────────────────────────────
const StationMap = ({ stations, selected, result }) => {
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)
  const markersRef  = useRef([])

  useEffect(() => {
    if (!window.L || mapInstance.current) return
    mapInstance.current = window.L.map(mapRef.current).setView([40.7128, -74.0060], 11)
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO'
    }).addTo(mapInstance.current)
  }, [])

  useEffect(() => {
    if (!mapInstance.current || !window.L) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (result) {
      const { station_lat: lat, station_lon: lon, station, crowd } = result
      if (lat && lon) {
        const color = CROWD_CONFIG[crowd?.level]?.dot || '#38bdf8'
        const icon  = window.L.divIcon({
          html: `<div style="width:18px;height:18px;background:${color};border:2.5px solid rgba(255,255,255,0.9);border-radius:50%;box-shadow:0 0 12px ${color},0 2px 8px rgba(0,0,0,0.5)"></div>`,
          iconSize: [18,18], iconAnchor: [9,9]
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
        const altColor = CROWD_CONFIG[alt.crowd_level]?.dot || '#888'
        const altIcon  = window.L.divIcon({
          html: `<div style="width:13px;height:13px;background:${altColor};border:2px solid rgba(255,255,255,0.7);border-radius:50%;box-shadow:0 0 8px ${altColor}"></div>`,
          iconSize: [13,13], iconAnchor: [6,6]
        })
        const m = window.L.marker([alt.lat, alt.lon], { icon: altIcon })
          .addTo(mapInstance.current)
          .bindPopup(`<b>${alt.station}</b><br/>${alt.distance_km} km away<br/>Level: ${alt.crowd_level}`)
        markersRef.current.push(m)
      })
    }
  }, [result])

  return (
    <div ref={mapRef}
         style={{ height: '260px', borderRadius: '12px', overflow: 'hidden', zIndex: 0 }}
         className="w-full" />
  )
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
    recRef.current.continuous     = false
    recRef.current.interimResults = false
    recRef.current.lang           = 'en-US'
    recRef.current.onresult = (e) => { onResult(e.results[0][0].transcript); setListening(false) }
    recRef.current.onerror  = () => setListening(false)
    recRef.current.onend    = () => setListening(false)
    recRef.current.start()
    setListening(true)
  }, [listening, onResult, supported])

  return { listening, toggle, supported }
}

// ── Neon line decorators ──────────────────────────────────────
const NeonLine = ({ color = '#38bdf8' }) => (
  <div style={{ height: '1px', background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.5 }} />
)

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
    text: '👋 Hi! I can help you navigate NYC subway crowds. Ask me anything like:\n• "Is Times Square station busy at 6pm?"\n• "¿Está llena la estación 34th Street a las 8am?"\n• "Quelle est la fréquentation de Canal St le matin?"'
  }])
  const [chatInput, setChatInput] = useState('')
  const chatEnd = useRef(null)

  const [isMuted, setIsMuted] = useState(false)
  const synthRef = useRef(window.speechSynthesis)

  const speakText = useCallback((text) => {
    if (isMuted || !window.speechSynthesis) return
    synthRef.current.cancel()
    const clean = text.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[•*_~`#]/g, '').replace(/\n+/g, '. ').trim()
    if (!clean) return
    const utterance  = new SpeechSynthesisUtterance(clean)
    utterance.rate   = 1.0
    utterance.pitch  = 1.0
    utterance.volume = 1.0
    const voices     = synthRef.current.getVoices()
    const preferred  = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('natural'))
      || voices.find(v => v.lang.startsWith('en')) || voices[0]
    if (preferred) utterance.voice = preferred
    synthRef.current.speak(utterance)
  }, [isMuted])

  useEffect(() => { return () => synthRef.current.cancel() }, [])
  useEffect(() => { synthRef.current.cancel() }, [tab])

  const voice = useVoiceInput((text) => setChatInput(prev => prev + text))

  useEffect(() => {
    api.getStations()
      .then(r => {
        setStations(r.data.stations)
        if (r.data.stations.length > 0) setStation(r.data.stations[0].name)
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
      const assistantMsg = r.data.message
      setMessages(m => [...m, { role: 'assistant', text: assistantMsg }])
      speakText(assistantMsg)
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', text: '⚠️ Error. Make sure GEMINI_API_KEY is set in your .env file.' }])
    } finally { setLoading(false) }
  }

  // ── Shared Controls ───────────────────────────────────────
  const Controls = () => (
    <div className="space-y-5">
      {/* Station */}
      <div className="space-y-2">
        <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}
          className="flex items-center gap-1.5">
          <Train size={11} style={{ color: '#38bdf8' }} /> Station
        </label>
        <div className="relative">
          <Search size={13} style={{ color: '#475569', position: 'absolute', left: '12px', top: '10px' }} />
          <input
            style={{
              width: '100%', paddingLeft: '34px', paddingRight: '12px', paddingTop: '9px', paddingBottom: '9px',
              background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.15)',
              borderRadius: '10px', color: '#e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
            }}
            placeholder="Search 378 stations..."
            value={stFilter}
            onChange={e => setStFilter(e.target.value)} />
        </div>
        <select
          style={{
            width: '100%', padding: '8px 12px',
            background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.15)',
            borderRadius: '10px', color: '#e2e8f0', fontSize: '13px', outline: 'none',
            boxSizing: 'border-box'
          }}
          value={station}
          onChange={e => setStation(e.target.value)}
          size={5}>
          {filteredStations.map(s => (
            <option key={s.name} value={s.name} style={{ background: '#0f172a' }}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Hour */}
      <div className="space-y-2">
        <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}
          className="flex items-center gap-1.5">
          <Clock size={11} style={{ color: '#38bdf8' }} /> Hour —
          <span style={{ color: '#38bdf8', fontWeight: 800, fontSize: '13px' }}>{String(hour).padStart(2,'0')}:00</span>
        </label>
        <input type="range" min={0} max={23} value={hour}
          onChange={e => setHour(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: '#38bdf8' }} />
        <div className="flex justify-between" style={{ color: '#475569', fontSize: '10px' }}>
          <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>11PM</span>
        </div>
      </div>

      {/* Day */}
      <div className="space-y-2">
        <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Day of Week
        </label>
        <select
          style={{
            width: '100%', padding: '9px 12px',
            background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.15)',
            borderRadius: '10px', color: '#e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
          }}
          value={dow} onChange={e => setDow(parseInt(e.target.value))}>
          {DAY_NAMES.map((d, i) => <option key={i} value={i} style={{ background: '#0f172a' }}>{d}</option>)}
        </select>
      </div>

      {/* Month */}
      <div className="space-y-2">
        <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Month
        </label>
        <select
          style={{
            width: '100%', padding: '9px 12px',
            background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.15)',
            borderRadius: '10px', color: '#e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
          }}
          value={month} onChange={e => setMonth(parseInt(e.target.value))}>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i} style={{ background: '#0f172a' }}>{m}</option>)}
        </select>
      </div>
    </div>
  )

  const tabDefs = [
    { id: 'predict',   icon: TrendingDown,  label: 'Predict'   },
    { id: 'recommend', icon: Navigation,    label: 'Recommend' },
    { id: 'chat',      icon: MessageSquare, label: 'AI Chat'   },
  ]

  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #020617 0%, #0a0f1e 40%, #050d1a 100%)',
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: '#e2e8f0',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow blobs */}
      <div style={{
        position: 'fixed', top: '-120px', left: '-120px', width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0
      }} />
      <div style={{
        position: 'fixed', bottom: '-80px', right: '-80px', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0
      }} />

      {/* ── Header ──────────────────────────────────────────── */}
      <header style={{
        background: 'rgba(2,6,23,0.85)',
        borderBottom: '1px solid rgba(148,163,184,0.08)',
        backdropFilter: 'blur(24px)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}
          className="flex items-center justify-between" style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="flex items-center gap-4" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              padding: '10px', borderRadius: '14px',
              boxShadow: '0 0 20px rgba(56,189,248,0.35)',
            }}>
              <Train size={20} color="white" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.02em', color: '#f1f5f9' }}>
                Smart Tourism
                <span style={{ color: '#38bdf8', marginLeft: '6px' }}>·</span>
                <span style={{ color: '#94a3b8', fontWeight: 500, marginLeft: '6px', fontSize: '14px' }}>MTA Footfall</span>
              </div>
              <div style={{ fontSize: '11px', color: '#475569', letterSpacing: '0.08em', marginTop: '1px' }}>
                GLOBAL TRANSFORMER · 378 NYC STATIONS
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: '20px', padding: '6px 14px',
            fontSize: '11px', color: '#34d399', fontWeight: 600, letterSpacing: '0.06em'
          }}>
            <span style={{ width: '7px', height: '7px', background: '#10b981', borderRadius: '50%', animation: 'pulse 2s infinite', boxShadow: '0 0 8px #10b981' }} />
            LIVE PREDICTIONS
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 24px', position: 'relative', zIndex: 1 }}>

        {/* ── Tab bar ───────────────────────────────────────── */}
        <div style={{
          display: 'inline-flex', gap: '4px',
          background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.1)',
          borderRadius: '16px', padding: '5px', backdropFilter: 'blur(16px)', marginBottom: '24px'
        }}>
          {tabDefs.map(({ id, icon: Icon, label }) => (
            <button key={id}
              onClick={() => { setTab(id); setResult(null); setError('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 20px', borderRadius: '12px', fontSize: '13px',
                fontWeight: 700, border: 'none', cursor: 'pointer', letterSpacing: '0.02em',
                transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                background: tab === id
                  ? 'linear-gradient(135deg, #0ea5e9, #6366f1)'
                  : 'transparent',
                color: tab === id ? 'white' : '#64748b',
                boxShadow: tab === id ? '0 0 20px rgba(56,189,248,0.3)' : 'none',
              }}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Error ─────────────────────────────────────────── */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#f87171', padding: '12px 16px', borderRadius: '12px',
            fontSize: '13px', fontWeight: 500, marginBottom: '20px'
          }}>
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* ══ PREDICT TAB ══ */}
        {tab === 'predict' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
            <GlassCard className="p-5 space-y-5" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <TrendingDown size={15} style={{ color: '#38bdf8' }} />
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#f1f5f9', letterSpacing: '-0.01em' }}>
                  Footfall Prediction
                </span>
              </div>
              <NeonLine />
              <Controls />
              <button onClick={handlePredict} disabled={loading || !station}
                style={{
                  width: '100%', padding: '12px', borderRadius: '12px',
                  background: loading || !station
                    ? 'rgba(56,189,248,0.1)'
                    : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                  border: loading || !station ? '1px solid rgba(56,189,248,0.2)' : 'none',
                  color: loading || !station ? '#475569' : 'white',
                  fontWeight: 700, fontSize: '14px', cursor: loading || !station ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: loading || !station ? 'none' : '0 0 24px rgba(56,189,248,0.35)',
                  transition: 'all 0.2s',
                }}>
                {loading ? <Spinner size={15} /> : <Zap size={15} />}
                {loading ? 'Predicting…' : 'Predict Now'}
              </button>
            </GlassCard>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!result && !loading && (
                <GlassCard style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Train size={48} style={{ color: 'rgba(148,163,184,0.2)' }} />
                  <p style={{ color: '#475569', fontSize: '14px' }}>Select a station and hit Predict</p>
                </GlassCard>
              )}
              {loading && (
                <GlassCard style={{ padding: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner size={32} />
                </GlassCard>
              )}
              {result?.type === 'predict' && (
                <>
                  <GlassCard style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Station</div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>{result.prediction?.station}</div>
                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                          {String(hour).padStart(2,'0')}:00 · {DAY_NAMES[dow]} · {MONTH_NAMES[month]}
                        </div>
                      </div>
                      <CrowdBadge level={result.crowd?.level} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
                      {[
                        { label: 'Predicted Footfall', val: result.prediction?.predicted_footfall?.toLocaleString(), accent: '#38bdf8' },
                        { label: 'Station Average',    val: result.prediction?.station_mean?.toLocaleString(),       accent: '#a78bfa' },
                        { label: 'Capacity Level',     val: `${result.crowd?.capacity_pct}%`,                        accent: CROWD_CONFIG[result.crowd?.level]?.dot || '#38bdf8' },
                      ].map(({ label, val, accent }) => (
                        <div key={label} style={{
                          background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.08)',
                          borderRadius: '12px', padding: '14px', textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '10px', color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
                          <div style={{ fontSize: '22px', fontWeight: 800, color: accent }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', marginBottom: '6px' }}>
                        <span>Capacity</span><span style={{ color: CROWD_CONFIG[result.crowd?.level]?.text }}>{result.crowd?.capacity_pct}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(148,163,184,0.1)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: '9999px', transition: 'width 0.8s ease',
                          width: `${result.crowd?.capacity_pct}%`,
                          background: `linear-gradient(90deg, ${CROWD_CONFIG[result.crowd?.level]?.dot}, ${CROWD_CONFIG[result.crowd?.level]?.dot}88)`,
                          boxShadow: `0 0 10px ${CROWD_CONFIG[result.crowd?.level]?.dot}66`
                        }} />
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard style={{ padding: '16px' }}>
                    <StationMap stations={stations} selected={station} result={{
                      station_lat: stations.find(s => s.name === station)?.lat,
                      station_lon: stations.find(s => s.name === station)?.lon,
                      station, crowd: result.crowd,
                      footfall: result.prediction?.predicted_footfall, alternatives: [],
                    }} />
                  </GlassCard>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══ RECOMMEND TAB ══ */}
        {tab === 'recommend' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
            <GlassCard style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Navigation size={15} style={{ color: '#38bdf8' }} />
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#f1f5f9' }}>Smart Recommendation</span>
              </div>
              <NeonLine />
              <Controls />
              <button onClick={handleRecommend} disabled={loading || !station}
                style={{
                  width: '100%', padding: '12px', borderRadius: '12px',
                  background: loading || !station
                    ? 'rgba(139,92,246,0.1)'
                    : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                  border: loading || !station ? '1px solid rgba(139,92,246,0.2)' : 'none',
                  color: loading || !station ? '#475569' : 'white',
                  fontWeight: 700, fontSize: '14px', cursor: loading || !station ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: loading || !station ? 'none' : '0 0 24px rgba(139,92,246,0.4)',
                  transition: 'all 0.2s',
                }}>
                {loading ? <Spinner size={15} /> : <Navigation size={15} />}
                {loading ? 'Analysing…' : 'Get Recommendation'}
              </button>
            </GlassCard>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!result && !loading && (
                <GlassCard style={{ padding: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <MapPin size={48} style={{ color: 'rgba(148,163,184,0.2)' }} />
                  <p style={{ color: '#475569', fontSize: '14px' }}>Find the best time and station to visit</p>
                </GlassCard>
              )}
              {loading && (
                <GlassCard style={{ padding: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner size={32} />
                </GlassCard>
              )}
              {result?.type === 'recommend' && (
                <>
                  <GlassCard style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Requested</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9' }}>{result.station}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{result.hour_used}:00</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <CrowdBadge level={result.crowd?.level} />
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '6px' }}>{result.footfall?.toFixed(0)}</div>
                      <div style={{ fontSize: '11px', color: '#475569' }}>passengers</div>
                    </div>
                  </GlassCard>

                  <GlassCard style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <Clock size={14} style={{ color: '#10b981' }} />
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>
                        Best time:
                        <span style={{ color: '#10b981', marginLeft: '6px' }}>{result.best_time?.best_hour}:00</span>
                        <span style={{ color: '#10b981', fontWeight: 400, fontSize: '12px', marginLeft: '8px' }}>
                          −{result.best_time?.pct_reduction}% less crowded
                        </span>
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '16px' }}>Searched: {result.best_time?.window_searched}</div>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart
                        data={Object.entries(result.best_time?.all_predictions || {})
                          .map(([h, v]) => ({ hour: `${h}:00`, val: Math.round(v), h: parseInt(h) }))}
                        margin={{ top:4, right:4, left:0, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
                        <XAxis dataKey="hour" tick={{ fontSize:10, fill:'#475569' }} />
                        <YAxis tick={{ fontSize:10, fill:'#475569' }} />
                        <Tooltip
                          formatter={v => [`${v} pax`, 'Footfall']}
                          contentStyle={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '10px', color: '#e2e8f0' }} />
                        <Bar dataKey="val" radius={[4,4,0,0]}>
                          {Object.entries(result.best_time?.all_predictions || {}).map(([h], i) => (
                            <Cell key={i}
                              fill={parseInt(h) === result.best_time?.best_hour ? '#10b981'
                                  : parseInt(h) === result.hour_used            ? '#ef4444'
                                  : 'rgba(56,189,248,0.4)'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
                      {[
                        { color: '#10b981', label: 'Best' },
                        { color: '#ef4444', label: 'Requested' },
                        { color: 'rgba(56,189,248,0.6)', label: 'Other' },
                      ].map(({ color, label }) => (
                        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, display: 'inline-block' }} />
                          {label}
                        </span>
                      ))}
                    </div>
                  </GlassCard>

                  {result.alternatives?.length > 0 && (
                    <GlassCard style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                        <Users size={14} style={{ color: '#38bdf8' }} />
                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>Nearby quieter stations</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {result.alternatives.map((alt, i) => (
                          <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.08)',
                            borderRadius: '12px', padding: '12px 16px',
                            transition: 'border-color 0.2s',
                          }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '13px', color: '#e2e8f0' }}>{alt.station}</div>
                              <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                                {alt.distance_km} km away
                                {alt.pct_less_crowded > 0 && ` · ${alt.pct_less_crowded}% quieter`}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <CrowdBadge level={alt.crowd_level} size="sm" />
                              <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                                ~{alt.predicted_footfall?.toLocaleString()} pax
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  )}

                  <GlassCard style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                      <MapPin size={12} style={{ color: '#38bdf8' }} /> Station Map
                    </div>
                    <StationMap stations={stations} selected={station} result={result} />
                    <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#475569', marginTop: '10px' }}>
                      {[
                        { color: '#ef4444', label: 'Selected' },
                        { color: '#10b981', label: 'Alternatives' },
                      ].map(({ color, label }) => (
                        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 6px ${color}` }} />
                          {label}
                        </span>
                      ))}
                    </div>
                  </GlassCard>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══ CHAT TAB ══ */}
        {tab === 'chat' && (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px' }}>
            <GlassCard style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={15} style={{ color: '#38bdf8' }} />
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#f1f5f9' }}>AI Chat Assistant</span>
              </div>
              <NeonLine />
              <div style={{
                background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)',
                borderRadius: '12px', padding: '14px', fontSize: '12px', color: '#94a3b8', lineHeight: '1.8'
              }}>
                <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '6px' }}>🌍 Multilingual — Try:</div>
                <div>"Is 42nd St busy tonight?"</div>
                <div>"¿Cuándo ir a Grand Central?"</div>
                <div>"Est-ce bondé à 18h?"</div>
                <div>"晚上6点时代广场拥挤吗？"</div>
                <div>"क्या भीड़ है?"</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Context (optional)</div>
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <Search size={12} style={{ position: 'absolute', left: '10px', top: '9px', color: '#475569' }} />
                  <input
                    style={{
                      width: '100%', paddingLeft: '30px', paddingRight: '10px', paddingTop: '8px', paddingBottom: '8px',
                      background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.15)',
                      borderRadius: '10px', color: '#e2e8f0', fontSize: '12px', outline: 'none', boxSizing: 'border-box'
                    }}
                    placeholder="Search station..."
                    value={stFilter}
                    onChange={e => setStFilter(e.target.value)} />
                </div>
                <select
                  style={{
                    width: '100%', padding: '7px 10px',
                    background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.15)',
                    borderRadius: '10px', color: '#e2e8f0', fontSize: '12px', outline: 'none', boxSizing: 'border-box'
                  }}
                  value={station}
                  onChange={e => setStation(e.target.value)}
                  size={4}>
                  {filteredStations.map(s => (
                    <option key={s.name} value={s.name} style={{ background: '#0f172a' }}>{s.name}</option>
                  ))}
                </select>
              </div>
            </GlassCard>

            <GlassCard style={{ display: 'flex', flexDirection: 'column', height: '580px' }}>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {m.role === 'assistant' && (
                      <div style={{
                        width: '30px', height: '30px', flexShrink: 0,
                        background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginRight: '10px', marginTop: '2px', boxShadow: '0 0 12px rgba(56,189,248,0.3)'
                      }}>
                        <Train size={13} color="white" />
                      </div>
                    )}
                    <div style={{
                      maxWidth: '75%', padding: '12px 16px', borderRadius: '16px',
                      fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-line',
                      background: m.role === 'user'
                        ? 'linear-gradient(135deg, #0ea5e9, #6366f1)'
                        : 'rgba(15,23,42,0.8)',
                      border: m.role === 'user' ? 'none' : '1px solid rgba(148,163,184,0.1)',
                      color: m.role === 'user' ? 'white' : '#cbd5e1',
                      borderBottomRightRadius: m.role === 'user' ? '4px' : '16px',
                      borderBottomLeftRadius: m.role === 'assistant' ? '4px' : '16px',
                      boxShadow: m.role === 'user' ? '0 0 20px rgba(56,189,248,0.25)' : 'none',
                    }}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '30px', height: '30px', background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Train size={13} color="white" />
                    </div>
                    <div style={{
                      background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.1)',
                      padding: '12px 16px', borderRadius: '16px', borderBottomLeftRadius: '4px',
                      display: 'flex', gap: '5px', alignItems: 'center'
                    }}>
                      {[0,1,2].map(i => (
                        <span key={i} style={{
                          width: '7px', height: '7px', background: '#38bdf8', borderRadius: '50%',
                          animation: 'bounce 1s infinite',
                          animationDelay: `${i * 0.15}s`, display: 'inline-block'
                        }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={chatEnd} />
              </div>

              {/* Input bar */}
              <div style={{
                borderTop: '1px solid rgba(148,163,184,0.08)',
                padding: '14px 16px', display: 'flex', gap: '8px', alignItems: 'center'
              }}>
                <input
                  style={{
                    flex: 1, padding: '11px 16px',
                    background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.15)',
                    borderRadius: '12px', color: '#e2e8f0', fontSize: '13px', outline: 'none',
                  }}
                  placeholder="Ask in any language…"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !loading && handleChat()} />

                {voice.supported && (
                  <button onClick={voice.toggle}
                    style={{
                      padding: '10px', borderRadius: '12px', cursor: 'pointer', border: 'none',
                      background: voice.listening ? '#ef4444' : 'rgba(148,163,184,0.1)',
                      color: voice.listening ? 'white' : '#64748b',
                      boxShadow: voice.listening ? '0 0 16px rgba(239,68,68,0.5)' : 'none',
                      transition: 'all 0.2s',
                    }}>
                    {voice.listening ? <MicOff size={15} /> : <Mic size={15} />}
                  </button>
                )}

                <button
                  onClick={() => { if (!isMuted) synthRef.current.cancel(); setIsMuted(m => !m) }}
                  style={{
                    padding: '10px', borderRadius: '12px', cursor: 'pointer', border: 'none',
                    background: isMuted ? 'rgba(148,163,184,0.1)' : 'rgba(56,189,248,0.12)',
                    color: isMuted ? '#475569' : '#38bdf8',
                    border: isMuted ? '1px solid rgba(148,163,184,0.1)' : '1px solid rgba(56,189,248,0.25)',
                    transition: 'all 0.2s',
                  }}>
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>

                <button onClick={handleChat} disabled={loading || !chatInput.trim()}
                  style={{
                    padding: '10px 18px', borderRadius: '12px', border: 'none', cursor: loading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                    background: loading || !chatInput.trim()
                      ? 'rgba(56,189,248,0.1)'
                      : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                    color: loading || !chatInput.trim() ? '#475569' : 'white',
                    boxShadow: loading || !chatInput.trim() ? 'none' : '0 0 16px rgba(56,189,248,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}>
                  <Send size={15} />
                </button>
              </div>
            </GlassCard>
          </div>
        )}
      </div>

      <footer style={{ textAlign: 'center', fontSize: '11px', color: '#1e293b', padding: '32px', letterSpacing: '0.08em' }}>
        SMART TOURISM FRAMEWORK · GLOBAL TRANSFORMER UNIMODAL · MTA NYC TURNSTILE · 63,041 RECORDS · 378 STATIONS
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 99px; }
        select option { background: #0f172a; color: #e2e8f0; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}