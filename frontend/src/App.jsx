import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Train, MapPin, Clock, MessageSquare, TrendingDown, Users, Search,
         Send, Mic, MicOff, AlertCircle, Loader, Navigation, Info,
         ChevronRight, Zap, Volume2, VolumeX } from 'lucide-react'
import * as api from './api'

// ── Constants ─────────────────────────────────────────────────
const CROWD_CONFIG = {
  sparse  : { bg: '#dcfce7', border: '#16a34a', text: '#15803d', dot: '#16a34a', label: 'Sparse'   },
  moderate: { bg: '#fef9c3', border: '#ca8a04', text: '#a16207', dot: '#ca8a04', label: 'Moderate' },
  crowded : { bg: '#fee2e2', border: '#dc2626', text: '#b91c1c', dot: '#dc2626', label: 'Crowded'  },
}
const DAY_NAMES   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ───────────────────────────────────────────────────
const CrowdBadge = ({ level, size = 'md' }) => {
  const c  = CROWD_CONFIG[level] || CROWD_CONFIG.moderate
  const sz = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sz}`}
          style={{ background: c.bg, border: `1.5px solid ${c.border}`, color: c.text }}>
      <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  )
}

const Spinner = ({ size = 20 }) => (
  <Loader size={size} className="animate-spin text-blue-500" />
)

const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
    {children}
  </div>
)

// ── Map using Leaflet (loaded via CDN in index.html) ──────────
const StationMap = ({ stations, selected, result }) => {
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)
  const markersRef  = useRef([])

  useEffect(() => {
    if (!window.L || mapInstance.current) return
    mapInstance.current = window.L.map(mapRef.current).setView([40.7128, -74.0060], 11)
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance.current)
  }, [])

  useEffect(() => {
    if (!mapInstance.current || !window.L) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (result) {
      const { station_lat: lat, station_lon: lon, station, crowd } = result
      if (lat && lon) {
        const color = CROWD_CONFIG[crowd?.level]?.dot || '#2166AC'
        const icon  = window.L.divIcon({
          html: `<div style="width:16px;height:16px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
          iconSize: [16,16], iconAnchor: [8,8]
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
          html: `<div style="width:12px;height:12px;background:${altColor};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
          iconSize: [12,12], iconAnchor: [6,6]
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
         style={{ height: '280px', borderRadius: '12px', overflow: 'hidden', zIndex: 0 }}
         className="w-full border border-gray-200" />
  )
}

// ── Voice INPUT hook (speech → text) ─────────────────────────
const useVoiceInput = (onResult) => {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)

  const supported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const toggle = useCallback(() => {
    if (!supported) return
    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    recRef.current                  = new SR()
    recRef.current.continuous       = false
    recRef.current.interimResults   = false
    recRef.current.lang             = 'en-US'
    recRef.current.onresult = (e) => {
      onResult(e.results[0][0].transcript)
      setListening(false)
    }
    recRef.current.onerror = () => setListening(false)
    recRef.current.onend   = () => setListening(false)
    recRef.current.start()
    setListening(true)
  }, [listening, onResult, supported])

  return { listening, toggle, supported }
}

// ══════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  const now = new Date()

  // ── State ─────────────────────────────────────────────────
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

  // ── Voice OUTPUT state (text → speech) ───────────────────
  const [isMuted, setIsMuted] = useState(false)
  const synthRef = useRef(window.speechSynthesis)

  // ── speakText: cleans text and speaks it ──────────────────
  const speakText = useCallback((text) => {
    if (isMuted || !window.speechSynthesis) return
    synthRef.current.cancel()
    const clean = text
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')   // remove emojis
      .replace(/[•*_~`#]/g, '')                  // remove markdown
      .replace(/\n+/g, '. ')                     // newlines → pauses
      .trim()
    if (!clean) return
    const utterance   = new SpeechSynthesisUtterance(clean)
    utterance.rate    = 1.0
    utterance.pitch   = 1.0
    utterance.volume  = 1.0
    // Pick a natural English voice if available
    const voices      = synthRef.current.getVoices()
    const preferred   = voices.find(v =>
      v.lang.startsWith('en') && v.name.toLowerCase().includes('natural')
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0]
    if (preferred) utterance.voice = preferred
    synthRef.current.speak(utterance)
  }, [isMuted])

  // ── Stop speech when tab changes or component unmounts ────
  useEffect(() => { return () => synthRef.current.cancel() }, [])
  useEffect(() => { synthRef.current.cancel() }, [tab])

  // ── Voice INPUT hook ──────────────────────────────────────
  const voice = useVoiceInput((text) => setChatInput(prev => prev + text))

  // ── Load stations ─────────────────────────────────────────
  useEffect(() => {
    api.getStations()
      .then(r => {
        setStations(r.data.stations)
        if (r.data.stations.length > 0)
          setStation(r.data.stations[0].name)
      })
      .catch(() => setError('Backend not running. Start uvicorn first.'))
  }, [])

  // ── Scroll chat to bottom ─────────────────────────────────
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Auto-set weekend from day of week ─────────────────────
  useEffect(() => {
    setIsWeekend(dow >= 5 ? 1 : 0)
  }, [dow])

  const filteredStations = stations.filter(s =>
    s.name.toLowerCase().includes(stFilter.toLowerCase())
  )

  // ── Handlers ──────────────────────────────────────────────
  const handlePredict = async () => {
    if (!station) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await api.predict(station, hour, dow, month + 1, isWeekend)
      setResult({ type: 'predict', ...r.data })
    } catch (e) {
      setError(e.response?.data?.detail || 'Prediction failed.')
    } finally { setLoading(false) }
  }

  const handleRecommend = async () => {
    if (!station) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await api.recommend(station, hour, dow, month + 1, isWeekend)
      setResult({ type: 'recommend', ...r.data })
    } catch (e) {
      setError(e.response?.data?.detail || 'Recommendation failed.')
    } finally { setLoading(false) }
  }

  const handleChat = async () => {
    const msg = chatInput.trim()
    if (!msg) return
    setChatInput('')
    setMessages(m => [...m, { role: 'user', text: msg }])
    setLoading(true)
    try {
      const r           = await api.chat(msg, station, hour, dow, month + 1, isWeekend)
      const assistantMsg = r.data.message
      // Add message to chat
      setMessages(m => [...m, { role: 'assistant', text: assistantMsg }])
      // ── Speak the reply ───────────────────────────────────
      speakText(assistantMsg)
    } catch (e) {
      const errMsg = '⚠️ Error. Make sure GEMINI_API_KEY is set in your .env file.'
      setMessages(m => [...m, { role: 'assistant', text: errMsg }])
    } finally { setLoading(false) }
  }

  // ── Shared controls ────────────────────────────────────────
  const Controls = () => (
    <div className="space-y-4">
      {/* Station search + select */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
          <Train size={13} className="text-blue-500" /> Station
        </label>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl
              text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
            placeholder="Search 378 stations..."
            value={stFilter}
            onChange={e => setStFilter(e.target.value)} />
        </div>
        <select
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
          value={station}
          onChange={e => setStation(e.target.value)}
          size={5}>
          {filteredStations.map(s => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Hour slider */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
          <Clock size={13} className="text-blue-500" />
          Hour: <span className="text-blue-600 font-bold ml-1">{hour}:00</span>
        </label>
        <input type="range" min={0} max={23} value={hour}
          onChange={e => setHour(parseInt(e.target.value))}
          className="w-full accent-blue-500" />
        <div className="flex justify-between text-xs text-gray-400">
          <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>11PM</span>
        </div>
      </div>

      {/* Day of week */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700">Day of week</label>
        <select
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
          value={dow} onChange={e => setDow(parseInt(e.target.value))}>
          {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
      </div>

      {/* Month */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700">Month</label>
        <select
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
          value={month} onChange={e => setMonth(parseInt(e.target.value))}>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700
              text-white p-2.5 rounded-xl shadow-md">
              <Train size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">
                Smart Tourism · MTA Footfall
              </h1>
              <p className="text-xs text-gray-400">
                Global Transformer · 378 NYC Stations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400
            bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live predictions
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">

        {/* ── Tab bar ───────────────────────────────────────── */}
        <div className="flex gap-1.5 bg-white border border-gray-100
          rounded-2xl p-1.5 shadow-sm w-fit">
          {[
            { id: 'predict',   icon: TrendingDown,  label: 'Predict'   },
            { id: 'recommend', icon: Navigation,    label: 'Recommend' },
            { id: 'chat',      icon: MessageSquare, label: 'AI Chat'   },
          ].map(({ id, icon: Icon, label }) => (
            <button key={id}
              onClick={() => { setTab(id); setResult(null); setError('') }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm
                font-semibold transition-all duration-200 ${
                tab === id
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Error ─────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200
            text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            PREDICT TAB
           ══════════════════════════════════════════════════════ */}
        {tab === 'predict' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 space-y-4">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <TrendingDown size={16} className="text-blue-500" />
                Footfall Prediction
              </h2>
              <Controls />
              <button onClick={handlePredict} disabled={loading || !station}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600
                  hover:from-blue-600 hover:to-blue-700 disabled:from-blue-300
                  disabled:to-blue-300 text-white font-semibold py-3 rounded-xl
                  transition flex items-center justify-center gap-2 shadow-md">
                {loading ? <Spinner size={16} /> : <Zap size={16} />}
                {loading ? 'Predicting…' : 'Predict Now'}
              </button>
            </Card>

            <div className="lg:col-span-2 space-y-4">
              {!result && !loading && (
                <Card className="p-10 flex flex-col items-center justify-center
                  text-gray-300 gap-3">
                  <Train size={48} />
                  <p className="text-sm text-gray-400">Select a station and hit Predict</p>
                </Card>
              )}
              {loading && (
                <Card className="p-10 flex items-center justify-center">
                  <Spinner size={32} />
                </Card>
              )}
              {result?.type === 'predict' && (
                <>
                  <Card className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Station</p>
                        <p className="text-xl font-bold text-gray-900">{result.prediction?.station}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {hour}:00 · {DAY_NAMES[dow]} · {MONTH_NAMES[month]}
                        </p>
                      </div>
                      <CrowdBadge level={result.crowd?.level} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Predicted Footfall', val: result.prediction?.predicted_footfall?.toLocaleString() },
                        { label: 'Station Average',    val: result.prediction?.station_mean?.toLocaleString() },
                        { label: 'Capacity Level',     val: `${result.crowd?.capacity_pct}%` },
                      ].map(({ label, val }) => (
                        <div key={label}
                          className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                          <p className="text-xs text-gray-500 mb-1">{label}</p>
                          <p className="text-lg font-bold text-gray-800">{val}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Capacity indicator</span>
                        <span>{result.crowd?.capacity_pct}%</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${result.crowd?.capacity_pct}%`,
                            background: CROWD_CONFIG[result.crowd?.level]?.dot
                          }} />
                      </div>
                    </div>
                  </Card>
                  <StationMap
                    stations={stations}
                    selected={station}
                    result={{
                      station_lat : stations.find(s => s.name === station)?.lat,
                      station_lon : stations.find(s => s.name === station)?.lon,
                      station,
                      crowd       : result.crowd,
                      footfall    : result.prediction?.predicted_footfall,
                      alternatives: [],
                    }} />
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            RECOMMEND TAB
           ══════════════════════════════════════════════════════ */}
        {tab === 'recommend' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 space-y-4">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Navigation size={16} className="text-blue-500" />
                Smart Recommendation
              </h2>
              <Controls />
              <button onClick={handleRecommend} disabled={loading || !station}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600
                  hover:from-indigo-600 hover:to-purple-700 disabled:from-gray-300
                  disabled:to-gray-300 text-white font-semibold py-3 rounded-xl
                  transition flex items-center justify-center gap-2 shadow-md">
                {loading ? <Spinner size={16} /> : <Navigation size={16} />}
                {loading ? 'Analysing…' : 'Get Recommendation'}
              </button>
            </Card>

            <div className="lg:col-span-2 space-y-4">
              {!result && !loading && (
                <Card className="p-10 flex flex-col items-center text-gray-300 gap-3">
                  <MapPin size={48} />
                  <p className="text-sm text-gray-400">Find the best time and station to visit</p>
                </Card>
              )}
              {loading && (
                <Card className="p-10 flex items-center justify-center">
                  <Spinner size={32} />
                </Card>
              )}
              {result?.type === 'recommend' && (
                <>
                  <Card className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Requested</p>
                        <p className="font-bold text-gray-900 text-lg">{result.station}</p>
                        <p className="text-sm text-gray-500">{result.hour_used}:00</p>
                      </div>
                      <div className="text-right">
                        <CrowdBadge level={result.crowd?.level} />
                        <p className="text-2xl font-bold text-gray-800 mt-1">
                          {result.footfall?.toFixed(0)}
                        </p>
                        <p className="text-xs text-gray-400">passengers</p>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-5">
                    <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                      <Clock size={15} className="text-green-500" />
                      Best time: <span className="text-green-600 font-bold ml-1">
                        {result.best_time?.best_hour}:00
                      </span>
                      <span className="text-sm text-green-600 font-normal ml-1">
                        (−{result.best_time?.pct_reduction}% less crowded)
                      </span>
                    </h3>
                    <p className="text-xs text-gray-400 mb-3">
                      Searched: {result.best_time?.window_searched}
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={Object.entries(result.best_time?.all_predictions || {})
                          .map(([h, v]) => ({ hour: `${h}:00`, val: Math.round(v), h: parseInt(h) }))}
                        margin={{ top:4, right:4, left:0, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="hour" tick={{ fontSize:10, fill:'#666' }} />
                        <YAxis tick={{ fontSize:10, fill:'#666' }} />
                        <Tooltip
                          formatter={v => [`${v} pax`, 'Footfall']}
                          contentStyle={{ borderRadius:'8px', border:'1px solid #e5e7eb' }} />
                        <Bar dataKey="val" radius={[4,4,0,0]}>
                          {Object.entries(result.best_time?.all_predictions || {}).map(([h], i) => (
                            <Cell key={i}
                              fill={parseInt(h) === result.best_time?.best_hour ? '#16a34a'
                                  : parseInt(h) === result.hour_used            ? '#dc2626'
                                  : '#93c5fd'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 text-xs mt-2 text-gray-500">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-green-600 inline-block"/>Best
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-red-500 inline-block"/>Requested
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-blue-300 inline-block"/>Other
                      </span>
                    </div>
                  </Card>

                  {result.alternatives?.length > 0 && (
                    <Card className="p-5">
                      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Users size={15} className="text-blue-500" />
                        Nearby quieter stations
                      </h3>
                      <div className="space-y-2">
                        {result.alternatives.map((alt, i) => (
                          <div key={i} className="flex items-center justify-between
                            bg-gray-50 rounded-xl px-4 py-3 border border-gray-100
                            hover:border-blue-200 transition">
                            <div>
                              <p className="font-semibold text-gray-800 text-sm">{alt.station}</p>
                              <p className="text-xs text-gray-400">
                                {alt.distance_km} km away
                                {alt.pct_less_crowded > 0 && ` · ${alt.pct_less_crowded}% quieter`}
                              </p>
                            </div>
                            <div className="text-right">
                              <CrowdBadge level={alt.crowd_level} size="sm" />
                              <p className="text-xs text-gray-500 mt-1">
                                ~{alt.predicted_footfall?.toLocaleString()} pax
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  <Card className="p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      <MapPin size={14} className="text-blue-500" /> Station map
                    </p>
                    <StationMap stations={stations} selected={station} result={result} />
                    <div className="flex gap-4 text-xs mt-2 text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-red-500 inline-block"/>Selected
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-green-500 inline-block"/>Alternatives
                      </span>
                    </div>
                  </Card>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            CHAT TAB
           ══════════════════════════════════════════════════════ */}
        {tab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 space-y-4">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <MessageSquare size={16} className="text-blue-500" />
                AI Chat Assistant
              </h2>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl
                p-3 text-xs text-blue-700 space-y-1.5 border border-blue-100">
                <p className="font-semibold">🌍 Multilingual · Try:</p>
                <p>"Is 42nd St busy tonight?"</p>
                <p>"¿Cuándo es mejor ir a Grand Central?"</p>
                <p>"Est-ce que Times Square est bondé à 18h?"</p>
                <p>"晚上6点时代广场拥挤吗？"</p>
                <p>"क्या टाइम्स स्क्वायर में भीड़ है?"</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-600">Context (optional):</p>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    className="w-full pl-7 pr-2 py-2 border border-gray-200 rounded-xl
                      text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Search station..."
                    value={stFilter}
                    onChange={e => setStFilter(e.target.value)} />
                </div>
                <select
                  className="w-full border border-gray-200 rounded-xl px-2 py-1.5
                    text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={station}
                  onChange={e => setStation(e.target.value)}
                  size={4}>
                  {filteredStations.map(s => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            </Card>

            <div className="lg:col-span-2">
              <Card className="flex flex-col" style={{ height: '560px' }}>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((m, i) => (
                    <div key={i}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {m.role === 'assistant' && (
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600
                          rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                          <Train size={12} className="text-white" />
                        </div>
                      )}
                      <div className={`max-w-xs lg:max-w-sm px-4 py-3 rounded-2xl text-sm
                        leading-relaxed whitespace-pre-line ${
                        m.role === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-sm'
                          : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-bl-sm'
                      }`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600
                        rounded-full flex items-center justify-center mr-2">
                        <Train size={12} className="text-white" />
                      </div>
                      <div className="bg-gray-50 border border-gray-100 px-4 py-3
                        rounded-2xl rounded-bl-sm flex gap-1 items-center">
                        {[0,1,2].map(i => (
                          <span key={i}
                            className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={chatEnd} />
                </div>

                {/* Input bar */}
                <div className="border-t border-gray-100 p-3 flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      className="w-full border border-gray-200 rounded-2xl px-4 py-2.5
                        pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400
                        bg-gray-50"
                      placeholder="Ask in any language…"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !loading && handleChat()} />
                  </div>

                  {/* Voice INPUT button (mic) */}
                  {voice.supported && (
                    <button
                      onClick={voice.toggle}
                      className={`p-2.5 rounded-2xl border transition ${
                        voice.listening
                          ? 'bg-red-500 border-red-500 text-white animate-pulse'
                          : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-500'
                      }`}
                      title={voice.listening ? 'Stop recording' : 'Voice input'}>
                      {voice.listening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}

                  {/* Mute/Unmute voice OUTPUT button (speaker) */}
                  <button
                    onClick={() => {
                      if (!isMuted) synthRef.current.cancel()
                      setIsMuted(m => !m)
                    }}
                    className={`p-2.5 rounded-2xl border transition ${
                      isMuted
                        ? 'border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500'
                        : 'border-blue-300 text-blue-500 bg-blue-50'
                    }`}
                    title={isMuted ? 'Unmute voice reply' : 'Mute voice reply'}>
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>

                  {/* Send button */}
                  <button
                    onClick={handleChat}
                    disabled={loading || !chatInput.trim()}
                    className="bg-gradient-to-r from-blue-500 to-blue-600
                      hover:from-blue-600 hover:to-blue-700
                      disabled:from-blue-300 disabled:to-blue-300
                      text-white px-4 py-2.5 rounded-2xl transition shadow-sm">
                    <Send size={16} />
                  </button>
                </div>

              </Card>
            </div>
          </div>
        )}

      </div>

      <footer className="text-center text-xs text-gray-300 py-8 mt-4">
        Smart Tourism Framework · Global Transformer Unimodal ·
        MTA NYC Turnstile · 63,041 records · 378 stations
      </footer>
    </div>
  )
}