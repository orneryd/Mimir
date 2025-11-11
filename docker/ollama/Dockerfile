FROM ollama/ollama:latest

# Set the embedding model to pull (can be overridden at build time)
ARG EMBEDDING_MODEL=nomic-embed-text

# Start Ollama server in the background and pull the model
RUN ollama serve & \
    sleep 5 && \
    ollama pull ${EMBEDDING_MODEL} && \
    pkill ollama
