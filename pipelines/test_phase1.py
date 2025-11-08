"""
Quick test script for Phase 1 Mimir Pipeline
Tests MCP connection and PM agent functionality
"""

import requests
import json

MCP_SERVER_URL = "http://localhost:3000"

def test_health():
    """Test MCP server health endpoint"""
    print("🔍 Testing MCP Server health...")
    try:
        response = requests.get(f"{MCP_SERVER_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ MCP Server is running")
            return True
        else:
            print(f"⚠️ MCP Server responded with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ MCP Server connection failed: {e}")
        return False

def test_mimir_chain():
    """Test mimir-chain tool call"""
    print("\n🎯 Testing mimir-chain (PM Agent)...")
    
    try:
        response = requests.post(
            f"{MCP_SERVER_URL}/message",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "mimir_chain",
                    "arguments": {
                        "task": "Create a simple REST API with user authentication",
                        "agent_type": "pm",
                        "generate_preambles": True,
                        "create_todos": True
                    }
                }
            },
            headers={"mcp-session-id": "test-session-123"},
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            content = result.get("result", {}).get("content", [{}])[0].get("text", "")
            
            print("✅ PM Agent responded successfully")
            print("\n📋 PM Response Preview:")
            print("-" * 60)
            print(content[:500] + "..." if len(content) > 500 else content)
            print("-" * 60)
            
            return True
        else:
            print(f"❌ MCP call failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error calling mimir-chain: {e}")
        return False

def test_list_tools():
    """List available MCP tools"""
    print("\n📚 Listing available MCP tools...")
    
    try:
        response = requests.post(
            f"{MCP_SERVER_URL}/message",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {}
            },
            headers={"mcp-session-id": "test-session-123"},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            tools = result.get("result", {}).get("tools", [])
            
            print(f"✅ Found {len(tools)} tools:")
            for tool in tools[:10]:  # Show first 10
                print(f"   - {tool.get('name', 'unknown')}")
            
            if len(tools) > 10:
                print(f"   ... and {len(tools) - 10} more")
            
            return True
        else:
            print(f"⚠️ Could not list tools: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error listing tools: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Mimir Phase 1 Pipeline - Connection Test")
    print("=" * 60)
    
    # Run tests
    health_ok = test_health()
    
    if health_ok:
        tools_ok = test_list_tools()
        chain_ok = test_mimir_chain()
        
        print("\n" + "=" * 60)
        print("Test Summary:")
        print(f"  Health Check: {'✅ PASS' if health_ok else '❌ FAIL'}")
        print(f"  List Tools:   {'✅ PASS' if tools_ok else '❌ FAIL'}")
        print(f"  PM Agent:     {'✅ PASS' if chain_ok else '❌ FAIL'}")
        print("=" * 60)
        
        if health_ok and chain_ok:
            print("\n🎉 All tests passed! Pipeline is ready to use.")
        else:
            print("\n⚠️ Some tests failed. Check configuration.")
    else:
        print("\n❌ MCP Server is not accessible.")
        print("\nTroubleshooting:")
        print("1. Run: docker-compose up -d")
        print("2. Wait 30 seconds for services to start")
        print("3. Check: docker ps")
        print("4. Check logs: docker logs mcp-server")
