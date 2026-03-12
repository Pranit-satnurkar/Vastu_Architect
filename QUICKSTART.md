# 🚀 Quick Start Guide

## Prerequisites
- Python 3.9+ installed
- Node.js 16+ installed
- Virtual environment already set up (`.venv` folder exists)

## Starting the Application

### Option 1: Run Start Script (Easiest - Windows)
Simply double-click or run:
```bash
START_SERVERS.bat
```
This will automatically start both backend and frontend in separate terminal windows.

---

### Option 2: Manual Start (Advanced)

#### Terminal 1 - Backend (FastAPI):
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

#### Terminal 2 - Frontend (Next.js):
```bash
cd frontend
npm run dev
```

---

### Option 3: PowerShell Commands

**All in one terminal (sequential):**
```powershell
# Activate venv
.venv\Scripts\activate

# Start backend (in background)
Start-Process -NoNewWindow -FilePath python -ArgumentList "-m uvicorn main:app --reload --port 8000" -WorkingDirectory "backend"

# Wait for backend
Start-Sleep -Seconds 3

# Start frontend
cd frontend
npm run dev
```

---

## Verify Everything Works

1. **Backend Check**: http://localhost:8000/health
   - Should return: `{"status":"ok"}`

2. **Frontend**: http://localhost:3000
   - Should open the Vastu Architect interface

3. **Generate a Plan**: 
   - Select BHK type (e.g., 3BHK)
   - Click "Generate Plan"
   - Wait for the floor plan to render

---

## Troubleshooting

### "Failed to generate plan. Is the backend running?"
- Ensure backend is running on port 8000
- Check browser console (F12) for network errors
- Verify firewall isn't blocking localhost:8000

### "Module not found" error in backend
```bash
cd backend
pip install -r requirements.txt
```

### "npm: command not found"
- Install Node.js from nodejs.org
- Restart terminal after installation

### Port 8000 already in use
```powershell
# Kill the process using port 8000
Get-Process | Where-Object {$_.Name -eq "python"} | Stop-Process
```

### Need to reinstall dependencies
```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend  
cd frontend
npm install
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Frontend (Next.js)              │
│         http://localhost:3000           │
│    - Interactive UI                     │
│    - Canvas rendering (Konva.js)        │
│    - PDF/PNG/DXF export                 │
└──────────────┬──────────────────────────┘
               │ HTTP API (port 8000)
               ↓
┌─────────────────────────────────────────┐
│         Backend (FastAPI)               │
│         http://localhost:8000           │
│    - BSP room layout engine             │
│    - Vastu score calculation            │
│    - DXF generation                     │
│    - Plan generation                    │
└─────────────────────────────────────────┘
```

---

## Key Endpoints

- **POST /generate-plan** - Generate architectural plan
- **GET /health** - Backend health check
- **POST /export-dxf** - Export plan as DXF file
- **POST /api/download-dxf** - Legacy DXF download (cached)

---

## Development Commands

### Frontend
```bash
cd frontend
npm run dev      # Start dev server with hot reload
npm run build    # Build for production
npm run lint     # Check code quality
```

### Backend
```bash
cd backend
python -m uvicorn main:app --reload --port 8000  # Dev server
python -m uvicorn main:app --port 8000          # Production
```

---

## Environment Variables

Create `.env` file in backend directory:
```
GEMINI_API_KEY=your_api_key_here
```

---

## Additional Notes

- Backend uses Google Cloud Generative AI for natural language parsing of prompts
- Plans are generated using BSP (Binary Space Partition) with Vastu-aware room placement
- All room dimensions are calculated in meters internally, displayed in both metric and imperial units
- DXF exports use ezdxf library with AIA standard layers

For more details, see [README.md](./README.md)
