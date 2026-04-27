import axios from 'axios'

// In production (Vercel): VITE_API_URL = https://your-app.onrender.com
// In development: proxy via vite → localhost:8000
const BASE = import.meta.env.VITE_API_URL || '/api'

export const getStations    = ()                                => axios.get(`${BASE}/stations`)
export const getCurrentTime = ()                                => axios.get(`${BASE}/current_time`)
export const predict        = (station,h,dow,month,wknd)        => axios.post(`${BASE}/predict`,   { station, hour:h, day_of_week:dow, month, is_weekend:wknd })
export const recommend      = (station,h,dow,month,wknd)        => axios.post(`${BASE}/recommend`, { station, hour:h, day_of_week:dow, month, is_weekend:wknd })
export const chat           = (message,station,h,dow,month,wknd)=> axios.post(`${BASE}/chat`,      { message, station, hour:h, day_of_week:dow, month, is_weekend:wknd })