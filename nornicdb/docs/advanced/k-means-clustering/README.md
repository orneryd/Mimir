# K-Means Clustering

**K-Means clustering for vector embeddings (not database clustering).**

## 📚 Documentation

- **[K-Means Algorithm](kmeans-algorithm.md)** - Algorithm details and usage
- **[Real-Time K-Means](realtime-kmeans.md)** - Live cluster updates
- **[GPU Implementation](gpu-implementation.md)** - GPU-accelerated clustering
- **[Metal Optimizations](metal-optimizations.md)** - Apple Silicon fixes

## 🎯 What is K-Means Clustering?

K-Means clustering groups similar vectors together, enabling:
- Faster approximate search
- Data organization
- Anomaly detection
- Dimensionality reduction

## 🚀 Quick Start

```cypher
// Create clusters from embeddings
CALL nornicdb.cluster.kmeans({
  k: 10,
  maxIterations: 100,
  tolerance: 0.001
})
YIELD clusterId, centroid, size
RETURN clusterId, size
```

## 📖 Learn More

- **[K-Means Algorithm](kmeans-algorithm.md)** - How K-Means works
- **[GPU Implementation](gpu-implementation.md)** - 10-100x speedup for K-Means
- **[Real-Time Updates](realtime-kmeans.md)** - Dynamic K-Means clustering

---

**Get started** → **[K-Means Algorithm](kmeans-algorithm.md)**
