"""
title: Mimir File Browser
author: Mimir Team
author_url: https://github.com/mimir
funding_url: https://github.com/mimir
version: 1.0.0
description: Display and manage watched folders from Mimir MCP server
required_open_webui_version: 0.6.34
"""

import aiohttp
import json
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class Action:
    """
    Mimir File Browser - Display watched folders from MCP server
    
    This is an Action class that provides tool functions for displaying
    and managing watched folders from the Mimir MCP server.
    """
    
    class Valves(BaseModel):
        """Configuration for Mimir File Browser"""
        MCP_SERVER_URL: str = Field(
            default="http://mcp-server:3000",
            description="MCP server URL"
        )
    
    def __init__(self):
        self.valves = self.Valves()
    
    async def list_watched_folders(
        self,
        __user__: Optional[Dict[str, Any]] = None,
        __event_emitter__=None
    ) -> str:
        """
        List all folders currently being watched by Mimir.
        
        Returns a formatted list of watched folders with file counts and status.
        
        :return: Formatted list of watched folders
        """
        
        if __event_emitter__:
            await __event_emitter__({
                "type": "status",
                "data": {
                    "description": "📂 Fetching watched folders from Mimir...",
                    "done": False
                }
            })
        
        try:
            # Call Mimir MCP server
            url = f"{self.valves.MCP_SERVER_URL}/mcp/tools/list_folders"
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json={}) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return f"❌ Error fetching watched folders: {error_text}"
                    
                    data = await response.json()
            
            # Parse response
            if "error" in data:
                return f"❌ Error: {data['error']}"
            
            watches = data.get("watches", [])
            total = data.get("total", 0)
            
            if total == 0:
                return """## 📂 Watched Folders

No folders are currently being watched.

**To start watching a folder:**
```
Use the index_folder MCP tool to add a folder to watch.
```
"""
            
            # Format output
            output = f"## 📂 Watched Folders ({total} active)\n\n"
            
            for watch in watches:
                watch_id = watch.get("watch_id", "unknown")
                folder = watch.get("folder", watch.get("containerPath", "unknown"))
                files_indexed = watch.get("files_indexed", 0)
                recursive = watch.get("recursive", False)
                last_update = watch.get("last_update", "unknown")
                active = watch.get("active", False)
                
                status_icon = "✅" if active else "❌"
                recursive_icon = "🔄" if recursive else "📁"
                
                output += f"### {status_icon} {folder}\n\n"
                output += f"- **Watch ID:** `{watch_id}`\n"
                output += f"- **Files Indexed:** {files_indexed}\n"
                output += f"- **Recursive:** {recursive_icon} {'Yes' if recursive else 'No'}\n"
                output += f"- **Last Update:** {last_update}\n"
                output += f"- **Status:** {'Active' if active else 'Inactive'}\n\n"
            
            output += "---\n\n"
            output += "**Available Actions:**\n"
            output += "- Use `index_folder` to add a new folder\n"
            output += "- Use `remove_folder` to stop watching a folder\n"
            output += "- Use `vector_search_nodes` to search indexed files\n"
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": "✅ Watched folders loaded",
                        "done": True
                    }
                })
            
            return output
            
        except Exception as e:
            error_msg = f"❌ Error connecting to Mimir MCP server: {str(e)}"
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": error_msg,
                        "done": True
                    }
                })
            
            return error_msg
    
    async def get_folder_stats(
        self,
        folder_path: str,
        __user__: Optional[Dict[str, Any]] = None,
        __event_emitter__=None
    ) -> str:
        """
        Get detailed statistics for a specific watched folder.
        
        :param folder_path: Path to the folder
        :return: Detailed statistics about the folder
        """
        
        if __event_emitter__:
            await __event_emitter__({
                "type": "status",
                "data": {
                    "description": f"📊 Getting stats for {folder_path}...",
                    "done": False
                }
            })
        
        try:
            # Call Mimir MCP server to get file nodes
            url = f"{self.valves.MCP_SERVER_URL}/mcp/tools/memory_node"
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json={
                    "operation": "query",
                    "type": "file",
                    "filters": {"path": folder_path}
                }) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return f"❌ Error fetching folder stats: {error_text}"
                    
                    data = await response.json()
            
            nodes = data.get("nodes", [])
            
            if not nodes:
                return f"## 📊 Folder Stats: {folder_path}\n\nNo files found in this folder."
            
            # Calculate stats
            total_files = len(nodes)
            file_types = {}
            total_size = 0
            
            for node in nodes:
                props = node.get("properties", {})
                file_type = props.get("file_type", "unknown")
                file_types[file_type] = file_types.get(file_type, 0) + 1
                
                # Size might not be available
                size = props.get("size", 0)
                if isinstance(size, (int, float)):
                    total_size += size
            
            # Format output
            output = f"## 📊 Folder Stats: {folder_path}\n\n"
            output += f"**Total Files:** {total_files}\n\n"
            
            if file_types:
                output += "**File Types:**\n"
                for ftype, count in sorted(file_types.items(), key=lambda x: x[1], reverse=True):
                    output += f"- `{ftype}`: {count} files\n"
            
            if total_size > 0:
                # Convert bytes to human-readable
                if total_size < 1024:
                    size_str = f"{total_size} B"
                elif total_size < 1024 * 1024:
                    size_str = f"{total_size / 1024:.2f} KB"
                elif total_size < 1024 * 1024 * 1024:
                    size_str = f"{total_size / (1024 * 1024):.2f} MB"
                else:
                    size_str = f"{total_size / (1024 * 1024 * 1024):.2f} GB"
                
                output += f"\n**Total Size:** {size_str}\n"
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": "✅ Stats loaded",
                        "done": True
                    }
                })
            
            return output
            
        except Exception as e:
            error_msg = f"❌ Error: {str(e)}"
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": error_msg,
                        "done": True
                    }
                })
            
            return error_msg
