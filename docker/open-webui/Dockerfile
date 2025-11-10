FROM ghcr.io/open-webui/open-webui:main

USER root

# Install Python dependencies for Mimir pipelines
RUN pip install --no-cache-dir \
    neo4j \
    aiohttp \
    pydantic

# Create pipelines directory
RUN mkdir -p /app/backend/data/pipelines

# Copy Mimir pipelines into the container
COPY pipelines/mimir_orchestrator.py /app/backend/data/pipelines/
COPY pipelines/mimir_rag_auto.py /app/backend/data/pipelines/
COPY pipelines/mimir_file_browser.py /app/backend/data/pipelines/
COPY pipelines/mimir_tools_wrapper.py /app/backend/data/pipelines/

# Copy init script to auto-enable pipelines
COPY docker/open-webui/init-pipelines.sh /app/init-pipelines.sh
RUN chmod +x /app/init-pipelines.sh

# Set ownership
RUN chown -R root:root /app/backend/data/pipelines

USER root
