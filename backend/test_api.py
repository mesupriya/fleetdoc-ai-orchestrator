import urllib.request
import json
import time
import subprocess

API_URL = "http://localhost:8000"

def call_api(endpoint, method="GET", data=None):
    url = f"{API_URL}{endpoint}"
    req_data = None
    headers = {}
    
    if data:
        req_data = json.dumps(data).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP Error {e.code}: {e.read().decode('utf-8')}"
    except Exception as e:
        return None, str(e)

def run_tests():
    print("==================================================")
    print("         FleetDoc AI API Verification             ")
    print("==================================================")
    
    # Test 1: Check stats
    print("\n[TEST 1] Querying Fleet Stats Dashboard data...")
    stats, err = call_api("/api/fleet-stats")
    if err:
        print(f"[FAIL] Failed: {err}")
        return
    print(f"[OK] Success! Total Trucks: {stats['total_trucks']}, Active Drivers: {stats['active_drivers']}")
    print(f"   Financials - Revenue: ${stats['total_revenue']:.2f}, Expenses: ${stats['total_expenses']:.2f}, Profit: ${stats['net_profit']:.2f}")
    
    # Test 2: Check documents
    print("\n[TEST 2] Fetching Seeded Document Inbox...")
    docs, err = call_api("/api/documents")
    if err:
        print(f"[FAIL] Failed: {err}")
        return
    print(f"[OK] Success! Ingested Documents Count: {len(docs)}")
    duplicates = [d for d in docs if d['is_duplicate'] == 1]
    print(f"   Duplicate Receipts Flagged: {len(duplicates)}")
    
    # Test 3: SQL Analytical Query
    print("\n[TEST 3] Running Q&A Agent on SQL Query: 'Which trucks are profitable?'")
    resp, err = call_api("/api/chat", method="POST", data={"query": "Which trucks are profitable?"})
    if err:
        print(f"[FAIL] Failed: {err}")
        return
    print("[AGENT] Agent Output:")
    print(resp['answer'])
    print("[TRACE] Agent Collaboration Trace:")
    for thought in resp['thought_logs'][:4]:
        print(f"   -> {thought}")
        
    # Test 4: RAG Query
    print("\n[TEST 4] Running Q&A Agent on RAG Query: 'Where is the tax form for truck 84?'")
    resp, err = call_api("/api/chat", method="POST", data={"query": "Where is the tax form for truck 84?"})
    if err:
        print(f"[FAIL] Failed: {err}")
        return
    print("[AGENT] Agent Output:")
    print(resp['answer'])
    print(f"[CITATIONS] Citations: {resp['citations']}")
    
    # Test 5: Hybrid Query (SQL + RAG)
    print("\n[TEST 5] Running Q&A Agent on Hybrid Query: 'Which truck had the highest maintenance cost last month, and show the receipts?'")
    resp, err = call_api("/api/chat", method="POST", data={"query": "Which truck had the highest maintenance cost last month, and show the receipts?"})
    if err:
        print(f"[FAIL] Failed: {err}")
        return
    print("[AGENT] Agent Output:")
    print(resp['answer'])
    print(f"[CITATIONS] Citations: {resp['citations']}")
    
    # Test 6: Grounding Check (No Hallucination)
    print("\n[TEST 6] Running Q&A Agent on Out-of-bounds Query: 'What was the fuel cost in January 2024?'")
    resp, err = call_api("/api/chat", method="POST", data={"query": "What was the fuel cost in January 2024?"})
    if err:
        print(f"[FAIL] Failed: {err}")
        return
    print("[AGENT] Agent Output:")
    print(resp['answer'])
    if "cannot confirm" in resp['answer'].lower() or "no matching" in resp['answer'].lower() or "cannot verify" in resp['answer'].lower():
        print("[OK] Success! Grounding guardrail blocked hallucinations due to missing evidence.")
    else:
        print("[WARNING] Warning: System did not gracefully explain missing evidence.")
        
    print("\n==================================================")
    print("         Verification Run Complete                ")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
