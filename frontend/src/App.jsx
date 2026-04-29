import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, LineChart, Line, Legend,
} from 'recharts'
import {
  Train, Search, Send, Mic, MicOff, AlertCircle, Loader,
  Volume2, VolumeX, Star, StarOff, Bell, BellOff, Share2,
  Moon, Sun, Download, Keyboard, X, ChevronDown, ChevronUp,
  Clock, MapPin, BarChart2, MessageSquare, Navigation, TrendingDown,
  BookOpen, Zap, Info,
} from 'lucide-react'
import * as api from './api'

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS (light + dark)
// ═══════════════════════════════════════════════════════════════
const THEMES = {
  light: {
    bg: '#F5F2ED', bgDeep: '#EDEAE4', ink: '#1a1a1a', muted: '#888',
    rule: '#D9D5CE', sidebar: '#1a1a1a', sidebarText: '#F5F2ED',
    red: '#FF4B2B', green: '#1D9E75', amber: '#F5A623',
    cardBg: '#FFFFFF', panelBg: '#F5F2ED',
    display: "'Syne',sans-serif", mono: "'DM Mono',monospace",
  },
  dark: {
    bg: '#0f0f0f', bgDeep: '#1a1a1a', ink: '#F0EDE8', muted: '#666',
    rule: '#2a2a2a', sidebar: '#050505', sidebarText: '#ccc',
    red: '#FF4B2B', green: '#1D9E75', amber: '#F5A623',
    cardBg: '#1a1a1a', panelBg: '#0f0f0f',
    display: "'Syne',sans-serif", mono: "'DM Mono',monospace",
  },
}

const CROWD_CONFIG = {
  sparse  : { bg: '#1D9E75', text: '#fff',    label: 'SPARSE'   },
  moderate: { bg: '#F5A623', text: '#412402', label: 'MODERATE' },
  crowded : { bg: '#FF4B2B', text: '#fff',    label: 'CROWDED'  },
}
const DAY_NAMES   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const TABS = [
  { id: 'predict',   icon: TrendingDown,  label: 'PREDICT'    },
  { id: 'recommend', icon: Navigation,    label: 'RECOMMEND'  },
  { id: 'compare',   icon: BarChart2,     label: 'COMPARE'    },
  { id: 'trends',    icon: Clock,         label: 'TRENDS'     },
  { id: 'chat',      icon: MessageSquare, label: 'AI CHAT'    },
]

// ═══════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════
const CrowdChip = ({ level, size = 'md' }) => {
  const c  = CROWD_CONFIG[level] || CROWD_CONFIG.moderate
  const sz = size === 'sm' ? { fontSize: '10px', padding: '2px 8px' } : { fontSize: '11px', padding: '4px 13px' }
  return (
    <span style={{ background: c.bg, color: c.text, fontWeight: 700, letterSpacing: '.1em', borderRadius: '2px', whiteSpace: 'nowrap', ...sz }}>
      {c.label}
    </span>
  )
}

const Label = ({ children, style, T }) => (
  <div style={{ fontSize: '10px', letterSpacing: '.14em', color: T.muted, marginBottom: '8px', textTransform: 'uppercase', ...style }}>
    {children}
  </div>
)

const HRule = ({ T, style }) => (
  <div style={{ height: '1px', background: T.rule, ...style }} />
)

const Spin = ({ light }) => (
  <Loader size={14} style={{ animation: 'spin 1s linear infinite', color: light ? 'rgba(255,255,255,0.7)' : '#FF4B2B' }} />
)

