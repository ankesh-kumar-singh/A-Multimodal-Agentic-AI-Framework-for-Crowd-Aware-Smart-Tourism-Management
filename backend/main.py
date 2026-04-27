# backend/main.py — FastAPI backend with Gemini LLM.

import sys, os, json
from pathlib import Path
from datetime import datetime
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
from config import GEMINI_API_KEY
import google.generativeai as genai

from agent  import TourismAgent


app   = FastAPI(title="Smart Tourism API")
agent = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    from startup import download_if_missing
    download_if_missing()
    global agent
    print("Loading agent...")
    agent = TourismAgent()
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        print("Gemini configured.")
    else:
        print("WARNING: GEMINI_API_KEY not set. Chat endpoint disabled.")


# ── Models ────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    station    : str
    hour       : int
    day_of_week: Optional[int] = 2
    month      : Optional[int] = 1
    is_weekend : Optional[int] = 0

class ChatRequest(BaseModel):
    message    : str
    station    : Optional[str] = None
    hour       : Optional[int] = None
    day_of_week: Optional[int] = 2
    month      : Optional[int] = 1
    is_weekend : Optional[int] = 0


# ── Endpoints ─────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "stations": len(agent.list_stations())}


@app.get("/stations")
def get_stations():
    stations = agent.list_stations()
    # Also return coordinates for map display
    result = []
    for s in stations:
        info = agent.station_info(s)
        result.append({
            "name": s,
            "lat" : info.get("lat", 40.7128),
            "lon" : info.get("lon", -74.0060),
            "mean_footfall": info.get("mean_footfall", 0),
        })
    return {"stations": result}


@app.post("/predict")
def predict(req: PredictRequest):
    if req.station not in agent.list_stations():
        raise HTTPException(400, f"Unknown station: {req.station}")
    if not 0 <= req.hour <= 23:
        raise HTTPException(400, "Hour must be 0–23")

    pred  = agent.predict_footfall(
        req.station, req.hour, req.day_of_week, req.month, req.is_weekend
    )
    crowd = agent.classify_crowd(pred["predicted_footfall"])
    return {"prediction": pred, "crowd": crowd}


@app.post("/recommend")
def recommend(req: PredictRequest):
    if req.station not in agent.list_stations():
        raise HTTPException(400, f"Unknown station: {req.station}")
    return agent.recommend(
        req.station, req.hour, req.day_of_week, req.month, req.is_weekend
    )


@app.get("/station_info")
def station_info(station: str):
    return agent.station_info(station)


@app.post("/chat")
def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY not configured.")

    model = genai.GenerativeModel("gemini-2.5-flash")

    # ── Get real current date/time ────────────────────────────
    now            = datetime.now()
    current_hour   = now.hour
    current_dow    = now.weekday()     # 0=Monday … 6=Sunday
    current_month  = now.month         # 1–12
    current_is_wknd= 1 if now.weekday() >= 5 else 0
    current_date_str = now.strftime("%A, %B %d, %Y at %H:%M")

    # Use frontend-provided values if given, else fall back to real now
    station    = req.station
    hour       = req.hour       if req.hour       is not None else current_hour
    day_of_week= req.day_of_week if req.day_of_week is not None else current_dow
    month      = req.month      if req.month      is not None else current_month
    is_weekend = req.is_weekend if req.is_weekend is not None else current_is_wknd

    # ── Step 1: Parse intent with real date context ────────────
    parse_prompt = f"""
You are a parser for a NYC subway crowd prediction system.
Today is: {current_date_str}

Extract the following from this user query: "{req.message}"

Use today's date/time as context. For example:
- "tonight" → hour=22, use today's day_of_week and month
- "tomorrow morning" → hour=9, day_of_week=(today+1)%7
- "this weekend" → day_of_week=5 or 6
- "at 8am" → hour=8

Return ONLY a valid JSON object with these fields:
- "station": best matching NYC subway station name or null
  Options include: {agent.list_stations()[:20]}... (378 stations total)
- "hour": integer 0-23 or null
- "day_of_week": 0=Monday..6=Sunday or null (use today={current_dow} if not specified)
- "month": 1-12 or null (use today's month={current_month} if not specified)
- "is_weekend": 1 if weekend else 0 or null
- "language": detected language code ("en", "hi", "fr", "es", "zh", etc.)

Return ONLY the JSON, no explanation, no markdown.
"""

    try:
        parse_resp = model.generate_content(parse_prompt)
        parsed_text = parse_resp.text.strip()
        # Clean markdown code blocks if present
        if "```" in parsed_text:
            parsed_text = parsed_text.split("```")[1]
            if parsed_text.startswith("json"):
                parsed_text = parsed_text[4:]
        parsed = json.loads(parsed_text)

        station     = parsed.get("station")     or station
        hour        = parsed.get("hour")
        day_of_week = parsed.get("day_of_week") or day_of_week
        is_weekend  = parsed.get("is_weekend")  or is_weekend
        detected_lang = parsed.get("language", "en")
    except Exception as e:
        print(f"Parse error: {e}")
        detected_lang = "en"

    # ── Step 2: Run agent ─────────────────────────────────────
    agent_result = None
    if station and hour is not None:
        try:
            agent_result = agent.recommend(
                station, int(hour), day_of_week or 2, month or 1, is_weekend or 0
            )
        except Exception as e:
            print(f"Agent error: {e}")

    # ── Step 3: Format with Gemini ────────────────────────────
    if agent_result and "crowd" in agent_result:
        r = agent_result
        format_prompt = f"""
The user asked (in {detected_lang}): "{req.message}"

Prediction data:
- Station: {r['station']}
- Hour: {r['hour_used']}:00
- Predicted footfall: {r['footfall']:.0f} passengers
- Crowd level: {r['crowd']['level']} {r['crowd']['emoji']}
- Best time: {r['best_time']['best_hour']}:00 ({r['best_time']['pct_reduction']:.1f}% less crowded)
- Nearest quieter station: {r['alternatives'][0]['station'] if r['alternatives'] else 'none'} ({r['alternatives'][0].get('distance_km', '?')} km)

Write a friendly, helpful 2-3 sentence tourist recommendation.
IMPORTANT: Reply in the SAME LANGUAGE as the user's message ({detected_lang}).
Be specific with station names and times. Keep it concise and friendly.
"""
    else:
        format_prompt = f"""
User asked (in {detected_lang}): "{req.message}"
I could not identify a specific NYC subway station or time from this query.
Politely ask the user to specify which station and time they want to visit.
Reply in {detected_lang}. Keep it to 1-2 sentences.
"""

    try:
        fmt_resp = model.generate_content(format_prompt)
        reply_text = fmt_resp.text
    except Exception as e:
        reply_text = f"I encountered an error: {str(e)}"

    return {
        "message"       : reply_text,
        "agent_result"  : agent_result,
        "parsed_station": station,
        "parsed_hour"   : hour,
        "language"      : detected_lang,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
