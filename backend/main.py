from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
from db_manager import get_db_connection, init_db
from agents import OrchestratorAgent, AuditorAgent
from document_processor import get_document_warnings

app = FastAPI(title="FleetDoc AI API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For buildathon/local ease of use
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup if it doesn't exist
init_db(force=False)

class ChatRequest(BaseModel):
    query: str
    api_key: str = None
    provider: str = "gemini"

@app.get("/api/fleet-stats")
def get_fleet_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Counts
    cursor.execute("SELECT COUNT(*) FROM trucks")
    total_trucks = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM drivers WHERE status = 'Active'")
    active_drivers = cursor.fetchone()[0]
    
    # 2. Financial sums
    cursor.execute("""
        SELECT 
            SUM(CASE WHEN record_type = 'Revenue' THEN amount ELSE 0 END) AS revenue,
            SUM(CASE WHEN record_type IN ('Maintenance', 'Fuel') THEN amount ELSE 0 END) AS expenses
        FROM financial_records
    """)
    fin = cursor.fetchone()
    revenue = fin['revenue'] or 0.0
    expenses = fin['expenses'] or 0.0
    net_profit = revenue - expenses
    
    # 3. New Dashboard KPIs
    # Total documents
    cursor.execute("SELECT COUNT(*) FROM documents")
    total_documents = cursor.fetchone()[0]
    
    # Duplicate documents
    cursor.execute("SELECT COUNT(*) FROM documents WHERE is_duplicate = 1")
    duplicate_documents = cursor.fetchone()[0]
    
    # Missing truck associations
    cursor.execute("SELECT COUNT(*) FROM documents WHERE truck_id IS NULL OR truck_id = ''")
    missing_truck_associations = cursor.fetchone()[0]
    
    # Expiring registrations in <= 30 days (relative to current system date "2026-06-18")
    cursor.execute("""
        SELECT COUNT(*) 
        FROM documents 
        WHERE document_type = 'Registration' 
          AND expiry_date IS NOT NULL 
          AND expiry_date >= '2026-06-18'
          AND expiry_date <= '2026-07-18'
    """)
    expiring_registrations = cursor.fetchone()[0]
    
    # Expired registrations
    cursor.execute("""
        SELECT COUNT(*)
        FROM documents
        WHERE document_type = 'Registration'
          AND expiry_date IS NOT NULL
          AND expiry_date < '2026-06-18'
    """)
    expired_registrations = cursor.fetchone()[0]
    
    # Count warnings across all documents to compute compliance score
    cursor.execute("""
        SELECT document_id, file_name, document_type, upload_date, truck_id, driver_id, trailer_id, vendor, amount, date, expiry_date, is_duplicate, raw_text
        FROM documents
    """)
    all_docs = [dict(row) for row in cursor.fetchall()]
    total_warnings_count = 0
    for doc in all_docs:
        warnings = get_document_warnings(doc)
        total_warnings_count += len(warnings)
        
    compliance_risk_score = max(0, 100 - (total_warnings_count * 8))
    
    # 4. Alerts (Expiring registrations) - keep existing for UI compatibility
    cursor.execute("""
        SELECT truck_id, file_name, expiry_date 
        FROM documents 
        WHERE document_type = 'Registration' 
          AND expiry_date IS NOT NULL 
          AND expiry_date <= '2026-07-18'
    """)
    alerts = [dict(row) for row in cursor.fetchall()]
    
    # 5. Fleet List with status & individual financials
    cursor.execute("""
        SELECT 
            t.truck_id, 
            t.make || ' ' || t.model AS name, 
            t.license_plate,
            t.status,
            COALESCE(SUM(CASE WHEN f.record_type = 'Revenue' THEN f.amount ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN f.record_type IN ('Maintenance', 'Fuel') THEN f.amount ELSE 0 END), 0) AS expenses
        FROM trucks t
        LEFT JOIN financial_records f ON t.truck_id = f.truck_id
        GROUP BY t.truck_id
    """)
    trucks = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return {
        "total_trucks": total_trucks,
        "active_drivers": active_drivers,
        "total_revenue": revenue,
        "total_expenses": expenses,
        "net_profit": net_profit,
        "alerts": alerts,
        "trucks": trucks,
        "total_documents": total_documents,
        "expiring_registrations": expiring_registrations + expired_registrations,
        "duplicate_documents": duplicate_documents,
        "missing_truck_associations": missing_truck_associations,
        "compliance_risk_score": compliance_risk_score
    }

@app.get("/api/documents")
def get_documents():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT document_id, file_name, document_type, upload_date, truck_id, driver_id, trailer_id, vendor, amount, date, expiry_date, is_duplicate, raw_text
        FROM documents
        ORDER BY document_id DESC
    """)
    docs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    # Append warnings to each document
    for doc in docs:
        doc["warnings"] = get_document_warnings(doc)
    return docs

@app.get("/api/documents/{doc_id}/text")
def get_document_text(doc_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_name, raw_text FROM documents WHERE document_id = ?", (doc_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return dict(row)

@app.get("/api/fleet-relationships")
def get_fleet_relationships():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT truck_id, make, model, year, license_plate, status FROM trucks")
    trucks = [dict(row) for row in cursor.fetchall()]
    
    relationships = []
    for truck in trucks:
        t_id = truck["truck_id"]
        
        # Get active/assigned driver
        cursor.execute("""
            SELECT d.driver_id, d.name 
            FROM documents doc
            JOIN drivers d ON doc.driver_id = d.driver_id
            WHERE doc.truck_id = ?
            GROUP BY d.driver_id
            ORDER BY COUNT(doc.document_id) DESC
            LIMIT 1
        """, (t_id,))
        drv = cursor.fetchone()
        if drv:
            driver_name = drv["name"]
            driver_id = drv["driver_id"]
        else:
            default_drivers = {"84": ("D1", "Bob Miller"), "102": ("D2", "John Smith"), "150": ("D3", "Alice Jones")}
            fallback = default_drivers.get(t_id, (None, "Unassigned"))
            driver_id, driver_name = fallback
            
        # Get active trailer
        cursor.execute("""
            SELECT trailer_id 
            FROM documents 
            WHERE truck_id = ? AND trailer_id IS NOT NULL AND trailer_id != ''
            GROUP BY trailer_id
            ORDER BY COUNT(document_id) DESC
            LIMIT 1
        """, (t_id,))
        trl = cursor.fetchone()
        trailer_id = trl["trailer_id"] if trl else ("TL-10" if t_id == "84" else ("TL-12" if t_id == "102" else "Unlinked"))
        
        # Doc count breakdown
        cursor.execute("""
            SELECT document_type, COUNT(*) as cnt 
            FROM documents 
            WHERE truck_id = ?
            GROUP BY document_type
        """, (t_id,))
        doc_counts = {row["document_type"]: row["cnt"] for row in cursor.fetchall()}
        
        counts_breakdown = {
            "Title": doc_counts.get("Title", 0),
            "Registration": doc_counts.get("Registration", 0),
            "Maintenance": doc_counts.get("Maintenance Receipt", 0),
            "Fuel": doc_counts.get("Fuel Record", 0),
            "Revenue": doc_counts.get("Revenue", 0),
            "Tax": doc_counts.get("IFTA Tax", 0),
            "Other": doc_counts.get("Other", 0)
        }
        
        # Timeline
        cursor.execute("""
            SELECT document_id, file_name, document_type, date, upload_date, amount, vendor, expiry_date, is_duplicate, raw_text
            FROM documents
            WHERE truck_id = ?
            ORDER BY COALESCE(date, upload_date) DESC
        """, (t_id,))
        docs = [dict(row) for row in cursor.fetchall()]
        
        timeline = []
        for d in docs:
            event_date = d["date"] or d["upload_date"]
            event_type = d["document_type"]
            
            if event_type == "Registration":
                msg = f"Registration filed with {d['vendor'] or 'Texas DMV'} (Fee: ${d['amount'] or 320.0:.2f}). Expiration: {d['expiry_date'] or 'N/A'}."
            elif event_type == "Title":
                msg = f"Certificate of Title issued for {truck['make']} {truck['model']}."
            elif event_type == "Maintenance Receipt":
                msg = f"Maintenance: Brake/tire service by {d['vendor']} (Cost: ${d['amount'] or 0.0:.2f})."
            elif event_type == "Fuel Record":
                msg = f"Fuel fill-up at {d['vendor']} (Cost: ${d['amount'] or 0.0:.2f})."
            elif event_type == "Revenue":
                msg = f"Freight Revenue Invoice: Load delivered, billed to {d['vendor']} (Pay: ${d['amount'] or 0.0:.2f})."
            elif event_type == "IFTA Tax":
                msg = f"IFTA Quarterly Tax Return filed (Tax: ${d['amount'] or 0.0:.2f})."
            else:
                msg = f"Document '{d['file_name']}' processed by Auditor Agent."
                
            timeline.append({
                "date": event_date,
                "document_id": d["document_id"],
                "file_name": d["file_name"],
                "type": event_type,
                "description": msg,
                "warnings": get_document_warnings(d)
            })
            
        relationships.append({
            "truck_id": t_id,
            "make": truck["make"],
            "model": truck["model"],
            "year": truck["year"],
            "license_plate": truck["license_plate"],
            "status": truck["status"],
            "driver_name": driver_name,
            "driver_id": driver_id,
            "trailer_id": trailer_id,
            "document_counts": counts_breakdown,
            "timeline": timeline
        })
        
    conn.close()
    return relationships

@app.post("/api/upload")
def upload_document(
    file: UploadFile = File(...),
    api_key: str = Form(None),
    provider: str = Form("gemini")
):
    try:
        content = file.file.read()
        text_content = content.decode("utf-8", errors="ignore")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read text file: {str(e)}")
        
    auditor = AuditorAgent(api_key=api_key)
    doc_id, metadata, is_duplicate, thoughts = auditor.audit_document(file.filename, text_content, provider)
    
    # Fetch uploaded row to get warnings dynamically
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT document_id, file_name, document_type, upload_date, truck_id, driver_id, trailer_id, vendor, amount, date, expiry_date, is_duplicate, raw_text
        FROM documents
        WHERE document_id = ?
    """, (doc_id,))
    doc_row = dict(cursor.fetchone())
    conn.close()
    
    metadata["warnings"] = get_document_warnings(doc_row)
    
    return {
        "document_id": doc_id,
        "metadata": metadata,
        "is_duplicate": is_duplicate,
        "thought_logs": thoughts
    }

@app.post("/api/chat")
def chat_query(req: ChatRequest):
    orchestrator = OrchestratorAgent(api_key=req.api_key)
    result = orchestrator.handle_query(req.query, req.provider)
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

