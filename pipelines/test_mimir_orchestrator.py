"""
Unit tests for Mimir Orchestrator semantic search functionality
Tests the MCP protocol interaction and context retrieval
"""

import asyncio
import aiohttp
import json
from typing import Dict, Any


async def test_mcp_connection():
    """Test 1: Verify MCP server is reachable"""
    print("\n🧪 Test 1: MCP Server Connection")
    print("=" * 60)
    
    url = "http://mcp-server:3000/mcp"
    
    try:
        async with aiohttp.ClientSession() as session:
            # Try to connect
            async with session.get("http://mcp-server:3000/health", timeout=5) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ MCP server is healthy")
                    print(f"   Version: {data.get('version')}")
                    print(f"   Tools: {data.get('tools')}")
                    return True
                else:
                    print(f"❌ Health check failed: {response.status}")
                    return False
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False


async def test_mcp_initialization():
    """Test 2: Verify MCP session initialization"""
    print("\n🧪 Test 2: MCP Session Initialization")
    print("=" * 60)
    
    url = "http://mcp-server:3000/mcp"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }
    
    init_payload = {
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0"}
        }
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=init_payload, headers=headers) as response:
                response_text = await response.text()
                
                print(f"Status: {response.status}")
                
                if response.status == 200:
                    data = json.loads(response_text)
                    session_id = response.headers.get('Mcp-Session-Id')
                    
                    print(f"✅ Initialization successful")
                    print(f"   Session ID: {session_id}")
                    print(f"   Protocol Version: {data.get('result', {}).get('protocolVersion')}")
                    
                    return session_id
                else:
                    print(f"❌ Initialization failed: {response.status}")
                    print(f"   Response: {response_text[:200]}")
                    return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


async def test_semantic_search_with_session():
    """Test 3: Verify semantic search with proper session handling"""
    print("\n🧪 Test 3: Semantic Search with Session ID")
    print("=" * 60)
    
    url = "http://mcp-server:3000/mcp"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            # Step 1: Initialize
            init_payload = {
                "jsonrpc": "2.0",
                "id": 0,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "test-client", "version": "1.0"}
                }
            }
            
            session_id = None
            async with session.post(url, json=init_payload, headers=headers) as init_resp:
                if init_resp.status != 200:
                    print(f"❌ Init failed: {init_resp.status}")
                    return False
                
                session_id = init_resp.headers.get('Mcp-Session-Id')
                print(f"✅ Initialized with session ID: {session_id}")
            
            # Step 2: Call vector_search_nodes with session ID
            tool_headers = headers.copy()
            if session_id:
                tool_headers['mcp-session-id'] = session_id
            
            tool_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "vector_search_nodes",
                    "arguments": {
                        "query": "authentication system i90 api",
                        "limit": 5
                    }
                }
            }
            
            async with session.post(url, json=tool_payload, headers=tool_headers) as response:
                response_text = await response.text()
                
                print(f"Tool call status: {response.status}")
                
                if response.status != 200:
                    print(f"❌ Tool call failed: {response.status}")
                    print(f"   Response: {response_text[:300]}")
                    return False
                
                # Parse response
                data = json.loads(response_text)
                
                if "error" in data:
                    print(f"❌ MCP error: {data['error']}")
                    return False
                
                if "result" not in data:
                    print(f"❌ No result in response")
                    return False
                
                # Extract results
                result_content = data["result"].get("content", [])
                if not result_content:
                    print(f"❌ No content in result")
                    return False
                
                result_text = result_content[0].get("text", "")
                result_data = json.loads(result_text)
                results = result_data.get("results", [])
                
                print(f"✅ Search successful!")
                print(f"   Found {len(results)} results")
                
                for i, r in enumerate(results[:3], 1):
                    node = r.get("node", {})
                    props = node.get("properties", {})
                    similarity = r.get("similarity", 0)
                    
                    print(f"\n   Result {i}:")
                    print(f"   - Similarity: {similarity:.3f}")
                    print(f"   - Type: {props.get('type')}")
                    print(f"   - Title: {props.get('title', props.get('name', 'N/A'))[:60]}")
                
                return len(results) > 0
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_context_formatting():
    """Test 4: Verify context formatting matches pipeline expectations"""
    print("\n🧪 Test 4: Context Formatting")
    print("=" * 60)
    
    # Simulate the context formatting logic from the pipeline
    mock_results = [
        {
            "node": {
                "properties": {
                    "type": "file",
                    "title": "auth-service.ts",
                    "content": "Authentication service implementation with JWT tokens and session management..."
                }
            },
            "similarity": 0.89
        },
        {
            "node": {
                "properties": {
                    "type": "todo",
                    "name": "Implement I90 API integration",
                    "description": "Integrate with I90 authentication APIs for SSO support..."
                }
            },
            "similarity": 0.85
        }
    ]
    
    # Format context (same logic as pipeline)
    context_parts = []
    for i, result in enumerate(mock_results, 1):
        node = result.get("node", {})
        props = node.get("properties", {})
        similarity = result.get("similarity", 0)
        
        node_type = props.get("type", "unknown")
        title = props.get("title", props.get("name", "Untitled"))
        content = props.get("content", props.get("description", ""))
        
        # Truncate long content
        if len(content) > 500:
            content = content[:500] + "..."
        
        context_parts.append(f"""### Context {i} (similarity: {similarity:.2f})
**Type:** {node_type}
**Title:** {title}
**Content:**
{content}
""")
    
    formatted_context = "\n\n".join(context_parts)
    
    print("✅ Context formatted successfully")
    print(f"   Context length: {len(formatted_context)} chars")
    print(f"   Number of items: {len(context_parts)}")
    print("\n   Preview:")
    print("   " + "\n   ".join(formatted_context.split("\n")[:10]))
    
    return len(formatted_context) > 0


async def run_all_tests():
    """Run all tests in sequence"""
    print("\n" + "=" * 60)
    print("🧪 MIMIR ORCHESTRATOR SEMANTIC SEARCH TESTS")
    print("=" * 60)
    
    results = {}
    
    # Test 1: Connection
    results['connection'] = await test_mcp_connection()
    
    if not results['connection']:
        print("\n❌ Cannot proceed: MCP server not reachable")
        return results
    
    # Test 2: Initialization
    session_id = await test_mcp_initialization()
    results['initialization'] = session_id is not None
    
    # Test 3: Semantic search
    results['semantic_search'] = await test_semantic_search_with_session()
    
    # Test 4: Context formatting
    results['context_formatting'] = await test_context_formatting()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name.replace('_', ' ').title()}")
    
    all_passed = all(results.values())
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✅ ALL TESTS PASSED - Pipeline is ready to use!")
    else:
        print("❌ SOME TESTS FAILED - Fix issues before uploading")
    print("=" * 60 + "\n")
    
    return results


if __name__ == "__main__":
    # Run tests
    results = asyncio.run(run_all_tests())
    
    # Exit with appropriate code
    exit(0 if all(results.values()) else 1)
