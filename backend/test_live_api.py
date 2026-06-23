import os
import sys
from agents import OrchestratorAgent

def test_live_claude():
    claude_key = os.environ.get("ANTHROPIC_API_KEY") or ""
    
    print("Initializing Orchestrator with Claude API Key...")
    orchestrator = OrchestratorAgent(api_key=claude_key)
    
    query = "Which trucks are profitable?"
    print(f"\nRunning Live Query (Claude/claude-3-5-haiku-20241022): '{query}'\n")
    
    result = orchestrator.handle_query(query, provider="claude")
    
    print("--- ANSWER ---")
    print(result["answer"])
    print("--------------")
    print("\nThought Trace:")
    for thought in result["thought_logs"]:
        print(f"  * {thought}")

if __name__ == "__main__":
    test_live_claude()
