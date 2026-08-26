# Trubaoke backend — FastAPI + librosa + yt-dlp
#
# Build:  docker build --platform linux/amd64 -t trubaoke-backend .
# Run:    docker run -p 8000:8000 -e YOUTUBE_API_KEY=... trubaoke-backend

FROM python:3.12-slim

# ── System dependencies ───────────────────────────────────────────────────────
# ffmpeg is required by yt-dlp to extract/convert audio.
# libsndfile1 is required by soundfile (used by librosa).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# ── Python dependencies ───────────────────────────────────────────────────────
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ──────────────────────────────────────────────────────────
COPY . .

# ── Runtime ───────────────────────────────────────────────────────────────────
# App Runner exposes port 8000; health check hits /health
EXPOSE 8000

# Single worker is fine for a personal single-user app.
# Chord detection is already run in a thread-pool executor (see main.py).
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--log-level", "info"]