// ═══════════════════════════════════════════════════════════════
// LEAFLET MAP (with heatmap support)
// ═══════════════════════════════════════════════════════════════
const StationMap = ({ stations, selected, result, showHeatmap, T }) => {
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)
  const markersRef  = useRef([])
  const heatRef     = useRef([])

  useEffect(() => {
    if (!window.L || mapInstance.current) return
    mapInstance.current = window.L.map(mapRef.current).setView([40.7128, -74.006], 11)
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance.current)
  }, [])

  // Heatmap circles
  useEffect(() => {
    if (!mapInstance.current || !window.L) return
    heatRef.current.forEach(c => c.remove())
    heatRef.current = []
    if (!showHeatmap || !stations.length) return
    stations.forEach(s => {
      if (!s.lat || !s.lon) return
      const circle = window.L.circle([s.lat, s.lon], {
        radius: 400,
        color: 'transparent',
        fillColor: '#FF4B2B',
        fillOpacity: 0.15,
      }).addTo(mapInstance.current)
      heatRef.current.push(circle)
    })
  }, [showHeatmap, stations])

  // Station markers
  useEffect(() => {
    if (!mapInstance.current || !window.L) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (!result) return
    const { station_lat: lat, station_lon: lon, station, crowd } = result
    if (lat && lon) {
      const color = CROWD_CONFIG[crowd?.level]?.bg || '#FF4B2B'
      const icon  = window.L.divIcon({
        html: `<div style="width:14px;height:14px;background:${color};border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
        iconSize: [14,14], iconAnchor: [7,7],
      })
      markersRef.current.push(
        window.L.marker([lat, lon], { icon })
          .addTo(mapInstance.current)
          .bindPopup(`<b>${station}</b><br/>Footfall: ${result.footfall?.toFixed(0)}<br/>Level: ${crowd?.level}`)
          .openPopup()
      )
      mapInstance.current.setView([lat, lon], 14)
    }
    result.alternatives?.forEach(alt => {
      if (!alt.lat || !alt.lon) return
      const c2 = CROWD_CONFIG[alt.crowd_level]?.bg || '#888'
      const icon2 = window.L.divIcon({
        html: `<div style="width:10px;height:10px;background:${c2};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>`,
        iconSize: [10,10], iconAnchor: [5,5],
      })
      markersRef.current.push(
        window.L.marker([alt.lat, alt.lon], { icon: icon2 })
          .addTo(mapInstance.current)
          .bindPopup(`<b>${alt.station}</b><br/>${alt.distance_km} km`)
      )
    })
  }, [result])

  return <div ref={mapRef} style={{ height: '100%', width: '100%', minHeight: '220px', zIndex: 0 }} />
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS MODAL
// ═══════════════════════════════════════════════════════════════
const ShortcutsModal = ({ onClose, T }) => {
  const shortcuts = [
    { key: 'P', desc: 'Switch to Predict tab' },
    { key: 'R', desc: 'Switch to Recommend tab' },
    { key: 'C', desc: 'Switch to Compare tab' },
    { key: 'T', desc: 'Switch to Trends tab' },
    { key: 'A', desc: 'Switch to AI Chat tab' },
    { key: 'D', desc: 'Toggle dark mode' },
    { key: 'Enter', desc: 'Run prediction / send chat' },
    { key: 'Esc', desc: 'Close modal / clear result' },
    { key: '?', desc: 'Show this shortcuts panel' },
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: T.cardBg, border: `1px solid ${T.rule}`, borderRadius: '4px', padding: '28px 32px', minWidth: '340px', maxWidth: '90vw' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontFamily: T.display, fontSize: '16px', fontWeight: 800, color: T.ink, letterSpacing: '-0.5px' }}>KEYBOARD SHORTCUTS</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted }}><X size={16} /></button>
        </div>
        {shortcuts.map(({ key, desc }) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${T.rule}` }}>
            <span style={{ fontFamily: T.mono, fontSize: '12px', color: T.muted }}>{desc}</span>
            <kbd style={{ background: T.bgDeep, border: `1px solid ${T.rule}`, borderRadius: '3px', padding: '2px 8px', fontFamily: T.mono, fontSize: '11px', color: T.ink, fontWeight: 700 }}>{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING MODAL
// ═══════════════════════════════════════════════════════════════
const OnboardingModal = ({ onClose, T }) => {
  const [step, setStep] = useState(0)
  const steps = [
    { title: 'Welcome to MTA Footfall', body: 'A smart tourism guide to navigate NYC subway crowds. Powered by AI and real MTA data across 378 stations.', icon: '🗽' },
    { title: 'Predict Crowds', body: 'Select any station, set the hour, day and month — then hit PREDICT NOW to see expected footfall and crowd level instantly.', icon: '📊' },
    { title: 'Get Smart Recommendations', body: 'The Recommend tab finds the best time to visit and quieter nearby alternatives — so you never get stuck in a crowd.', icon: '🧭' },
    { title: 'Compare & Trends', body: 'Use Compare to see two stations side by side. Use Trends to see rush-hour patterns across the full week.', icon: '📈' },
    { title: 'AI Chat Assistant', body: 'Ask anything in any language. The AI understands English, Spanish, French, Chinese, Hindi and more.', icon: '💬' },
  ]
  const s = steps[step]
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: T.cardBg, border: `2px solid ${T.ink}`, borderRadius: '4px', padding: '36px 40px', maxWidth: '420px', width: '90vw', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{s.icon}</div>
        <div style={{ fontFamily: T.display, fontSize: '20px', fontWeight: 800, color: T.ink, letterSpacing: '-0.5px', marginBottom: '12px' }}>{s.title}</div>
        <div style={{ fontFamily: T.mono, fontSize: '13px', color: T.muted, lineHeight: 1.8, marginBottom: '28px' }}>{s.body}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '24px' }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: i === step ? '20px' : '6px', height: '6px', borderRadius: '3px', background: i === step ? T.red : T.rule, transition: 'width 0.3s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ background: T.bgDeep, border: `1px solid ${T.rule}`, color: T.ink, fontFamily: T.mono, fontWeight: 700, fontSize: '12px', padding: '10px 20px', cursor: 'pointer', borderRadius: '2px' }}>
              BACK
            </button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              style={{ background: T.red, border: 'none', color: '#fff', fontFamily: T.mono, fontWeight: 700, fontSize: '12px', padding: '10px 24px', cursor: 'pointer', borderRadius: '2px' }}>
              NEXT →
            </button>
          ) : (
            <button onClick={onClose}
              style={{ background: T.red, border: 'none', color: '#fff', fontFamily: T.mono, fontWeight: 700, fontSize: '12px', padding: '10px 24px', cursor: 'pointer', borderRadius: '2px' }}>
              GET STARTED →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════
const Sidebar = ({
  T, tab, setTab, stations, stFilter, setStFilter, station, setStation,
  hour, setHour, dow, setDow, month, setMonth,
  loading, onAction, setResult, setError,
  favorites, toggleFavorite, recentSearches,
  alerts, toggleAlert, darkMode, setDarkMode, setShowShortcuts,
}) => {
  const filtered = stations.filter(s => s.name.toLowerCase().includes(stFilter.toLowerCase()))
  const actionLabel = tab === 'predict' ? '→ PREDICT NOW' : tab === 'recommend' ? '→ GET RECOMMENDATION' : null
  const isFav = favorites.includes(station)
  const hasAlert = alerts.includes(station)

  return (
    <div style={{ width: '300px', flexShrink: 0, background: T.sidebar, color: T.sidebarText, display: 'flex', flexDirection: 'column', fontFamily: T.mono, overflowY: 'auto' }}>

      {/* Station section */}
      <div style={{ padding: '20px 18px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', letterSpacing: '.14em', color: '#666', textTransform: 'uppercase' }}>STATION</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button title={isFav ? 'Remove favourite' : 'Add favourite'} onClick={() => toggleFavorite(station)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: isFav ? T.amber : '#444', padding: '2px' }}>
              <Star size={13} fill={isFav ? T.amber : 'none'} />
            </button>
            <button title={hasAlert ? 'Remove alert' : 'Alert when sparse'} onClick={() => toggleAlert(station)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: hasAlert ? T.green : '#444', padding: '2px' }}>
              <Bell size={13} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #2e2e2e', paddingBottom: '7px', marginBottom: '8px' }}>
          <Search size={12} color="#555" />
          <input
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#aaa', fontFamily: T.mono, fontSize: '12px', width: '100%' }}
            placeholder="Search..."
            value={stFilter}
            onChange={e => setStFilter(e.target.value)} />
          {stFilter && <button onClick={() => setStFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 0 }}><X size={11} /></button>}
        </div>

        {/* Favourites quick-pick */}
        {favorites.length > 0 && !stFilter && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '9px', color: '#444', letterSpacing: '.1em', marginBottom: '4px' }}>★ FAVOURITES</div>
            {favorites.map(fav => (
              <div key={fav} onClick={() => setStation(fav)}
                style={{ padding: '6px 10px', fontSize: '11px', cursor: 'pointer', color: fav === station ? '#F5F2ED' : T.amber, borderLeft: fav === station ? `3px solid ${T.red}` : `3px solid ${T.amber}33` }}>
                {fav}
              </div>
            ))}
            <div style={{ height: '1px', background: '#222', margin: '8px 0' }} />
          </div>
        )}

        {/* Recent searches */}
        {recentSearches.length > 0 && !stFilter && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '9px', color: '#444', letterSpacing: '.1em', marginBottom: '4px' }}>RECENT</div>
            {recentSearches.slice(0,3).map(r => (
              <div key={r} onClick={() => setStation(r)}
                style={{ padding: '5px 10px', fontSize: '11px', cursor: 'pointer', color: r === station ? '#F5F2ED' : '#555', borderLeft: r === station ? `3px solid ${T.red}` : '3px solid transparent' }}>
                ↺ {r}
              </div>
            ))}
            <div style={{ height: '1px', background: '#222', margin: '8px 0' }} />
          </div>
        )}

        {/* Station list */}
        <div>
          {filtered.slice(0, 7).map(s => (
            <div key={s.name} onClick={() => setStation(s.name)}
              style={{ padding: '9px 10px', fontSize: '12px', cursor: 'pointer', borderLeft: s.name === station ? `3px solid ${T.red}` : '3px solid transparent', color: s.name === station ? '#F5F2ED' : '#666', fontWeight: s.name === station ? 500 : 400 }}>
              {s.name}
            </div>
          ))}
          {filtered.length > 7 && (
            <div style={{ padding: '6px 10px', fontSize: '10px', color: '#444' }}>+{filtered.length - 7} more — refine search</div>
          )}
        </div>
      </div>

      <div style={{ height: '1px', background: '#2a2a2a', margin: '16px 0' }} />

      {/* Hour slider */}
      <div style={{ padding: '0 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', letterSpacing: '.14em', color: '#666', textTransform: 'uppercase' }}>HOUR</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: T.red }}>{String(hour).padStart(2,'0')}:00</span>
        </div>
        <input type="range" min={0} max={23} value={hour}
          onChange={e => setHour(parseInt(e.target.value))}
          className="red-range" style={{ width: '100%', marginBottom: '6px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#444' }}>
          <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>

      <div style={{ height: '1px', background: '#2a2a2a', margin: '16px 0' }} />

      {/* Day + Month */}
      <div style={{ padding: '0 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.14em', color: '#666', textTransform: 'uppercase', marginBottom: '6px' }}>DAY</div>
          <div style={{ position: 'relative' }}>
            <select style={{ background: '#111', border: 'none', color: '#F5F2ED', fontFamily: T.mono, fontSize: '12px', padding: '8px 10px', width: '100%', outline: 'none', appearance: 'none', cursor: 'pointer' }}
              value={dow} onChange={e => setDow(parseInt(e.target.value))}>
              {DAY_NAMES.map((d,i) => <option key={i} value={i} style={{ background:'#111' }}>{d}</option>)}
            </select>
            <span style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', color:'#555', pointerEvents:'none', fontSize:'9px' }}>▼</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.14em', color: '#666', textTransform: 'uppercase', marginBottom: '6px' }}>MONTH</div>
          <div style={{ position: 'relative' }}>
            <select style={{ background: '#111', border: 'none', color: '#F5F2ED', fontFamily: T.mono, fontSize: '12px', padding: '8px 10px', width: '100%', outline: 'none', appearance: 'none', cursor: 'pointer' }}
              value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTH_FULL.map((m,i) => <option key={i} value={i} style={{ background:'#111' }}>{m}</option>)}
            </select>
            <span style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', color:'#555', pointerEvents:'none', fontSize:'9px' }}>▼</span>
          </div>
        </div>
      </div>

      {/* Action button */}
      {actionLabel && (
        <div style={{ padding: '16px 18px 0' }}>
          <button onClick={onAction} disabled={loading || !station}
            style={{ background: loading || !station ? '#2a2a2a' : T.red, border: 'none', color: loading || !station ? '#555' : '#fff', fontFamily: T.mono, fontWeight: 700, fontSize: '13px', letterSpacing: '.1em', padding: '13px', width: '100%', cursor: loading || !station ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '2px' }}>
            {loading ? <><Spin light /> LOADING…</> : actionLabel}
          </button>
        </div>
      )}

      <div style={{ height: '1px', background: '#2a2a2a', margin: '18px 0 0' }} />

      {/* Tab switcher */}
      <div style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '.14em', color: '#666', textTransform: 'uppercase', marginBottom: '8px' }}>VIEW</div>
        {TABS.map(({ id, icon: Icon, label }) => (
          <div key={id} onClick={() => { setTab(id); setResult(null); setError('') }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: T.mono, fontSize: '12px', fontWeight: 700, letterSpacing: '.06em', padding: '8px 10px', cursor: 'pointer', borderRadius: '2px', marginBottom: '2px', background: tab === id ? T.red : 'transparent', color: tab === id ? '#fff' : '#555' }}>
            <Icon size={12} />
            {label}
          </div>
        ))}
      </div>

      <div style={{ height: '1px', background: '#2a2a2a' }} />

      {/* Bottom utility buttons */}
      <div style={{ padding: '12px 18px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { icon: darkMode ? Sun : Moon,  title: 'Toggle dark mode',  onClick: () => setDarkMode(d => !d) },
          { icon: Keyboard,               title: 'Keyboard shortcuts', onClick: () => setShowShortcuts(true) },
        ].map(({ icon: Icon, title, onClick }) => (
          <button key={title} title={title} onClick={onClick}
            style={{ background: '#1e1e1e', border: '1px solid #2a2a2a', color: '#555', padding: '7px 10px', cursor: 'pointer', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: T.mono }}>
            <Icon size={12} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PREDICT PANEL
// ═══════════════════════════════════════════════════════════════
const PredictPanel = ({ T, result, loading, hour, dow, month, stations, station, showHeatmap, setShowHeatmap, onExport, onShare }) => {
  const pf       = result?.prediction?.predicted_footfall
  const mean     = result?.prediction?.station_mean
  const abovePct = pf && mean ? Math.round((pf / mean - 1) * 100) : null
  const hasResult = result?.type === 'predict'

  const hourlyData = useMemo(() => Array.from({ length: 24 }, (_, h) => {
    const base  = mean || 5000
    const curve = Math.sin((h - 4) * Math.PI / 12) * 0.5 + 0.5
    return { hour: `${h}h`, val: Math.round(base * (0.3 + curve * 0.9)), h }
  }), [mean])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: T.panelBg }}>
      {/* Hero */}
      {hasResult ? (
        <div style={{ background: T.red, padding: '24px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.14em', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', textTransform: 'uppercase' }}>PREDICTED FOOTFALL</div>
            <div style={{ fontFamily: T.display, fontSize: '60px', fontWeight: 800, color: '#fff', letterSpacing: '-3px', lineHeight: 1 }}>{pf?.toLocaleString()}</div>
            <div style={{ fontFamily: T.mono, fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginTop: '8px' }}>
              {result.prediction?.station} · {String(hour).padStart(2,'0')}:00 · {DAY_NAMES[dow].slice(0,3).toUpperCase()} · {MONTH_SHORT[month].toUpperCase()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <CrowdChip level={result.crowd?.level} />
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', textTransform: 'uppercase' }}>CAPACITY</div>
              <div style={{ fontFamily: T.display, fontSize: '40px', fontWeight: 800, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>{result.crowd?.capacity_pct}%</div>
            </div>
            {/* Share + Export */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '12px', justifyContent: 'flex-end' }}>
              <button onClick={onShare} title="Share prediction" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 10px', cursor: 'pointer', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: T.mono }}>
                <Share2 size={11} /> SHARE
              </button>
              <button onClick={onExport} title="Export CSV" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 10px', cursor: 'pointer', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: T.mono }}>
                <Download size={11} /> CSV
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: '#111', padding: '28px 30px', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', letterSpacing: '.14em', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>FOOTFALL PREDICTION</div>
          <div style={{ fontFamily: T.display, fontSize: '26px', fontWeight: 800, color: '#9a9a9a', letterSpacing: '-1px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {loading ? 'ANALYSING…' : 'SELECT A STATION & PREDICT →'}
            {loading && <Spin light />}
          </div>
        </div>
      )}

      {hasResult && (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid ${T.rule}`, flexShrink: 0 }}>
            {[
              { label: 'STATION AVERAGE', val: mean?.toLocaleString(), sub: 'passengers / hr', color: T.ink },
              { label: 'ABOVE AVERAGE', val: abovePct != null ? `${abovePct > 0 ? '+' : ''}${abovePct}%` : '—', sub: `vs typical ${DAY_NAMES[dow].toLowerCase()}`, color: abovePct > 0 ? T.red : T.green },
              { label: 'CAPACITY INDEX', val: `${result.crowd?.capacity_pct}%`, sub: result.crowd?.level, color: CROWD_CONFIG[result.crowd?.level]?.bg },
            ].map(({ label, val, sub, color }) => (
              <div key={label} style={{ padding: '16px 24px', borderRight: `1px solid ${T.rule}`, background: T.cardBg }}>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', color: T.muted, textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
                <div style={{ fontFamily: T.display, fontSize: '34px', fontWeight: 800, letterSpacing: '-1.5px', color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontFamily: T.mono, fontSize: '11px', color: T.muted, marginTop: '4px' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Hourly chart */}
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.rule}`, background: T.cardBg, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '.12em', color: T.muted, textTransform: 'uppercase' }}>HOURLY DISTRIBUTION TODAY</div>
              <div style={{ fontFamily: T.mono, fontSize: '10px', color: T.red }}>▲ {String(hour).padStart(2,'0')}:00 selected</div>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={hourlyData} margin={{ top:2, right:0, left:-28, bottom:0 }}>
                <CartesianGrid strokeDasharray="0" stroke={T.rule} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize:10, fill:T.muted, fontFamily:T.mono }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={v => [`${v.toLocaleString()} pax`,'Footfall']} contentStyle={{ background: '#111', border:'none', fontFamily:T.mono, fontSize:'11px', color:'#eee', borderRadius:'2px' }} />
                <Bar dataKey="val" radius={[1,1,0,0]} maxBarSize={20}>
                  {hourlyData.map((e,i) => <Cell key={i} fill={e.h === hour ? T.red : T.rule} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Map + heatmap toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: '260px' }}>
            <div style={{ padding: '16px 22px', borderRight: `1px solid ${T.rule}`, background: T.cardBg }}>
              <div style={{ fontSize: '10px', letterSpacing: '.12em', color: T.muted, textTransform: 'uppercase', marginBottom: '8px' }}>QUIETER NEARBY</div>
              <div style={{ fontFamily: T.mono, fontSize: '12px', color: T.muted, lineHeight: 1.7 }}>
                Switch to the <strong style={{ color: T.ink }}>Recommend</strong> tab to find nearby quieter stations with alternative timing suggestions.
              </div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', background: T.cardBg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', color: T.muted, textTransform: 'uppercase' }}>STATION MAP</div>
                <button onClick={() => setShowHeatmap(h => !h)}
                  style={{ background: showHeatmap ? T.red : T.bgDeep, border: `1px solid ${T.rule}`, color: showHeatmap ? '#fff' : T.muted, fontFamily: T.mono, fontSize: '9px', padding: '3px 8px', cursor: 'pointer', borderRadius: '2px', letterSpacing: '.06em' }}>
                  {showHeatmap ? '● HEATMAP ON' : '○ HEATMAP'}
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <StationMap T={T} stations={stations} selected={station} showHeatmap={showHeatmap} result={{
                  station_lat: stations.find(s => s.name === station)?.lat,
                  station_lon: stations.find(s => s.name === station)?.lon,
                  station, crowd: result.crowd, footfall: pf, alternatives: [],
                }} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// RECOMMEND PANEL
// ═══════════════════════════════════════════════════════════════
const RecommendPanel = ({ T, result, loading, hour, dow, month, stations, station, showHeatmap, setShowHeatmap }) => {
  const pf = result?.footfall
  const hasResult = result?.type === 'recommend'
  const hourlyData = useMemo(() => hasResult && result.best_time?.all_predictions
    ? Object.entries(result.best_time.all_predictions).map(([h,v]) => ({ hour:`${h}h`, val: Math.round(v), h: parseInt(h) }))
    : [], [result])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: T.panelBg }}>
      {hasResult ? (
        <>
          <div style={{ background: T.red, padding: '24px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.14em', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', textTransform: 'uppercase' }}>CURRENT FOOTFALL</div>
              <div style={{ fontFamily: T.display, fontSize: '60px', fontWeight: 800, color: '#fff', letterSpacing: '-3px', lineHeight: 1 }}>{pf?.toFixed(0)}</div>
              <div style={{ fontFamily: T.mono, fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginTop: '8px' }}>{result.station} · {result.hour_used}:00</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <CrowdChip level={result.crowd?.level} />
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: '4px' }}>BEST HOUR</div>
                <div style={{ fontFamily: T.display, fontSize: '40px', fontWeight: 800, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>{result.best_time?.best_hour}:00</div>
                <div style={{ fontFamily: T.mono, fontSize: '11px', color: 'rgba(255,255,255,0.65)', marginTop: '4px' }}>−{result.best_time?.pct_reduction}% less crowded</div>
              </div>
            </div>
          </div>

          {hourlyData.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.rule}`, background: T.cardBg, flexShrink: 0 }}>
              <div style={{ fontSize: '10px', letterSpacing: '.12em', color: T.muted, textTransform: 'uppercase', marginBottom: '12px' }}>HOURLY DISTRIBUTION</div>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={hourlyData} margin={{ top:2, right:0, left:-28, bottom:0 }}>
                  <CartesianGrid strokeDasharray="0" stroke={T.rule} vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize:10, fill:T.muted, fontFamily:T.mono }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={v => [`${v.toLocaleString()} pax`,'Footfall']} contentStyle={{ background:'#111', border:'none', fontFamily:T.mono, fontSize:'11px', color:'#eee', borderRadius:'2px' }} />
                  <Bar dataKey="val" radius={[1,1,0,0]} maxBarSize={20}>
                    {hourlyData.map((e,i) => <Cell key={i} fill={e.h === result.best_time?.best_hour ? T.green : e.h === result.hour_used ? T.red : T.rule} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', gap:'16px', fontFamily:T.mono, fontSize:'10px', color:T.muted, marginTop:'6px' }}>
                {[{c:T.green,l:'Best'},{c:T.red,l:'Requested'},{c:T.rule,l:'Other'}].map(({c,l}) => (
                  <span key={l} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                    <span style={{ width:'10px', height:'10px', background:c, display:'inline-block', borderRadius:'1px' }}/>{l}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: result.alternatives?.length > 0 ? '1fr 1fr' : '1fr', flex: 1, minHeight: '260px' }}>
            {result.alternatives?.length > 0 && (
              <div style={{ padding: '16px 24px', borderRight: `1px solid ${T.rule}`, background: T.cardBg }}>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', color: T.muted, textTransform: 'uppercase', marginBottom: '12px' }}>QUIETER NEARBY</div>
                {result.alternatives.map((alt, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`1px solid ${T.rule}`, padding:'11px 0' }}>
                    <div>
                      <div style={{ fontFamily:T.display, fontSize:'14px', fontWeight:700, color:T.ink }}>{alt.station}</div>
                      <div style={{ fontFamily:T.mono, fontSize:'10px', color:T.muted, marginTop:'2px' }}>{alt.distance_km} km · −{alt.pct_less_crowded}%</div>
                    </div>
                    <CrowdChip level={alt.crowd_level} size="sm" />
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', background: T.cardBg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', color: T.muted, textTransform: 'uppercase' }}>STATION MAP</div>
                <button onClick={() => setShowHeatmap(h => !h)}
                  style={{ background: showHeatmap ? T.red : T.bgDeep, border: `1px solid ${T.rule}`, color: showHeatmap ? '#fff' : T.muted, fontFamily: T.mono, fontSize: '9px', padding: '3px 8px', cursor: 'pointer', borderRadius: '2px' }}>
                  {showHeatmap ? '● HEATMAP ON' : '○ HEATMAP'}
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <StationMap T={T} stations={stations} selected={station} showHeatmap={showHeatmap} result={result} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ background: '#111', padding: '28px 30px', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', letterSpacing: '.14em', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>SMART RECOMMENDATION</div>
          <div style={{ fontFamily: T.display, fontSize: '26px', fontWeight: 800, color: '#9a9a9a', letterSpacing: '-1px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {loading ? 'ANALYSING…' : 'SELECT A STATION & RECOMMEND →'}
            {loading && <Spin light />}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// COMPARE PANEL
// ═══════════════════════════════════════════════════════════════
const ComparePanel = ({ T, stations, hour, dow, month, isWeekend }) => {
  const [stA, setStA] = useState('')
  const [stB, setStB] = useState('')
  const [resA, setResA] = useState(null)
  const [resB, setResB] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleCompare = async () => {
    if (!stA || !stB) return
    setLoading(true)
    try {
      const [rA, rB] = await Promise.all([
        api.predict(stA, hour, dow, month + 1, isWeekend),
        api.predict(stB, hour, dow, month + 1, isWeekend),
      ])
      setResA(rA.data)
      setResB(rB.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const barData = resA && resB ? [
    { name: stA.slice(0,14), val: Math.round(resA.prediction?.predicted_footfall || 0) },
    { name: stB.slice(0,14), val: Math.round(resB.prediction?.predicted_footfall || 0) },
  ] : []

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.panelBg }}>
      <div style={{ background: '#111', padding: '24px 30px', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', letterSpacing: '.14em', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>COMPARISON MODE</div>
        <div style={{ fontFamily: T.display, fontSize: '22px', fontWeight: 800, color: '#c8c5c0', letterSpacing: '-1px' }}>SIDE BY SIDE STATION COMPARE</div>
      </div>

      <div style={{ padding: '24px 28px', background: T.cardBg, borderBottom: `1px solid ${T.rule}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '14px', alignItems: 'flex-end' }}>
          {[
            { label: 'STATION A', val: stA, set: setStA, color: T.red },
            { label: 'STATION B', val: stB, set: setStB, color: '#6366f1' },
          ].map(({ label, val, set, color }) => (
            <div key={label}>
              <div style={{ fontSize: '10px', color: T.muted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
              <div style={{ position: 'relative' }}>
                <select style={{ background: T.bgDeep, border: `1px solid ${color}44`, color: T.ink, fontFamily: T.mono, fontSize: '12px', padding: '9px 10px', width: '100%', outline: 'none', appearance: 'none', borderRadius: '2px' }}
                  value={val} onChange={e => set(e.target.value)}>
                  <option value="">— pick station —</option>
                  {stations.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
                <span style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', color:T.muted, pointerEvents:'none', fontSize:'9px' }}>▼</span>
              </div>
            </div>
          ))}
          <button onClick={handleCompare} disabled={loading || !stA || !stB}
            style={{ background: loading || !stA || !stB ? T.rule : T.red, border: 'none', color: '#fff', fontFamily: T.mono, fontWeight: 700, fontSize: '12px', padding: '10px 18px', cursor: loading || !stA || !stB ? 'not-allowed' : 'pointer', borderRadius: '2px', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            {loading ? <Spin light /> : <Zap size={12} />} COMPARE
          </button>
        </div>
      </div>

      {resA && resB && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${T.rule}` }}>
            {[
              { res: resA, st: stA, color: T.red },
              { res: resB, st: stB, color: '#6366f1' },
            ].map(({ res, st, color }) => (
              <div key={st} style={{ padding: '20px 24px', borderRight: `1px solid ${T.rule}`, background: T.cardBg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontFamily: T.display, fontSize: '15px', fontWeight: 800, color, letterSpacing: '-0.3px' }}>{st}</div>
                    <div style={{ fontFamily: T.mono, fontSize: '10px', color: T.muted, marginTop: '3px' }}>{String(hour).padStart(2,'0')}:00 · {DAY_NAMES[dow].slice(0,3)}</div>
                  </div>
                  <CrowdChip level={res.crowd?.level} size="sm" />
                </div>
                <div style={{ fontFamily: T.display, fontSize: '42px', fontWeight: 800, color, letterSpacing: '-2px', lineHeight: 1 }}>
                  {res.prediction?.predicted_footfall?.toLocaleString()}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: '11px', color: T.muted, marginTop: '4px' }}>passengers predicted</div>
                <div style={{ marginTop: '12px', height: '4px', background: T.rule, borderRadius: '2px' }}>
                  <div style={{ width: `${res.crowd?.capacity_pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.6s' }} />
                </div>
                <div style={{ fontFamily: T.mono, fontSize: '10px', color: T.muted, marginTop: '4px' }}>Capacity: {res.crowd?.capacity_pct}%</div>
              </div>
            ))}
          </div>

          {/* Bar comparison */}
          <div style={{ padding: '20px 24px', background: T.cardBg }}>
            <div style={{ fontSize: '10px', color: T.muted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '12px' }}>FOOTFALL COMPARISON</div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={barData} margin={{ top:4, right:10, left:-10, bottom:0 }}>
                <CartesianGrid strokeDasharray="0" stroke={T.rule} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize:11, fill:T.muted, fontFamily:T.mono }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:T.muted, fontFamily:T.mono }} />
                <Tooltip formatter={v => [`${v.toLocaleString()} pax`,'Footfall']} contentStyle={{ background:'#111', border:'none', fontFamily:T.mono, fontSize:'11px', color:'#eee', borderRadius:'2px' }} />
                <Bar dataKey="val" radius={[2,2,0,0]}>
                  <Cell fill={T.red} />
                  <Cell fill="#6366f1" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Winner badge */}
            {resA && resB && (
              <div style={{ marginTop: '14px', padding: '10px 14px', background: T.bgDeep, border: `1px solid ${T.rule}`, borderRadius: '2px', fontFamily: T.mono, fontSize: '12px', color: T.ink }}>
                {resA.prediction?.predicted_footfall < resB.prediction?.predicted_footfall
                  ? <><span style={{ color: T.green, fontWeight: 700 }}>✓ {stA}</span> is less crowded — better choice at {String(hour).padStart(2,'0')}:00</>
                  : resB.prediction?.predicted_footfall < resA.prediction?.predicted_footfall
                  ? <><span style={{ color: T.green, fontWeight: 700 }}>✓ {stB}</span> is less crowded — better choice at {String(hour).padStart(2,'0')}:00</>
                  : <>Both stations have similar crowd levels at this time.</>
                }
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TRENDS PANEL
// ═══════════════════════════════════════════════════════════════
const TrendsPanel = ({ T, stations, station, month, isWeekend }) => {
  const [loading, setLoading] = useState(false)
  const [weekData, setWeekData] = useState(null)

  const fetchTrends = useCallback(async () => {
    if (!station) return
    setLoading(true)
    try {
      // Fetch predictions for all 7 days at peak hours
      const hours  = [8, 12, 17, 20]
      const days   = [0,1,2,3,4,5,6]
      const results = await Promise.all(
        days.map(d => api.predict(station, 17, d, month + 1, d >= 5 ? 1 : 0))
      )
      setWeekData(results.map((r, i) => ({
        day: DAY_NAMES[i].slice(0,3),
        footfall: Math.round(r.data.prediction?.predicted_footfall || 0),
        level: r.data.crowd?.level,
      })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [station, month])

  // Rush-hour radar data
  const radarData = weekData ? weekData.map(d => ({
    day: d.day,
    pax: d.footfall,
    fullMark: Math.max(...weekData.map(x => x.footfall)) * 1.2,
  })) : []

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.panelBg }}>
      <div style={{ background: '#111', padding: '24px 30px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '.14em', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>WEEKLY TRENDS</div>
        <div style={{ fontFamily: T.display, fontSize: '22px', fontWeight: 800, color: '#c8c5c0', letterSpacing: '-1px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          {station || 'SELECT A STATION'}
          {loading && <Spin light />}
        </div>
        {station && (
          <button onClick={fetchTrends} disabled={loading}
            style={{ marginTop: '12px', background: T.red, border: 'none', color: '#fff', fontFamily: T.mono, fontWeight: 700, fontSize: '12px', padding: '9px 18px', cursor: loading ? 'not-allowed' : 'pointer', borderRadius: '2px', letterSpacing: '.06em', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <BarChart2 size={12} /> LOAD WEEKLY TRENDS
          </button>
        )}
      </div>

      {weekData && (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Week bar chart */}
          <div style={{ background: T.cardBg, border: `1px solid ${T.rule}`, padding: '18px 20px', borderRadius: '2px' }}>
            <div style={{ fontSize: '10px', color: T.muted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '14px' }}>FOOTFALL BY DAY (5PM PEAK)</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={weekData} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="0" stroke={T.rule} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize:11, fill:T.muted, fontFamily:T.mono }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:T.muted, fontFamily:T.mono }} />
                <Tooltip formatter={v => [`${v.toLocaleString()} pax`,'Footfall']} contentStyle={{ background:'#111', border:'none', fontFamily:T.mono, fontSize:'11px', color:'#eee', borderRadius:'2px' }} />
                <Bar dataKey="footfall" radius={[2,2,0,0]} maxBarSize={36}>
                  {weekData.map((d, i) => <Cell key={i} fill={CROWD_CONFIG[d.level]?.bg || T.rule} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Radar / clock chart */}
          <div style={{ background: T.cardBg, border: `1px solid ${T.rule}`, padding: '18px 20px', borderRadius: '2px' }}>
            <div style={{ fontSize: '10px', color: T.muted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '14px' }}>RUSH HOUR RADAR</div>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData} margin={{ top:10, right:20, bottom:10, left:20 }}>
                <PolarGrid stroke={T.rule} />
                <PolarAngleAxis dataKey="day" tick={{ fontSize:11, fill:T.muted, fontFamily:T.mono }} />
                <Radar name="Footfall" dataKey="pax" stroke={T.red} fill={T.red} fillOpacity={0.2} strokeWidth={2} />
                <Tooltip formatter={v => [`${v.toLocaleString()} pax`,'Footfall']} contentStyle={{ background:'#111', border:'none', fontFamily:T.mono, fontSize:'11px', color:'#eee', borderRadius:'2px' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Day summary chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '8px' }}>
            {weekData.map(d => (
              <div key={d.day} style={{ background: T.cardBg, border: `1px solid ${T.rule}`, padding: '10px 8px', textAlign: 'center', borderRadius: '2px' }}>
                <div style={{ fontFamily: T.mono, fontSize: '10px', color: T.muted, marginBottom: '6px' }}>{d.day}</div>
                <div style={{ fontFamily: T.display, fontSize: '14px', fontWeight: 800, color: T.ink }}>{(d.footfall/1000).toFixed(1)}k</div>
                <div style={{ marginTop: '6px' }}><CrowdChip level={d.level} size="sm" /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CHAT PANEL
// ═══════════════════════════════════════════════════════════════
const ChatPanel = ({ T, messages, loading, chatInput, setChatInput, onSend, voice, isMuted, setIsMuted, synthRef }) => {
  const chatEnd = useRef(null)
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Suggested follow-ups based on last message
  const suggestions = useMemo(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role === 'user') return []
    return [
      'What about the weekend?',
      'Find me a quieter alternative',
      'Best time to visit?',
      'How crowded at rush hour?',
    ]
  }, [messages])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.panelBg }}>
      {/* Header */}
      <div style={{ background: '#111', padding: '16px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.14em', color: '#555', textTransform: 'uppercase', marginBottom: '2px' }}>MULTILINGUAL AI ASSISTANT</div>
          <div style={{ fontFamily: T.display, fontSize: '18px', fontWeight: 800, color: '#c8c5c0', letterSpacing: '-0.5px' }}>ASK ANYTHING</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {voice.supported && (
            <button onClick={voice.toggle} title="Voice input"
              style={{ background: voice.listening ? T.red : '#2a2a2a', border: 'none', padding: '8px 10px', cursor: 'pointer', color: voice.listening ? '#fff' : '#666', borderRadius: '2px' }}>
              {voice.listening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
          <button onClick={() => { if (!isMuted) synthRef.current.cancel(); setIsMuted(m => !m) }} title="Toggle voice reply"
            style={{ background: '#2a2a2a', border: `1px solid ${isMuted ? '#333' : '#1D9E75'}`, padding: '8px 10px', cursor: 'pointer', color: isMuted ? '#555' : '#1D9E75', borderRadius: '2px' }}>
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
      </div>
      <div style={{ height: '1px', background: T.rule }} />

      {/* Hint chips */}
      <div style={{ padding: '9px 22px', background: T.bgDeep, borderBottom: `1px solid ${T.rule}`, display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
        {['"Is 42nd St busy at 6pm?"','"¿Está llena la 34th St?"','"Est-ce bondé à 18h?"','"晚上拥挤吗？"'].map(hint => (
          <span key={hint} onClick={() => setChatInput(hint.replace(/"/g,''))}
            style={{ fontFamily: T.mono, fontSize: '10px', color: T.muted, background: T.bg, padding: '3px 8px', border: `1px solid ${T.rule}`, cursor: 'pointer', borderRadius: '2px' }}>
            {hint}
          </span>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '72%', padding: '10px 14px',
              fontFamily: T.mono, fontSize: '12px', lineHeight: '1.7', whiteSpace: 'pre-line',
              background: m.role === 'user' ? '#1a1a1a' : T.bgDeep,
              color: m.role === 'user' ? '#F5F2ED' : T.ink,
              borderRadius: m.role === 'user' ? '2px 2px 2px 12px' : '2px 2px 12px 2px',
              boxShadow: m.role === 'user' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: T.bgDeep, padding: '10px 14px', fontFamily: T.mono, fontSize: '12px', color: T.muted, borderRadius: '2px 2px 12px 2px', display: 'flex', gap: '5px', alignItems: 'center' }}>
              {[0,1,2].map(i => (
                <span key={i} style={{ width:'6px', height:'6px', background:T.muted, borderRadius:'50%', display:'inline-block', animation:`bounce 1s ${i*0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      {/* Follow-up suggestions */}
      {suggestions.length > 0 && !loading && (
        <div style={{ padding: '8px 22px', borderTop: `1px solid ${T.rule}`, display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
          {suggestions.map(s => (
            <span key={s} onClick={() => { setChatInput(s); }}
              style={{ fontFamily: T.mono, fontSize: '10px', color: T.red, background: T.bg, padding: '3px 10px', border: `1px solid ${T.red}44`, cursor: 'pointer', borderRadius: '20px' }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: `2px solid ${T.ink}`, display: 'flex', flexShrink: 0 }}>
        <input
          style={{ flex: 1, padding: '15px 18px', background: T.bgDeep, border: 'none', outline: 'none', fontFamily: T.mono, fontSize: '13px', color: T.ink }}
          placeholder="Ask in any language..."
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && onSend()} />
        <button onClick={onSend} disabled={loading || !chatInput.trim()}
          style={{ background: loading || !chatInput.trim() ? T.rule : T.red, border: 'none', padding: '15px 22px', cursor: loading || !chatInput.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Send size={15} color={loading || !chatInput.trim() ? T.muted : '#fff'} />
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const now = new Date()

  // Core state
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

  // New feature state
  const [darkMode,       setDarkMode]       = useState(false)
  const [favorites,      setFavorites]      = useState(() => { try { return JSON.parse(localStorage.getItem('mta_favs') || '[]') } catch { return [] } })
  const [alerts,         setAlerts]         = useState(() => { try { return JSON.parse(localStorage.getItem('mta_alerts') || '[]') } catch { return [] } })
  const [recentSearches, setRecentSearches] = useState(() => { try { return JSON.parse(localStorage.getItem('mta_recent') || '[]') } catch { return [] } })
  const [showHeatmap,    setShowHeatmap]    = useState(false)
  const [showShortcuts,  setShowShortcuts]  = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('mta_seen'))

  // Chat state
  const [messages,  setMessages]  = useState([{
    role: 'assistant',
    text: 'Ask me about NYC subway crowds in any language.\n"Is Times Sq busy at 6pm?"\n"¿Está llena la 34th St a las 8am?"\n"Est-ce bondé à Canal St le matin?"',
  }])
  const [chatInput, setChatInput] = useState('')
  const [isMuted,   setIsMuted]   = useState(false)
  const synthRef = useRef(window.speechSynthesis)

  const T = THEMES[darkMode ? 'dark' : 'light']

  // Persist favourites + alerts
  useEffect(() => { try { localStorage.setItem('mta_favs', JSON.stringify(favorites)) } catch {} }, [favorites])
  useEffect(() => { try { localStorage.setItem('mta_alerts', JSON.stringify(alerts)) } catch {} }, [alerts])
  useEffect(() => { try { localStorage.setItem('mta_recent', JSON.stringify(recentSearches)) } catch {} }, [recentSearches])

  const toggleFavorite = useCallback((s) => {
    setFavorites(prev => prev.includes(s) ? prev.filter(x => x !== s) : [s, ...prev].slice(0, 5))
  }, [])
  const toggleAlert = useCallback((s) => {
    setAlerts(prev => prev.includes(s) ? prev.filter(x => x !== s) : [s, ...prev])
  }, [])

  // Track recent searches
  useEffect(() => {
    if (!station) return
    setRecentSearches(prev => [station, ...prev.filter(x => x !== station)].slice(0, 5))
  }, [station])

  const speakText = useCallback((text) => {
    if (isMuted || !window.speechSynthesis) return
    synthRef.current.cancel()
    const clean = text.replace(/[\u{1F000}-\u{1FFFF}]/gu,'').replace(/[•*_~`#]/g,'').replace(/\n+/g,'. ').trim()
    if (!clean) return
    const u = new SpeechSynthesisUtterance(clean)
    const v = synthRef.current.getVoices()
    const pref = v.find(x => x.lang.startsWith('en') && x.name.toLowerCase().includes('natural')) || v.find(x => x.lang.startsWith('en')) || v[0]
    if (pref) u.voice = pref
    synthRef.current.speak(u)
  }, [isMuted])

  useEffect(() => () => synthRef.current.cancel(), [])
  useEffect(() => { synthRef.current.cancel() }, [tab])
  useEffect(() => { setIsWeekend(dow >= 5 ? 1 : 0) }, [dow])

  // Voice input
  const [voiceListening, setVoiceListening] = useState(false)
  const voiceRef = useRef(null)
  const voiceSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  const voiceToggle = useCallback(() => {
    if (!voiceSupported) return
    if (voiceListening) { voiceRef.current?.stop(); setVoiceListening(false); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    voiceRef.current = new SR()
    voiceRef.current.continuous = false; voiceRef.current.interimResults = false; voiceRef.current.lang = 'en-US'
    voiceRef.current.onresult = (e) => { setChatInput(p => p + e.results[0][0].transcript); setVoiceListening(false) }
    voiceRef.current.onerror = () => setVoiceListening(false)
    voiceRef.current.onend   = () => setVoiceListening(false)
    voiceRef.current.start(); setVoiceListening(true)
  }, [voiceListening, voiceSupported])
  const voice = { listening: voiceListening, toggle: voiceToggle, supported: voiceSupported }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return
      const map = { p:'predict', r:'recommend', c:'compare', t:'trends', a:'chat' }
      if (map[e.key.toLowerCase()]) { setTab(map[e.key.toLowerCase()]); setResult(null); setError('') }
      if (e.key === 'd') setDarkMode(m => !m)
      if (e.key === '?') setShowShortcuts(s => !s)
      if (e.key === 'Escape') { setShowShortcuts(false); setShowOnboarding(false); setResult(null) }
      if (e.key === 'Enter' && tab !== 'chat') {
        if (tab === 'predict') handlePredict()
        if (tab === 'recommend') handleRecommend()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab, station, hour, dow, month, isWeekend])

  useEffect(() => {
    api.getStations()
      .then(r => { setStations(r.data.stations); if (r.data.stations.length) setStation(r.data.stations[0].name) })
      .catch(() => setError('Backend not running. Start uvicorn first.'))
  }, [])

  const handlePredict = async () => {
    if (!station) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await api.predict(station, hour, dow, month + 1, isWeekend)
      setResult({ type: 'predict', ...r.data })
      // Browser notification if alert set
      if (alerts.includes(station) && r.data.crowd?.level === 'sparse') {
        if (Notification.permission === 'granted') {
          new Notification(`${station} is SPARSE now!`, { body: `Only ${r.data.prediction?.predicted_footfall?.toFixed(0)} pax at ${hour}:00` })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => {
            if (p === 'granted') new Notification(`${station} is SPARSE now!`, { body: 'Good time to visit!' })
          })
        }
      }
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

  // Export CSV
  const handleExport = useCallback(() => {
    if (!result?.prediction) return
    const rows = [
      ['Station','Hour','Day','Month','Predicted Footfall','Station Mean','Capacity %','Crowd Level'],
      [result.prediction.station, hour, DAY_NAMES[dow], MONTH_FULL[month],
       result.prediction.predicted_footfall, result.prediction.station_mean,
       result.crowd?.capacity_pct, result.crowd?.level],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `mta_${result.prediction.station.replace(/ /g,'_')}_${hour}h.csv`
    a.click()
  }, [result, hour, dow, month])

  // Share
  const handleShare = useCallback(() => {
    const text = `MTA Footfall: ${result?.prediction?.station} at ${hour}:00 on ${DAY_NAMES[dow]} — ${result?.prediction?.predicted_footfall?.toLocaleString()} passengers (${result?.crowd?.level}). Check crowd predictions at NYC MTA Footfall.`
    if (navigator.share) {
      navigator.share({ title: 'MTA Footfall Prediction', text })
    } else {
      navigator.clipboard.writeText(text)
      alert('Prediction copied to clipboard!')
    }
  }, [result, hour, dow])

  const onAction = tab === 'predict' ? handlePredict : handleRecommend

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.display, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&display=swap');
        @keyframes spin  { to { transform:rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        *, *::before, *::after { box-sizing:border-box; }
        body { margin:0; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:${T.rule}; }
        select option { background:#111; color:#F5F2ED; }
        select { -webkit-appearance:none; appearance:none; }
        input.red-range { -webkit-appearance:none; appearance:none; background:#2e2e2e; height:3px; border-radius:0; cursor:pointer; display:block; }
        input.red-range::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; background:#FF4B2B; border-radius:50%; border:2.5px solid #1a1a1a; cursor:pointer; }
        input.red-range::-moz-range-thumb { width:16px; height:16px; background:#FF4B2B; border-radius:50%; border:2.5px solid #1a1a1a; cursor:pointer; }
      `}</style>

      {/* Modals */}
      {showShortcuts  && <ShortcutsModal  T={T} onClose={() => setShowShortcuts(false)} />}
      {showOnboarding && <OnboardingModal T={T} onClose={() => { setShowOnboarding(false); localStorage.setItem('mta_seen','1') }} />}

      {/* HEADER */}
      <div style={{ height: '2px', background: T.ink }} />
      <header style={{ background: T.bg, padding: '14px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
          <span style={{ fontFamily: T.display, fontSize: '22px', fontWeight: 800, letterSpacing: '-1px', color: T.ink }}>AI-POWERED NEW YORK CITY SUBWAY TOURISM GUIDE</span>
          <span style={{ fontFamily: T.mono, fontSize: '11px', color: T.muted, letterSpacing: '.06em' }}>NYC · 378 STATIONS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => setShowOnboarding(true)} title="Help & tour"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: T.mono, fontSize: '11px' }}>
            <Info size={13} /> HELP
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontFamily: T.mono, fontSize: '11px', color: T.green, letterSpacing: '.08em', fontWeight: 500 }}>
            <span style={{ width: '7px', height: '7px', background: T.green, borderRadius: '50%', display: 'inline-block', animation: 'blink 1.4s infinite' }} />
            LIVE
          </div>
        </div>
      </header>
      <div style={{ height: '2px', background: T.ink }} />

      {/* ERROR */}
      {error && (
        <div style={{ background: '#FFF0ED', borderBottom: `1px solid ${T.red}`, padding: '10px 26px', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: T.mono, fontSize: '12px', color: T.red, flexShrink: 0 }}>
          <AlertCircle size={13} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: T.red }}><X size={13} /></button>
        </div>
      )}

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          T={T} tab={tab} setTab={setTab}
          stations={stations} stFilter={stFilter} setStFilter={setStFilter}
          station={station} setStation={setStation}
          hour={hour} setHour={setHour}
          dow={dow} setDow={setDow}
          month={month} setMonth={setMonth}
          loading={loading} onAction={onAction}
          setResult={setResult} setError={setError}
          favorites={favorites} toggleFavorite={toggleFavorite}
          alerts={alerts} toggleAlert={toggleAlert}
          recentSearches={recentSearches}
          darkMode={darkMode} setDarkMode={setDarkMode}
          setShowShortcuts={setShowShortcuts}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {tab === 'predict' && (
            <PredictPanel T={T} result={result} loading={loading} hour={hour} dow={dow} month={month}
              stations={stations} station={station}
              showHeatmap={showHeatmap} setShowHeatmap={setShowHeatmap}
              onExport={handleExport} onShare={handleShare} />
          )}
          {tab === 'recommend' && (
            <RecommendPanel T={T} result={result} loading={loading} hour={hour} dow={dow} month={month}
              stations={stations} station={station}
              showHeatmap={showHeatmap} setShowHeatmap={setShowHeatmap} />
          )}
          {tab === 'compare' && (
            <ComparePanel T={T} stations={stations} hour={hour} dow={dow} month={month} isWeekend={isWeekend} />
          )}
          {tab === 'trends' && (
            <TrendsPanel T={T} stations={stations} station={station} month={month} isWeekend={isWeekend} />
          )}
          {tab === 'chat' && (
            <ChatPanel T={T}
              messages={messages} loading={loading}
              chatInput={chatInput} setChatInput={setChatInput}
              onSend={handleChat} voice={voice}
              isMuted={isMuted} setIsMuted={setIsMuted} synthRef={synthRef} />
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ height: '2px', background: T.ink }} />
      <footer style={{ padding: '8px 26px', background: T.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: '9px', color: '#bbb', letterSpacing: '.1em' }}>
          SMART TOURISM · GLOBAL TRANSFORMER · 63,041 RECORDS · 378 STATIONS · PRESS ? FOR SHORTCUTS
        </span>
        <span style={{ fontFamily: T.mono, fontSize: '9px', color: T.red, letterSpacing: '.1em', fontWeight: 500 }}>NYC MTA</span>
      </footer>
    </div>
  )
}