"""
title: Mimir Tools Command Wrapper
author: Mimir Team
version: 1.0.0
description: Intercepts commands like /list_folders and executes MCP tools directly
required_open_webui_version: 0.6.34
"""

import aiohttp
import json
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class Filter:
    """
    Command wrapper that intercepts tool commands and executes them directly.
    
    Usage:
    - Type: /list_folders
    - Type: /folder_stats <path>
    - Type: /search <query>
    """
    
    class Valves(BaseModel):
        """Configuration"""
        MCP_SERVER_URL: str = Field(
            default="http://mcp-server:3000",
            description="MCP server URL"
        )
        NEO4J_URL: str = Field(
            default="bolt://neo4j_db:7687",
            description="Neo4j connection URL"
        )
        OLLAMA_URL: str = Field(
            default="http://host.docker.internal:11434",
            description="Ollama URL for embeddings"
        )
    
    def __init__(self):
        self.valves = self.Valves()
    
    async def inlet(
        self,
        body: Dict[str, Any],
        __user__: Optional[Dict[str, Any]] = None,
        __event_emitter__=None
    ) -> Dict[str, Any]:
        """Intercept incoming messages and check for tool commands"""
        
        messages = body.get("messages", [])
        if not messages:
            return body
        
        last_message = messages[-1].get("content", "")
        
        # Check for tool commands and execute them
        if last_message.startswith("/list_folders"):
            result = await self._list_folders(__event_emitter__)
            # Replace user message with instruction to display the data
            messages[-1]["content"] = f"Display this data exactly as formatted below. Do not add any commentary, just output the markdown:\n\n{result}"
            body["messages"] = messages
            
        elif last_message.startswith("/folder_stats "):
            path = last_message.replace("/folder_stats ", "").strip()
            result = await self._folder_stats(path, __event_emitter__)
            messages[-1]["content"] = f"Display this data exactly as formatted below. Do not add any commentary, just output the markdown:\n\n{result}"
            body["messages"] = messages
            
        elif last_message.startswith("/search "):
            query = last_message.replace("/search ", "").strip()
            result = await self._semantic_search(query, __event_emitter__)
            messages[-1]["content"] = f"Display this data exactly as formatted below. Do not add any commentary, just output the markdown:\n\n{result}"
            body["messages"] = messages
            
        elif last_message.startswith("/orchestration "):
            orchestration_id = last_message.replace("/orchestration ", "").strip()
            result = await self._get_orchestration_details(orchestration_id, __event_emitter__)
            messages[-1]["content"] = f"Display this data exactly as formatted below. Do not add any commentary, just output the markdown:\n\n{result}"
            body["messages"] = messages
        
        return body
    
    async def outlet(
        self,
        body: Dict[str, Any],
        __user__: Optional[Dict[str, Any]] = None,
        __event_emitter__=None
    ) -> Dict[str, Any]:
        """Intercept outgoing responses"""
        return body
    
    async def _list_folders(self, __event_emitter__=None) -> str:
        """List watched folders from MCP server"""
        
        if __event_emitter__:
            await __event_emitter__({
                "type": "status",
                "data": {
                    "description": "📂 Fetching watched folders...",
                    "done": False
                }
            })
        
        try:
            # Query Neo4j directly for watch configs
            from neo4j import AsyncGraphDatabase
            
            driver = AsyncGraphDatabase.driver(
                self.valves.NEO4J_URL,
                auth=("neo4j", "password")
            )
            
            async with driver.session() as session:
                # Get total stats and derive watched folder from absolute paths
                # Find the common root by taking the directory of the shortest path
                result = await session.run("""
                    MATCH (f {type: 'file'})
                    WHERE f.absolute_path IS NOT NULL
                    WITH f.absolute_path as path
                    WITH path, split(path, '/') as parts, size(split(path, '/')) as depth
                    ORDER BY depth ASC
                    LIMIT 1
                    WITH reduce(s = '', i IN range(0, size(parts)-2) | 
                        s + CASE WHEN s = '' THEN '' ELSE '/' END + parts[i]) as root_folder
                    MATCH (f2 {type: 'file'})
                    OPTIONAL MATCH (f2)-[:HAS_CHUNK]->(c {type: 'file_chunk'})
                    WITH root_folder,
                         count(DISTINCT f2) as total_files,
                         count(c) as total_chunks
                    RETURN root_folder as folder,
                           total_files as file_count,
                           total_chunks as chunk_count,
                           true as active
                """)
                
                records = await result.data()
            
            await driver.close()
            
            if not records or records[0].get("file_count", 0) == 0:
                return """## 📂 Watched Folders

No folders are currently being watched.

**Available commands:**
- `/list_folders` - List watched folders
- `/folder_stats <path>` - Get folder statistics
- `/search <query>` - Semantic search across indexed files
"""
            
            # Format output
            output = f"## 📂 Watched Folders\n\n"
            
            for record in records:
                folder = record.get("folder", "unknown")
                file_count = record.get("file_count", 0)
                chunk_count = record.get("chunk_count", 0)
                active = record.get("active", False)
                
                status_icon = "✅" if active else "❌"
                
                output += f"### {status_icon} `/{folder}`\n\n"
                output += f"- **Files:** {file_count}\n"
                output += f"- **Chunks:** {chunk_count}\n\n"
            
            output += "---\n\n"
            output += "**Available commands:**\n"
            output += "- `/list_folders` - List watched folders\n"
            output += "- `/folder_stats <path>` - Get folder statistics\n"
            output += "- `/search <query>` - Semantic search across indexed files\n"
            output += "- `/orchestration <id>` - Get orchestration run details and deliverables\n"
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": "✅ Folders loaded",
                        "done": True
                    }
                })
            
            return output
            
        except Exception as e:
            return f"❌ Error: {str(e)}"
    
    async def _folder_stats(self, folder_path: str, __event_emitter__=None) -> str:
        """Get folder statistics"""
        
        if __event_emitter__:
            await __event_emitter__({
                "type": "status",
                "data": {
                    "description": f"📊 Getting stats for {folder_path}...",
                    "done": False
                }
            })
        
        try:
            from neo4j import AsyncGraphDatabase
            
            driver = AsyncGraphDatabase.driver(
                self.valves.NEO4J_URL,
                auth=("neo4j", "password")
            )
            
            async with driver.session() as session:
                result = await session.run("""
                    MATCH (f {type: 'file'})
                    WHERE f.path STARTS WITH $folder_path
                    RETURN f.name as name,
                           f.path as path,
                           f.file_type as file_type,
                           f.size as size
                """, folder_path=folder_path)
                
                records = await result.data()
            
            await driver.close()
            
            if not records:
                return f"## 📊 Folder Stats: {folder_path}\n\nNo files found in this folder."
            
            # Calculate stats
            total_files = len(records)
            file_types = {}
            total_size = 0
            
            for record in records:
                file_type = record.get("file_type", "unknown")
                file_types[file_type] = file_types.get(file_type, 0) + 1
                
                size = record.get("size", 0)
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
            return f"❌ Error: {str(e)}"
    
    async def _semantic_search(self, query: str, __event_emitter__=None) -> str:
        """Semantic search across indexed files"""
        
        if __event_emitter__:
            await __event_emitter__({
                "type": "status",
                "data": {
                    "description": f"🔍 Searching for: {query}...",
                    "done": False
                }
            })
        
        try:
            # Generate embedding
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.valves.OLLAMA_URL}/api/embeddings",
                    json={"model": "nomic-embed-text", "prompt": query}
                ) as response:
                    if response.status != 200:
                        return f"❌ Error generating embedding: {await response.text()}"
                    
                    data = await response.json()
                    query_embedding = data.get("embedding", [])
            
            if not query_embedding:
                return "❌ Failed to generate embedding"
            
            # Search Neo4j
            from neo4j import AsyncGraphDatabase
            
            driver = AsyncGraphDatabase.driver(
                self.valves.NEO4J_URL,
                auth=("neo4j", "password")
            )
            
            async with driver.session() as session:
                result = await session.run("""
                    MATCH (n)
                    WHERE n.embedding IS NOT NULL
                    WITH n, 
                         reduce(dot = 0.0, i IN range(0, size(n.embedding)-1) | 
                            dot + n.embedding[i] * $query_embedding[i]) AS dot_product,
                         sqrt(reduce(sum = 0.0, i IN range(0, size(n.embedding)-1) | 
                            sum + n.embedding[i] * n.embedding[i])) AS norm1,
                         sqrt(reduce(sum = 0.0, i IN range(0, size($query_embedding)-1) | 
                            sum + $query_embedding[i] * $query_embedding[i])) AS norm2
                    WITH n, dot_product / (norm1 * norm2) AS similarity
                    WHERE similarity > 0.5
                    OPTIONAL MATCH (parent)-[:HAS_CHUNK]->(n)
                    RETURN n, parent, similarity
                    ORDER BY similarity DESC
                    LIMIT 10
                """, query_embedding=query_embedding)
                
                records = await result.data()
            
            await driver.close()
            
            if not records:
                return f"## 🔍 Search Results: {query}\n\nNo results found."
            
            # Format output
            output = f"## 🔍 Search Results: {query}\n\n"
            output += f"Found {len(records)} results:\n\n"
            
            for i, record in enumerate(records, 1):
                node = record.get("n", {})
                parent = record.get("parent", {})
                similarity = record.get("similarity", 0)
                
                # Get title
                if parent:
                    title = parent.get("name", parent.get("title", ""))
                    if not title:
                        file_path = parent.get("filePath", parent.get("path", ""))
                        if file_path:
                            title = file_path.split("/")[-1]
                else:
                    title = node.get("name", node.get("title", ""))
                
                if not title:
                    title = "Untitled"
                
                # Get content preview
                content = node.get("text", node.get("content", ""))[:200]
                
                output += f"{i}. **{title}** (similarity: {similarity:.2f})\n"
                if content:
                    output += f"   > {content}...\n\n"
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": "✅ Search complete",
                        "done": True
                    }
                })
            
            return output
            
        except Exception as e:
            return f"❌ Error: {str(e)}"
    
    async def _get_orchestration_details(self, orchestration_id: str, __event_emitter__=None) -> str:
        """Get orchestration run details, task results, and deliverables"""
        
        if __event_emitter__:
            await __event_emitter__({
                "type": "status",
                "data": {
                    "description": f"📊 Fetching orchestration details for {orchestration_id}...",
                    "done": False
                }
            })
        
        try:
            from neo4j import AsyncGraphDatabase
            import os
            
            driver = AsyncGraphDatabase.driver(
                self.valves.NEO4J_URL,
                auth=("neo4j", "password")
            )
            
            async with driver.session() as session:
                # Get todoList (orchestration summary)
                list_result = await session.run("""
                    MATCH (tl:todoList {orchestrationId: $orchestration_id})
                    RETURN tl.title as title,
                           tl.description as description,
                           tl.priority as priority,
                           tl.createdAt as created_at
                """, orchestration_id=orchestration_id)
                
                list_data = await list_result.data()
                
                if not list_data:
                    return f"## ❌ Orchestration Not Found\n\nNo orchestration run found with ID: `{orchestration_id}`"
                
                orchestration_info = list_data[0]
                
                # Get all todos (tasks) for this orchestration
                tasks_result = await session.run("""
                    MATCH (t:todo {orchestrationId: $orchestration_id})
                    RETURN t.originalTaskId as task_id,
                           t.title as title,
                           t.status as status,
                           t.qcScore as qc_score,
                           t.attemptNumber as attempts,
                           t.workerRole as worker_role,
                           t.qcRole as qc_role,
                           t.workerOutput as worker_output,
                           t.qcFeedback as qc_feedback,
                           t.qcPassed as qc_passed,
                           t.dependencies as dependencies
                    ORDER BY t.originalTaskId
                """, orchestration_id=orchestration_id)
                
                tasks_data = await tasks_result.data()
            
            await driver.close()
            
            # Format output
            output = f"# Orchestration Run Details\n\n"
            output += f"**Orchestration ID:** `{orchestration_id}`\n\n"
            
            # Orchestration Summary
            title = orchestration_info.get("title", "N/A")
            description = orchestration_info.get("description", "N/A")
            priority = orchestration_info.get("priority", "N/A")
            created_at = orchestration_info.get("created_at", "N/A")
            
            output += f"## 📋 Summary\n\n"
            output += f"**Title:** {title}\n\n"
            output += f"**Description:** {description}\n\n"
            output += f"**Priority:** {priority}\n\n"
            output += f"**Created:** {created_at}\n\n"
            
            # Task Overview
            total_tasks = len(tasks_data)
            completed_tasks = sum(1 for t in tasks_data if t.get("status") == "completed")
            failed_tasks = sum(1 for t in tasks_data if t.get("status") == "failed")
            avg_score = sum(t.get("qc_score", 0) or 0 for t in tasks_data) / total_tasks if total_tasks > 0 else 0
            
            output += f"## 📊 Task Overview\n\n"
            output += f"- **Total Tasks:** {total_tasks}\n"
            output += f"- **Completed:** {completed_tasks} ✅\n"
            output += f"- **Failed:** {failed_tasks} ❌\n"
            output += f"- **Average QC Score:** {avg_score:.1f}/100\n\n"
            
            # Task Details
            output += f"## 🔍 Task Details\n\n"
            
            for task in tasks_data:
                task_id = task.get("task_id", "unknown")
                title = task.get("title", "Untitled")
                status = task.get("status", "unknown")
                qc_score = task.get("qc_score", 0) or 0
                attempts = task.get("attempts", 1) or 1
                worker_role = task.get("worker_role", "N/A")
                qc_role = task.get("qc_role", "N/A")
                qc_passed = task.get("qc_passed", False)
                
                status_icon = "✅" if status == "completed" else "❌" if status == "failed" else "⏳"
                
                output += f"### {status_icon} Task {task_id}: {title}\n\n"
                output += f"- **Status:** {status}\n"
                output += f"- **QC Score:** {qc_score}/100\n"
                output += f"- **Attempts:** {attempts}\n"
                output += f"- **Worker Role:** {worker_role}\n"
                output += f"- **QC Role:** {qc_role}\n\n"
                
                # Show worker output preview (first 500 chars)
                worker_output = task.get("worker_output", "")
                if worker_output:
                    preview = worker_output[:500] + "..." if len(worker_output) > 500 else worker_output
                    output += f"<details>\n<summary>Worker Output Preview</summary>\n\n```\n{preview}\n```\n</details>\n\n"
            
            # Check for deliverables directory
            deliverables_path = f"./deliverables/{orchestration_id}"
            if os.path.exists(deliverables_path):
                output += f"## 📦 Deliverables\n\n"
                output += f"**Location:** `{deliverables_path}`\n\n"
                
                # List files
                files = os.listdir(deliverables_path)
                if files:
                    output += "**Files:**\n"
                    for file in sorted(files):
                        file_path = os.path.join(deliverables_path, file)
                        if os.path.isfile(file_path):
                            size = os.path.getsize(file_path)
                            if size < 1024:
                                size_str = f"{size} B"
                            elif size < 1024 * 1024:
                                size_str = f"{size / 1024:.1f} KB"
                            else:
                                size_str = f"{size / (1024 * 1024):.1f} MB"
                            
                            output += f"- `{file}` ({size_str})\n"
                    
                    output += f"\n**Total Files:** {len(files)}\n\n"
                    output += f"💡 **Tip:** Files are available in `{deliverables_path}` directory\n\n"
            else:
                output += f"## 📦 Deliverables\n\n"
                output += f"⚠️ No deliverables directory found at `{deliverables_path}`\n\n"
            
            # Tool Usage
            output += "---\n\n"
            output += "## 🛠️ Query This Orchestration Again\n\n"
            output += f"```\n/orchestration {orchestration_id}\n```\n\n"
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": "✅ Orchestration details loaded",
                        "done": True
                    }
                })
            
            return output
            
        except Exception as e:
            return f"❌ Error: {str(e)}\n\n**Stack trace:**\n```\n{e.__class__.__name__}: {str(e)}\n```"
