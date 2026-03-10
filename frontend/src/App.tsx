import React, { useState } from 'react';
import FloorPlanCanvas from '../components/FloorPlanCanvas';

const App = () => {
    const [bhk, setBhk] = useState('3BHK');
    const [dim, setDim] = useState({ w: 30, d: 50 });
    const [plan, setPlan] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const generatePlan = async () => {
        setLoading(true);
        try {
            const resp = await fetch('/api/generate-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bhk_type: bhk,
                    plot_w_ft: dim.w,
                    plot_d_ft: dim.d,
                    style: 'modern'
                })
            });
            const data = await resp.json();
            setPlan(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
            <div style={{ 
                backgroundColor: 'white', 
                padding: '30px', 
                borderRadius: '16px', 
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', 
                width: '100%', 
                maxWidth: '900px',
                marginBottom: '20px'
            }}>
                <h1 style={{ margin: '0 0 20px 0', fontSize: '28px', color: '#1e293b', textAlign: 'center' }}>🏛️ Vastu Architect AI</h1>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#64748b' }}>BHK Type</label>
                        <select 
                            value={bhk} 
                            onChange={(e) => setBhk(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '16px' }}
                        >
                            <option value="1BHK">1 BHK</option>
                            <option value="2BHK">2 BHK</option>
                            <option value="3BHK">3 BHK</option>
                            <option value="4BHK">4 BHK</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#64748b' }}>Width (ft)</label>
                        <input 
                            type="number" 
                            value={dim.w} 
                            onChange={(e) => setDim({ ...dim, w: parseFloat(e.target.value) })}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '16px' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#64748b' }}>Depth (ft)</label>
                        <input 
                            type="number" 
                            value={dim.d} 
                            onChange={(e) => setDim({ ...dim, d: parseFloat(e.target.value) })}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '16px' }}
                        />
                    </div>
                </div>

                <button 
                    onClick={generatePlan}
                    disabled={loading}
                    style={{ 
                        width: '100%', 
                        padding: '15px', 
                        backgroundColor: loading ? '#94a3b8' : '#2563eb', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '12px', 
                        fontSize: '18px', 
                        fontWeight: '600', 
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 6px -1px rgba(37,99,235,0.2)'
                    }}
                >
                    {loading ? 'Consulting Vastu Sastras...' : '✨ Generate Vastu Plan'}
                </button>
            </div>

            {plan && (
                <div style={{ display: 'flex', gap: '20px', width: '100%', maxWidth: '1200px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <FloorPlanCanvas data={plan} />
                    </div>
                    
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', flex: '1', minWidth: '300px' }}>
                        <h2 style={{ margin: '0 0 15px 0', color: '#1e293b' }}>Vastu Insights</h2>
                        <div style={{ padding: '15px', backgroundColor: '#fdf2f8', borderRadius: '12px', border: '1px solid #fbcfe8', color: '#be185d', marginBottom: '20px' }}>
                            <strong>Analysis Note:</strong> Generated using architectural templates for a {plan.plot_w_ft}x{plan.plot_d_ft} plot.
                        </div>
                        
                        <div style={{ color: '#475569', lineHeight: '1.6' }}>
                            <p><strong>BHK:</strong> {plan.bhk_type}</p>
                            <p><strong>Template:</strong> {plan.template_used}</p>
                            <p><strong>Plot Size:</strong> {plan.plot_w_m.toFixed(2)}m x {plan.plot_d_m.toFixed(2)}m</p>
                            <p><strong>Total Rooms:</strong> {plan.room_count}</p>
                        </div>

                        <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '20px 0' }} />
                        
                        <div style={{ textAlign: 'center' }}>
                            <button style={{ 
                                padding: '12px 25px', 
                                backgroundColor: '#0f172a', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '8px', 
                                fontWeight: '500', 
                                cursor: 'pointer' 
                            }}>
                                📥 Download DXF (CAD)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
