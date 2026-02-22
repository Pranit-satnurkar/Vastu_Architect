import streamlit as st
import io
import time
import os
from vastu_rag_engine import get_vastu_retriever, query_vastu_rules, ConstraintExtractor
from spatial_optimizer import Room, VastuConstraint, generate_layout
from vastu_engine import generate_ai_detailed_plan
from vastu_renderer import render_preview_plan

st.set_page_config(page_title="Vastu Architect AI", layout="wide")

# --- 1. INITIALIZATION ---

@st.cache_resource
def load_rag_engine():
    """Loads the Vastu RAG engine (cached)."""
    return get_vastu_retriever()

try:
    retriever = load_rag_engine()
    st.sidebar.success("✅ Vastu Knowledge Loaded")
except Exception as e:
    st.sidebar.error(f"❌ RAG Error: {e}")
    retriever = None

# --- 2. SIDEBAR INPUTS ---

st.sidebar.title("🏗️ Project Config")

# API Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    GROQ_API_KEY = st.sidebar.text_input("Groq API Key", type="password", help="Get your key from https://console.groq.com/")
    if not GROQ_API_KEY:
        st.sidebar.warning("⚠️ GROQ_API_KEY missing. AI logic will use fallback patterns.")

extractor = ConstraintExtractor(api_key=GROQ_API_KEY)

client = st.sidebar.text_input("Client Name", "Mr. Sharma")

st.sidebar.subheader("Plot Dimensions (Meters)")
plot_w = st.sidebar.number_input("Width (East-West)", 10.0, 50.0, 12.0)
plot_d = st.sidebar.number_input("Depth (North-South)", 10.0, 50.0, 15.0)

st.sidebar.subheader("Room Config")
rooms_req = []

# Dynamic Room Addition
if "room_list" not in st.session_state:
    st.session_state.room_list = [
        {"name": "Living", "w": 4.5, "d": 5.0},
        {"name": "Kitchen", "w": 3.0, "d": 3.5},
        {"name": "Master Bed", "w": 4.0, "d": 4.5},
        {"name": "Toilet", "w": 1.8, "d": 2.5}
    ]

for i, r in enumerate(st.session_state.room_list):
    cols = st.sidebar.columns([2, 1, 1])
    r['name'] = cols[0].text_input(f"Room {i+1}", r['name'], key=f"n{i}")
    r['w'] = cols[1].number_input("W", 1.0, 20.0, r['w'], key=f"w{i}")
    r['d'] = cols[2].number_input("D", 1.0, 20.0, r['d'], key=f"d{i}")
    
    rooms_req.append(Room(r['name'], (r['w']*0.8, r['d']*0.8), (r['w']*1.2, r['d']*1.2)))

if st.sidebar.button("➕ Add Room"):
    st.session_state.room_list.append({"name": "New Room", "w": 3.0, "d": 3.0})
    st.rerun()

# --- 3. MAIN LOGIC ---

st.title("🏡 Generative Vastu Architect")
st.markdown("---")

if st.button("✨ Generate Optimized Layout", type="primary"):
    with st.spinner("Consulting Vastu Shastras..."):
        # A. RETRIEVE CONSTRAINTS
        constraints = []
        vastu_tips = []
        
        progress_bar = st.progress(0)
        
        for idx, room in enumerate(rooms_req):
            if retriever:
                # 1. RAG Retrieval
                context = query_vastu_rules(room.name, retriever)
                
                # 2. LLM Extraction (Mocked)
                rule_json = extractor.extract_constraints(room.name, context)
                
                # 3. Create Constraint Object
                vc = VastuConstraint(room.name, rule_json['allowed_quadrants'])
                constraints.append(vc)
                
                # Store tip for UI
                if rule_json['allowed_quadrants']:
                    vastu_tips.append(f"**{room.name}**: Best in {', '.join(rule_json['allowed_quadrants'])}")
            
            progress_bar.progress((idx + 1) / len(rooms_req))

        st.success("Analysis Complete!")
        
        # B. OPTIMIZE LAYOUT
        with st.spinner("Calculating Spatial Geometry..."):
            optimized_rooms = generate_layout((plot_w, plot_d), rooms_req, constraints)
            
        # C. RENDER UI
        col1, col2 = st.columns([2, 1])
        
        with col1:
            st.subheader("blueprint")
            fig = render_preview_plan(optimized_rooms, plot_w, plot_d, client)
            st.pyplot(fig)
            
        with col2:
            st.subheader("Vastu Insights")
            for tip in vastu_tips:
                st.info(tip)
                
            st.subheader("Downloads")
            # D. GENERATE DXF
            dxf_content = generate_ai_detailed_plan(optimized_rooms, plot_w, plot_d, client)
            
            st.download_button(
                label="📥 Download .DXF (CAD)",
                data=dxf_content,
                file_name=f"{client}_Vastu_Plan.dxf",
                mime="application/dxf"
            )
            
            st.warning("Note: DXF optimized for AutoCAD 2010+")
