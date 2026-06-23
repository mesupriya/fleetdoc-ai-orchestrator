import React, { useState, useEffect, useRef } from 'react';
import { 
  Truck, 
  FileText, 
  Upload, 
  MessageSquare, 
  AlertCircle, 
  TrendingUp, 
  DollarSign, 
  Fuel, 
  Wrench, 
  ShieldAlert, 
  CheckCircle, 
  ChevronRight, 
  Terminal, 
  AlertTriangle,
  Key,
  Eye,
  RefreshCw,
  Info,
  Settings
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    const saved = localStorage.getItem('api_key');
    if (!saved) {
      const envKey = import.meta.env.VITE_OPENAI_API_KEY || '';
      if (envKey) {
        localStorage.setItem('api_key', envKey);
        localStorage.setItem('api_provider', 'openai');
      }
      return envKey;
    }
    return saved;
  });
  const [provider, setProvider] = useState(() => localStorage.getItem('api_provider') || 'openai');
  const [stats, setStats] = useState({
    total_trucks: 0,
    active_drivers: 0,
    total_revenue: 0.0,
    total_expenses: 0.0,
    net_profit: 0.0,
    alerts: [],
    trucks: []
  });
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedDocText, setSelectedDocText] = useState('');
  
  // Chat console states
  const [chatHistory, setChatHistory] = useState([
    {
      sender: 'assistant',
      text: 'Hello! I am the FleetDoc AI Orchestrator. You can ask me analytical questions about profitability, inquire about expenses (like parts and fuel), or search unstructured document contents in plain English. How can I help you manage your fleet records today?'
    }
  ]);
  const [query, setQuery] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [agentTrace, setAgentTrace] = useState([
    { agent: 'system', message: 'Orchestrator workspace initialized.' },
    { agent: 'system', message: 'SQL Database Agent connected.' },
    { agent: 'system', message: 'Doc Retriever Agent connected.' }
  ]);
  
  // Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadThoughts, setUploadThoughts] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  
  // UI filter for documents
  const [docSearch, setDocSearch] = useState('');

  const chatEndRef = useRef(null);
  const traceEndRef = useRef(null);

  // Auto-scroll chats and traces
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentTrace]);

  // Load stats and documents
  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/fleet-stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load fleet stats', err);
    }
  };

  const loadDocs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
        if (data.length > 0 && !selectedDoc) {
          handleSelectDoc(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load documents', err);
    }
  };

  useEffect(() => {
    loadStats();
    loadDocs();
  }, []);

  const handleApiKeyChange = (e) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('api_key', key);
  };

  const handleProviderChange = (e) => {
    const p = e.target.value;
    setProvider(p);
    localStorage.setItem('api_provider', p);
  };

  const handleSelectDoc = async (doc) => {
    setSelectedDoc(doc);
    setSelectedDocText('Loading text...');
    try {
      const res = await fetch(`${API_BASE}/api/documents/${doc.document_id}/text`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDocText(data.raw_text);
      } else {
        setSelectedDocText('Failed to load document text.');
      }
    } catch (err) {
      setSelectedDocText('Error connecting to backend.');
    }
  };

  // Chat Submission
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userQuery = query;
    setQuery('');
    setChatHistory(prev => [...prev, { sender: 'user', text: userQuery }]);
    setIsChatLoading(true);
    setAgentTrace([{ agent: 'orchestrator', message: `Query received: "${userQuery}"` }]);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userQuery, api_key: apiKey, provider: provider })
      });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(prev => [...prev, {
          sender: 'assistant',
          text: data.answer,
          citations: data.citations,
          sql_query: data.sql_query,
          sql_results: data.sql_results,
          sql_columns: data.sql_columns
        }]);
        
        // Map backend thought logs to agent trace format
        const logs = data.thought_logs.map(log => {
          let agent = 'system';
          if (log.startsWith('Orchestrator')) agent = 'orchestrator';
          else if (log.startsWith('SQL Agent')) agent = 'sql';
          else if (log.startsWith('RAG Agent')) agent = 'rag';
          else if (log.startsWith('Auditor')) agent = 'auditor';
          return { agent, message: log };
        });
        setAgentTrace(logs);
        
        // Refresh stats to ensure any live updates (or side effects) are captured
        loadStats();
      } else {
        setChatHistory(prev => [...prev, { sender: 'assistant', text: 'Error executing query on backend.' }]);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { sender: 'assistant', text: 'Connection to AI server lost.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Upload handler
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file) => {
    setIsUploading(true);
    setUploadThoughts([
      { agent: 'auditor', message: `Initializing file ingestion for '${file.name}'...` }
    ]);
    
    const formData = new FormData();
    formData.append('file', file);
    if (apiKey) formData.append('api_key', apiKey);
    formData.append('provider', provider);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        
        const logs = data.thought_logs.map(log => {
          let agent = 'auditor';
          return { agent, message: log };
        });
        setUploadThoughts(logs);
        
        // reload documents and stats
        loadDocs();
        loadStats();
        
        // Select newly uploaded doc
        const newDoc = {
          document_id: data.document_id,
          file_name: file.name,
          ...data.metadata,
          is_duplicate: data.is_duplicate
        };
        setSelectedDoc(newDoc);
        handleSelectDoc(newDoc);
      } else {
        setUploadThoughts(prev => [...prev, { agent: 'system', message: 'Failed to process document.' }]);
      }
    } catch (err) {
      setUploadThoughts(prev => [...prev, { agent: 'system', message: 'Connection error during upload.' }]);
    } finally {
      setIsUploading(false);
    }
  };

  // Synthetic Document generators to make testing a breeze
  const generateSyntheticDocument = async (type) => {
    setIsUploading(true);
    let name = '';
    let text = '';
    
    if (type === 'receipt_normal') {
      name = `invoice_tire_66_${Math.floor(Math.random()*1000)}.txt`;
      text = `
Texas Tire Shop & Roadside Service
220 Airport Freeway, Irving TX
Invoice #: TTS-${Math.floor(Math.random()*10000)}
Date: 2026-06-18
Customer: Supriya Trucking
Truck ID: 66

Services Performed:
- Replacement of steer tire (front left)
- Balanced wheel alignment
Parts (Tire): $350.00
Labor: $100.00
-----------------------------
Total Amount Due: $450.00
Paid in full. Card ending in 4321.
      `;
    } else if (type === 'receipt_duplicate') {
      // Create duplicate of existing one
      name = `maint_84_parts_duplicate_${Math.floor(Math.random()*100)}.txt`;
      text = `
Dalas Speed Repir & Servce Station
5600 Highway 183, Dallas TX
INVOICE #DSR-4491
Date: 2026-05-12
Customer: Supriya Trucking
Unit/Trck: 84
Driver: Bob Miller
Trailer ID: TL-10

Description of Work:
- Replac brake pads on rear axle (Parts: $600.00, Labor: $100.00)
- Oil change and fuel filter renewal (Parts: $250.00, Labor: $50.00)

Total Parts: $850.00
Total Labor: $150.00
-----------------------------
TOTAL COST: $1000.00
Payment Method: Net 30
      `;
    } else if (type === 'email_fuel') {
      name = `email_fuel_john_102_${Math.floor(Math.random()*100)}.txt`;
      text = `
From: John Smith <john.smith@supriyatrucking.com>
Sent: Thursday, June 18, 2026 9:15 AM
To: dispatch@supriyatrucking.com
Subject: fuel slip for truck 102

Hey dispatch,
I fueled up truck 102 at Loves Travel Stop earlier this morning.
Bought 110 gallons of Diesel.
Amount was $396.00 total.
Price/gal was $3.60.
Driver: John Smith
Please file this!
Thanks,
John
      `;
    } else if (type === 'missing_truck_link') {
      name = `parts_invoice_no_truck_id_${Math.floor(Math.random()*100)}.txt`;
      text = `
Dallas Parts Supply Shop
1024 Elm St, Dallas TX
TICKET #: DPS-99150
Date: 2026-06-18

Customer Account: Supriya Trucking
Purchased By: Bob Miller
Contact: Bob.Miller@supriyatrucking.com

Items Purchased:
1x Remanufactured Alternator (Part #ALT-VNL-84): $310.00

Sales Tax: $0.00
-----------------------------
TOTAL PAID: $310.00
Payment: Card
      `;
    }
    
    // Convert text to File and upload
    const blob = new Blob([text], { type: 'text/plain' });
    const file = new File([blob], name, { type: 'text/plain' });
    await uploadFile(file);
  };

  // Quick Query handling
  const runQuickQuery = (text) => {
    setActiveTab('chat');
    setQuery(text);
  };

  // Filtered documents
  const filteredDocs = documents.filter(doc => 
    doc.file_name.toLowerCase().includes(docSearch.toLowerCase()) ||
    doc.document_type.toLowerCase().includes(docSearch.toLowerCase()) ||
    (doc.truck_id && doc.truck_id.toLowerCase().includes(docSearch.toLowerCase())) ||
    (doc.vendor && doc.vendor.toLowerCase().includes(docSearch.toLowerCase()))
  );

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="logo-container">
          <Truck className="logo-icon" size={26} />
          <h1 className="logo-text">FleetDoc AI</h1>
          <span className="logo-badge">Agentic Orchestration</span>
        </div>
        
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {showSettings && (
            <div className="api-settings animate-fade-in">
              <select 
                value={provider} 
                onChange={handleProviderChange} 
                className="api-input" 
                style={{ width: '100px', padding: '0.4rem 0.5rem', marginRight: '0.5rem', cursor: 'pointer' }}
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="claude">Claude</option>
              </select>
              <span className="logo-badge" style={{ background: apiKey ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: apiKey ? 'var(--color-success)' : 'var(--color-warning)', borderColor: apiKey ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)' }}>
                {apiKey ? `${provider.toUpperCase()} Active` : 'Offline Mock'}
              </span>
              <div className="api-input-container">
                <Key className="api-input-icon" size={14} />
                <input 
                  type="password" 
                  placeholder={`Paste ${provider.toUpperCase()} API Key...`} 
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  className="api-input"
                  style={{ width: '220px' }}
                />
              </div>
            </div>
          )}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`settings-toggle-btn ${showSettings ? 'active' : ''}`}
            title="Toggle API Settings"
          >
            <Settings size={18} style={{ transform: showSettings ? 'rotate(45deg)' : 'none', transition: 'transform 0.3s ease' }} />
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="app-content">
        
        {/* Navigation Sidebar */}
        <aside className="app-sidebar">
          <div className="nav-card">
            <h2 className="nav-title">Navigation</h2>
            <ul className="nav-list">
              <li 
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <TrendingUp size={18} />
                Command Center
              </li>
              <li 
                className={`nav-item ${activeTab === 'inbox' ? 'active' : ''}`}
                onClick={() => setActiveTab('inbox')}
              >
                <FileText size={18} />
                Document Hub
              </li>
              <li 
                className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <MessageSquare size={18} />
                Q&A Workspace
              </li>
            </ul>
          </div>

          {/* Expiring Registration Warning Box */}
          {stats.alerts && stats.alerts.length > 0 && (
            <div className="alert-card">
              <ShieldAlert className="alert-icon" size={20} />
              <div className="alert-body">
                <h4>Registration Alerts</h4>
                {stats.alerts.map((al, idx) => (
                  <p key={idx}>
                    Truck <strong>{al.truck_id}</strong> expires on {al.expiry_date} (Ref: {al.file_name})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Help Center Info Card */}
          <div className="nav-card" style={{ background: 'rgba(255, 255, 255, 0.01)', borderStyle: 'dashed' }}>
            <h2 className="nav-title" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Info size={12} /> System Status
            </h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p>
                <strong>Engine</strong>: SQLite + RAG hybrid logic.
              </p>
              <p>
                <strong>Grounding Check</strong>: Answers are limited strictly to database entries and retrieved file text to prevent hallucination.
              </p>
              <p style={{ color: 'var(--text-muted)' }}>
                *Use the synthetic generators on the Document Hub tab to test OCR extraction and entity linking.
              </p>
            </div>
          </div>
        </aside>

        {/* Primary Workspace View */}
        <section className="main-panel">
          
          {/* TAB 1: DASHBOARD COMMAND CENTER */}
          {activeTab === 'dashboard' && (
            <>
              {/* Top KPIs Summary Grid */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-info">
                    <h3>Total Fleet Revenue</h3>
                    <div className="kpi-value">${stats.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <span className="kpi-trend positive">Freight Invoices</span>
                  </div>
                  <div className="kpi-icon-container green">
                    <DollarSign size={22} />
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-info">
                    <h3>Operating Expenses</h3>
                    <div className="kpi-value">${stats.total_expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <span className="kpi-trend positive">Maintenance & Fuel</span>
                  </div>
                  <div className="kpi-icon-container amber">
                    <Wrench size={22} />
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-info">
                    <h3>Net Carrier Profit</h3>
                    <div className="kpi-value">${stats.net_profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <span className={`kpi-trend ${stats.net_profit >= 0 ? 'positive' : 'negative'}`} style={{ color: stats.net_profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)', background: stats.net_profit >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
                      {stats.net_profit >= 0 ? 'Profitable' : 'Loss'}
                    </span>
                  </div>
                  <div className="kpi-icon-container blue">
                    <TrendingUp size={22} />
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-info">
                    <h3>Active Operators</h3>
                    <div className="kpi-value">{stats.active_drivers}</div>
                    <span className="kpi-trend positive">Assigned Drivers</span>
                  </div>
                  <div className="kpi-icon-container purple">
                    <Truck size={22} />
                  </div>
                </div>
              </div>

              {/* Graphical Analysis & Table Grid */}
              <div className="dashboard-grid">
                
                {/* Visual Chart: Profitability per Truck */}
                <div className="section-card">
                  <div className="section-header">
                    <h2 className="section-title">
                      <TrendingUp size={18} className="logo-icon" /> Profitability by Truck (Net Profit)
                    </h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Revenue vs Cost</span>
                  </div>
                  
                  {/* CSS Bar Chart */}
                  <div className="chart-container">
                    <div className="chart-grid-line" style={{ bottom: '25%' }} />
                    <div className="chart-grid-line" style={{ bottom: '50%' }} />
                    <div className="chart-grid-line" style={{ bottom: '75%' }} />
                    {stats.trucks.map((truck) => {
                      const net = truck.revenue - truck.expenses;
                      // Max bounds is ~8000 for height ratio
                      const maxBound = 8000;
                      let heightPct = Math.min(Math.abs(net) / maxBound * 100, 100);
                      if (heightPct < 5) heightPct = 5; // minimum visible bar
                      
                      const isProfit = net >= 0;
                      
                      return (
                        <div key={truck.truck_id} className="bar-wrapper">
                          <div className="bar-container">
                            <span className="bar-value" style={{ color: isProfit ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {isProfit ? '+' : ''}{net.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </span>
                            <div 
                              className="bar" 
                              style={{ 
                                height: `${heightPct}%`, 
                                background: isProfit 
                                  ? 'linear-gradient(to top, #059669, #10B981)' 
                                  : 'linear-gradient(to top, #DC2626, #EF4444)'
                              }}
                            />
                          </div>
                          <span className="bar-label">Truck {truck.truck_id}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-success)' }} /> Positive Profit
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-danger)' }} /> Operating Loss
                    </span>
                  </div>
                </div>

                {/* Quick Query Shortcuts Drawer */}
                <div className="section-card">
                  <div className="section-header">
                    <h2 className="section-title">
                      <MessageSquare size={18} className="logo-icon" /> Run Sample Queries
                    </h2>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Test the multi-agent routing. Click any chip below to route the natural language query to the agents:
                  </p>
                  <div className="quick-queries" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                    <div 
                      className="query-chip" 
                      onClick={() => runQuickQuery("Which trucks are profitable?")}
                      style={{ borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem' }}
                    >
                      💰 Which trucks are profitable? (SQL)
                    </div>
                    <div 
                      className="query-chip" 
                      onClick={() => runQuickQuery("How much did I spend on parts last month?")}
                      style={{ borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem' }}
                    >
                      🔧 How much did I spend on parts last month? (SQL)
                    </div>
                    <div 
                      className="query-chip" 
                      onClick={() => runQuickQuery("Where is the tax form for truck 84?")}
                      style={{ borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem' }}
                    >
                      📄 Where is the tax form for truck 84? (RAG)
                    </div>
                    <div 
                      className="query-chip" 
                      onClick={() => runQuickQuery("What documents do I need to renew these plates?")}
                      style={{ borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem' }}
                    >
                      🛡️ What documents do I need to renew these plates? (RAG)
                    </div>
                    <div 
                      className="query-chip" 
                      onClick={() => runQuickQuery("Which truck had the highest maintenance cost last month, and show the receipts?")}
                      style={{ borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', borderColor: 'var(--color-primary)' }}
                    >
                      ⚡ Highest maintenance cost last month, and show the receipts? (Hybrid SQL+RAG)
                    </div>
                  </div>
                </div>
              </div>

              {/* Registry Registry Table */}
              <div className="section-card">
                <h2 className="section-title">
                  <Truck size={18} className="logo-icon" /> Active Fleet Registry
                </h2>
                <div className="custom-table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Truck Unit</th>
                        <th>Make / Model</th>
                        <th>License Plate</th>
                        <th>Status</th>
                        <th>Gross Revenue</th>
                        <th>Expenses</th>
                        <th>Net Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.trucks.map((truck) => (
                        <tr key={truck.truck_id}>
                          <td><strong>Truck {truck.truck_id}</strong></td>
                          <td>{truck.name}</td>
                          <td><code>{truck.license_plate}</code></td>
                          <td>
                            <span className={`status-badge ${truck.status === 'Active' ? 'active' : 'maintenance'}`}>
                              {truck.status}
                            </span>
                          </td>
                          <td>${truck.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td>${truck.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td style={{ color: (truck.revenue - truck.expenses) >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: '600' }}>
                            ${(truck.revenue - truck.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: DOCUMENT HUB */}
          {activeTab === 'inbox' && (
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title">
                  <FileText size={18} className="logo-icon" /> Carrier Document Hub
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ingested: {documents.length} files</span>
              </div>
              
              <div className="document-grid">
                
                {/* Left Side: Upload & List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {/* File Uploader */}
                  <div 
                    className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                  >
                    <input 
                      type="file" 
                      id="file-upload" 
                      style={{ display: 'none' }} 
                      onChange={handleFileInput}
                      accept=".txt,.csv,.json,.pdf"
                    />
                    <label htmlFor="file-upload" style={{ cursor: 'pointer' }}>
                      <Upload className="upload-icon" size={32} />
                      <div className="upload-text">Drag & Drop document or click to browse</div>
                      <div className="upload-subtext">Supports text-based files, invoices, receipts, renewals</div>
                    </label>
                  </div>

                  {/* Synthetic file triggers */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Create and Upload Messy Document (Simulator)
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button 
                        className="query-chip" 
                        onClick={() => generateSyntheticDocument('receipt_normal')}
                        style={{ borderStyle: 'solid', background: 'rgba(255,255,255,0.03)' }}
                        disabled={isUploading}
                      >
                        + Repair Invoice (Tire)
                      </button>
                      <button 
                        className="query-chip" 
                        onClick={() => generateSyntheticDocument('receipt_duplicate')}
                        style={{ borderStyle: 'solid', background: 'rgba(245, 158, 11, 0.05)', color: 'var(--color-warning)', borderColor: 'rgba(245, 158, 11, 0.2)' }}
                        disabled={isUploading}
                      >
                        + Duplicate Brake Receipt
                      </button>
                      <button 
                        className="query-chip" 
                        onClick={() => generateSyntheticDocument('email_fuel')}
                        style={{ borderStyle: 'solid', background: 'rgba(255,255,255,0.03)' }}
                        disabled={isUploading}
                      >
                        + Email Fuel Slip
                      </button>
                      <button 
                        className="query-chip" 
                        onClick={() => generateSyntheticDocument('missing_truck_link')}
                        style={{ borderStyle: 'solid', background: 'rgba(139, 92, 246, 0.05)', color: 'var(--color-secondary)', borderColor: 'rgba(139, 92, 246, 0.2)' }}
                        disabled={isUploading}
                      >
                        + No-Truck Bill (Infer Link)
                      </button>
                    </div>
                  </div>

                  {/* Documents Search */}
                  <input 
                    type="text" 
                    placeholder="Search documents by name, type, vendor, truck..." 
                    className="chat-input"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  />

                  {/* Document List */}
                  <div className="doc-list">
                    {filteredDocs.map((doc) => (
                      <div 
                        key={doc.document_id} 
                        className={`doc-item-card ${selectedDoc?.document_id === doc.document_id ? 'selected' : ''}`}
                        onClick={() => handleSelectDoc(doc)}
                      >
                        <div>
                          <div className="doc-name">{doc.file_name}</div>
                          <div className="doc-meta">
                            <span>{doc.document_type}</span>
                            {doc.truck_id && <span>Truck {doc.truck_id}</span>}
                            {doc.date && <span>{doc.date}</span>}
                          </div>
                        </div>
                        {doc.is_duplicate === 1 && (
                          <span className="badge-dup">Duplicate</span>
                        )}
                      </div>
                    ))}
                  </div>

                </div>

                {/* Right Side: Document Viewer & Parsed Entities */}
                <div className="viewer-container">
                  {selectedDoc ? (
                    <>
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Eye size={16} /> Audited Metadata
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          File Name: {selectedDoc.file_name} | Uploaded: {selectedDoc.upload_date}
                        </p>
                      </div>

                      {/* Metadata Grid */}
                      <div className="metadata-grid">
                        <div className="meta-field">
                          <div className="meta-field-label">Document Type</div>
                          <div className="meta-field-value">{selectedDoc.document_type}</div>
                        </div>
                        <div className="meta-field">
                          <div className="meta-field-label">Associated Truck</div>
                          <div className="meta-field-value highlight-green">
                            {selectedDoc.truck_id ? `Truck ${selectedDoc.truck_id}` : 'Unlinked / General'}
                          </div>
                        </div>
                        <div className="meta-field">
                          <div className="meta-field-label">Driver Assigned</div>
                          <div className="meta-field-value">{selectedDoc.driver_id || 'None'}</div>
                        </div>
                        <div className="meta-field">
                          <div className="meta-field-label">Trailer Number</div>
                          <div className="meta-field-value">{selectedDoc.trailer_id || 'None'}</div>
                        </div>
                        <div className="meta-field">
                          <div className="meta-field-label">Financial Amount</div>
                          <div className="meta-field-value highlight-yellow">
                            {selectedDoc.amount !== null ? `$${selectedDoc.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'N/A'}
                          </div>
                        </div>
                        <div className="meta-field">
                          <div className="meta-field-label">Document Date</div>
                          <div className="meta-field-value">{selectedDoc.date || 'N/A'}</div>
                        </div>
                        <div className="meta-field">
                          <div className="meta-field-label">Vendor Name</div>
                          <div className="meta-field-value">{selectedDoc.vendor || 'N/A'}</div>
                        </div>
                        <div className="meta-field">
                          <div className="meta-field-label">Registration Expiration</div>
                          <div className={`meta-field-value ${selectedDoc.expiry_date && selectedDoc.expiry_date <= '2026-07-01' ? 'highlight-red' : ''}`}>
                            {selectedDoc.expiry_date || 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Raw Text Box */}
                      <div>
                        <div className="meta-field-label">Raw Text (OCR / Ingest Transcript)</div>
                        <div className="raw-text-view">
                          {selectedDocText}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                      <FileText size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                      <p>Select a document to view audited metadata and OCR transcript.</p>
                    </div>
                  )}

                  {/* Auditor thought log trace for file uploads */}
                  {isUploading || uploadThoughts.length > 1 ? (
                    <div className="agent-trace-console" style={{ height: '180px', marginTop: 'auto' }}>
                      <div className="trace-title">
                        <Terminal size={14} /> Data Auditor Ingestion Pipeline
                      </div>
                      <div className="trace-logs">
                        {uploadThoughts.map((t, idx) => (
                          <div key={idx} className="log-entry auditor">
                            {t.message}
                          </div>
                        ))}
                        {isUploading && (
                          <div className="pulsating-dots">
                            <span className="pulse-dot" />
                            <span className="pulse-dot" />
                            <span className="pulse-dot" />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              Auditor parsing file structures...
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                </div>

              </div>

            </div>
          )}

          {/* TAB 3: Q&A WORKSPACE */}
          {activeTab === 'chat' && (
            <div className="section-card">
              <div className="section-header">
                <h2 className="section-title">
                  <MessageSquare size={18} className="logo-icon" /> Q&A Agent Workspace
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Grounding active</span>
              </div>
              
              <div className="qa-layout">
                
                {/* Left Side: Chat Interface */}
                <div className="chat-console">
                  <div className="chat-history">
                    {chatHistory.map((msg, idx) => (
                      <div key={idx} className={`chat-bubble ${msg.sender}`}>
                        <div>{msg.text}</div>
                        
                        {/* SQL Result tables rendered in line if SQL was run */}
                        {msg.sql_query && msg.sql_results && msg.sql_results.length > 0 && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              SQL Result:
                            </div>
                            <table className="sql-result-table">
                              <thead>
                                <tr>
                                  {msg.sql_columns.map((col) => <th key={col}>{col}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {msg.sql_results.map((row, rIdx) => (
                                  <tr key={rIdx}>
                                    {msg.sql_columns.map((col) => <td key={col}>{String(row[col])}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Citations block */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="chat-citations">
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Citations:</span>
                            {msg.citations.map((cit, cIdx) => (
                              <span 
                                key={cIdx} 
                                className="citation-chip"
                                onClick={() => {
                                  // Find the document and switch to Inbox tab
                                  const matchingDoc = documents.find(d => d.file_name === cit);
                                  if (matchingDoc) {
                                    setActiveTab('inbox');
                                    handleSelectDoc(matchingDoc);
                                  }
                                }}
                              >
                                <FileText size={10} /> {cit}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {isChatLoading && (
                      <div className="chat-bubble assistant">
                        <div className="pulsating-dots">
                          <span className="pulse-dot" />
                          <span className="pulse-dot" />
                          <span className="pulse-dot" />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Orchestrator thinking...
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Quick Query Chips */}
                  <div className="quick-queries">
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                      Ask:
                    </span>
                    <span className="query-chip" onClick={() => setQuery("Which trucks are profitable?")}>
                      Profitable trucks?
                    </span>
                    <span className="query-chip" onClick={() => setQuery("How much did I spend on parts last month?")}>
                      Spent on parts?
                    </span>
                    <span className="query-chip" onClick={() => setQuery("Where is the tax form for truck 84?")}>
                      Tax form truck 84?
                    </span>
                    <span className="query-chip" onClick={() => setQuery("What documents do I need to renew these plates?")}>
                      Plate renewals?
                    </span>
                    <span className="query-chip" onClick={() => setQuery("Which truck had the highest maintenance cost last month, and show the receipts?")}>
                      Highest repair and receipt?
                    </span>
                  </div>

                  {/* Form input */}
                  <form onSubmit={handleChatSubmit} className="chat-input-container">
                    <input 
                      type="text" 
                      placeholder="Ask the fleet operator a question (e.g. profit, receipts, renewals)..." 
                      className="chat-input"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      disabled={isChatLoading}
                    />
                    <button type="submit" className="btn-primary" disabled={isChatLoading || !query.trim()}>
                      Ask Agents
                    </button>
                  </form>
                </div>

                {/* Right Side: Agent Collaboration Logs */}
                <div className="agent-trace-console">
                  <div className="trace-title">
                    <Terminal size={14} /> Agent Collaboration Trace
                  </div>
                  <div className="trace-logs">
                    {agentTrace.map((log, idx) => {
                      let tag = '[SYSTEM]';
                      if (log.agent === 'orchestrator') tag = '[ORCHESTRATOR]';
                      else if (log.agent === 'sql') tag = '[SQL_DB_AGENT]';
                      else if (log.agent === 'rag') tag = '[DOC_RAG_AGENT]';
                      else if (log.agent === 'auditor') tag = '[DATA_AUDITOR]';
                      
                      return (
                        <div key={idx} className={`log-entry ${log.agent}`}>
                          <div>{tag} {log.message}</div>
                        </div>
                      );
                    })}
                    {isChatLoading && (
                      <div className="pulsating-dots" style={{ paddingLeft: '0.5rem' }}>
                        <span className="pulse-dot" />
                        <span className="pulse-dot" />
                        <span className="pulse-dot" />
                      </div>
                    )}
                    <div ref={traceEndRef} />
                  </div>
                </div>

              </div>

            </div>
          )}

        </section>

      </main>

    </div>
  );
}

export default App;
