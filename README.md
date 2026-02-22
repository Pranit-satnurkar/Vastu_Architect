# Vastu Architect 🏛️📐

**Vastu Architect** is an AI-powered spatial design tool that generates architectural house plans based on **Vastu Shastra** principles. It blends traditional Indian spatial logic with modern architectural standards, producing professional-grade CAD files (`.dxf`) ready for AutoCAD.

## 🚀 Features

- **AI-Driven Vastu Compliance**: Uses a RAG (Retrieval-Augmented Generation) engine to extract spatial constraints from Vastu PDFs.
- **Dynamic Spatial Optimization**: Automatically calculates room positions and dimensions to maximize plot utility while adhering to Vastu quadrants.
- **AIA Standard CAD Export**: Generates professional DXF files with:
  - AIA National CAD Standard layer naming (A-WALL, A-DOOR, etc.).
  - Precise lineweights, linetypes, and ANSI31 hatching.
  - Architectural dimensioning with automatic overlap prevention.
- **Interactive UI**: A Streamlit-based dashboard for adjusting plot sizes and Vastu strictness in real-time.

## 🛠️ Tech Stack

- **Backend**: Python, LangChain, Groq API (LLM).
- **Geometry**: Shapely, Matplotlib.
- **CAD Engine**: ezdxf.
- **Frontend**: Streamlit.

## 📦 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Pranit-satnurkar/Vastu_Architect.git
   cd Vastu_Architect
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   Create a `.env` file and add your Groq API key:
   ```env
   GROQ_API_KEY=your_api_key_here
   ```

## 🖥️ Usage

Run the Streamlit application:
```bash
streamlit run vastu_app.py
```

## 📐 Layer Standards (AIA)

The exported DXF files follow the AIA National CAD Standard:
- `A-WALL`: 0.50mm White (Main Structure)
- `A-WALL-PATT`: 0.15mm Grey (ANSI31 Hatch)
- `A-DOOR`: 0.25mm Cyan (Frames/Leaves)
- `A-DOOR-SWING`: 0.13mm Green DASHED (Arcs)
- `A-ANNO-TEXT`: 0.18mm Yellow (Room Labels)
- `A-ANNO-DIMS`: 0.15mm Magenta (Dimensions)

---
Developed with ❤️ by [Pranit Satnurkar](https://github.com/Pranit-satnurkar)
