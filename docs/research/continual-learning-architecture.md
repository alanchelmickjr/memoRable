# Applying continual learning insights to memory-based AI architectures

The repository `https://github.com/alanchelmickjr/memoRable` could not be accessed—it may be private, renamed, or not yet published. However, based on Alan Helmick's documented focus on **Cognitive AI**, **Transdifferential Cognitive Architecture**, and **micro models**, this document provides actionable architectural recommendations for memory-based continual learning systems drawing from the Mirzadeh et al. (2022) paper "Architecture Matters in Continual Learning."

## Why architecture choices dominate algorithmic interventions

The paper's most striking finding is that **simple architectural modifications can match or exceed sophisticated continual learning algorithms**. For example, removing Global Average Pooling (GAP) from ResNet-18 and fine-tuning achieves **67.4% accuracy** on Split CIFAR-100—outperforming Experience Replay with 1,000 stored examples (64.3%)—without storing any past data. This means a well-designed memory architecture can reduce or eliminate the need for complex replay buffers or regularization schemes.

For cognitive AI systems that must continually learn while retaining previous knowledge, architectural choices have disproportionate impact on the stability-plasticity tradeoff. Width, normalization, and pooling decisions determine forgetting rates more than algorithm selection.

## Width dramatically reduces forgetting while depth offers diminishing returns

The most robust finding from Mirzadeh et al. is that **wider networks forget less**, while deeper networks provide no continual learning benefit at equivalent parameter counts.

| CNN Width | Parameters | Average Accuracy | Forgetting Rate |
|-----------|-----------|------------------|-----------------|
| CNN×1 | 0.3M | 62.2% | 12.6% |
| CNN×4 | 2.3M | 68.1% | 8.7% |
| CNN×8 | 7.5M | 69.9% | 8.0% |
| CNN×16 | 26.9M | **76.8%** | **4.7%** |

Going from CNN×1 to CNN×16 reduces forgetting by **63%** (12.6% → 4.7%). Meanwhile, comparing networks with equivalent parameters but different depth/width ratios shows that an MLP with 2 layers and 512 hidden units achieves **72.6% accuracy with 29.6% forgetting**, while an MLP with 8 layers and 256 hidden units achieves only 70.4% accuracy with 32.1% forgetting.

**Actionable recommendations for memory architectures:**
- Allocate parameters to width over depth when designing encoder/memory modules
- For embedding layers in memory systems, use wider projection dimensions (e.g., 1024→2048 rather than adding layers)
- Consider the "lazy training regime" explanation: wider networks stay closer to initialization, enabling gradient orthogonalization across tasks

```python
# Prefer this (wider):
class WideMemoryEncoder(nn.Module):
    def __init__(self, input_dim, memory_dim=2048):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, memory_dim * 2),
            nn.ReLU(),
            nn.Linear(memory_dim * 2, memory_dim),
        )

# Over this (deeper):
class DeepMemoryEncoder(nn.Module):
    def __init__(self, input_dim, memory_dim=512):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 512),
            nn.ReLU(),
            nn.Linear(512, 512),
            nn.ReLU(),
            nn.Linear(512, 512),
            nn.ReLU(),
            nn.Linear(512, memory_dim),
        )
```

## Batch normalization has context-dependent effects on forgetting

Batch normalization's impact depends critically on whether **input distributions remain stable across tasks**. On Split CIFAR-100, where images share low-level features across classes, adding BatchNorm to CNN×8 improves accuracy from 69.9% to **76.1%** and reduces forgetting from 8.0% to **5.9%**. However, on Permuted MNIST—where pixel positions are randomized—BatchNorm **triples forgetting** from 10.9% to 32.5%.

This has direct implications for cognitive memory systems:

**When to use BatchNorm:**
- Semantic memory modules processing related content (e.g., all text, all images of similar domains)
- Feature extractors for content with shared statistical properties
- Embeddings from pre-trained models where representations are already normalized

**When to avoid BatchNorm:**
- Episodic memory systems storing diverse experience types
- Multi-modal architectures where input statistics vary dramatically
- Systems that must handle distribution shifts (cross-domain, temporal drift)

```python
class AdaptiveNormMemory(nn.Module):
    """Use GroupNorm or LayerNorm when distribution stability is uncertain."""
    def __init__(self, dim, stable_distribution=True):
        super().__init__()
        if stable_distribution:
            self.norm = nn.BatchNorm1d(dim)  # Better learning accuracy
        else:
            self.norm = nn.LayerNorm(dim)    # Safer for shifting distributions
```

**Alternative normalization strategies for uncertain distributions:**
- **LayerNorm**: Instance-level normalization, robust to batch composition changes
- **GroupNorm**: Balance between BatchNorm's learning benefits and LayerNorm's robustness
- **Peri-LN (for Transformers)**: Places normalization peripherally around sublayers for balanced variance growth

## Global Average Pooling creates a critical bottleneck for retention

The paper identifies GAP as a **major source of forgetting** because it reduces the width of features fed to the classifier. On Split CIFAR-100:

| Model | Pre-Classifier Width | Forgetting |
|-------|---------------------|------------|
| CNN×16 | 32,768 | 4.7% |
| CNN×16 + GAP | 2,048 | **12.2%** |

GAP nearly **triples** forgetting by compressing 32,768 features down to 2,048. The fix is straightforward: remove GAP or replace it with smaller pooling.

**ResNet improvements from GAP modification:**

| Model | Params | Accuracy | Forgetting |
|-------|--------|----------|------------|
| ResNet-18 (standard) | 11.2M | 45.0% | 36.8% |
| ResNet-18 w/o GAP | 11.9M | **67.4%** | **11.2%** |
| ResNet-50 w/ 4×4 AvgPool | 31.7M | 67.2% | **3.5%** |

Removing GAP from ResNet-18 improves accuracy by **22.4 percentage points** and reduces forgetting by **25.6 points**.

**Code-level implementation for memory-enabled CNNs:**

```python
import torch.nn as nn

class CLFriendlyResNet(nn.Module):
    """ResNet variant optimized for continual learning."""
    def __init__(self, base_resnet, num_classes, remove_gap=True):
        super().__init__()
        self.features = nn.Sequential(*list(base_resnet.children())[:-2])
        
        if remove_gap:
            # Replace GAP with smaller adaptive pooling to preserve width
            self.pool = nn.AdaptiveAvgPool2d((4, 4))  # 16x feature preservation
            # Calculate new feature dimension (e.g., 512 * 4 * 4 = 8192)
            self.classifier = nn.Linear(512 * 4 * 4, num_classes)
        else:
            self.pool = nn.AdaptiveAvgPool2d((1, 1))  # Original GAP
            self.classifier = nn.Linear(512, num_classes)
    
    def forward(self, x):
        x = self.features(x)
        x = self.pool(x)
        x = x.view(x.size(0), -1)
        return self.classifier(x)
```

## Max pooling improves learning without catastrophic forgetting costs

While average pooling shows minimal impact, **max pooling significantly improves learning accuracy** without proportionally increasing forgetting. On Split CIFAR-100, adding MaxPool to CNN×4 increases learning accuracy from 76.4% to **83.3%** (+7 points) while forgetting only increases marginally (8.7% → 9.3%).

The mechanism: max pooling produces sparser, more localized feature representations that generalize better to new tasks. For memory architectures that must extract salient features from diverse inputs, this is valuable.

```python
class MemoryFeatureExtractor(nn.Module):
    def __init__(self, in_channels):
        super().__init__()
        self.conv_block = nn.Sequential(
            nn.Conv2d(in_channels, 128, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),  # Prefer MaxPool for feature extraction
            nn.Conv2d(128, 256, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),
        )
```

## Skip connections provide minimal continual learning benefit

Despite their importance for gradient flow in deep networks, skip connections **do not meaningfully impact CL performance**. Results with and without skip connections fall within standard deviation ranges. This simplifies architecture design: include skip connections for training stability if needed, but don't expect them to reduce forgetting.

## Vision Transformers show inherent robustness to distribution shifts

ViTs demonstrate **30-40% less forgetting** than comparable ResNets/WRNs at similar parameter counts, though with lower absolute accuracy:

| Model | Params | Accuracy | Forgetting |
|-------|--------|----------|------------|
| ResNet-18 | 11.2M | 45.0% | 36.8% |
| WRN-10-10 | 7.7M | 43.7% | 31.7% |
| ViT-512/1024 | 8.8M | 51.7% | **21.9%** |

The self-attention mechanism provides inherent robustness to distribution shifts. For memory systems that must process diverse, temporally varying inputs, ViT-based encoders may offer better retention characteristics.

**Implications for Transdifferential Cognitive Architecture:**
If the architecture involves orchestrating multiple specialized models, using ViT-based feature extractors as the shared backbone could provide more stable representations across task domains.

## Practical architecture patterns for memory-based cognitive AI

Based on these findings, here is a recommended architecture pattern for a memory-augmented continual learning system:

```python
import torch
import torch.nn as nn

class ContinualMemoryNetwork(nn.Module):
    """
    Memory-augmented network optimized for continual learning.
    Incorporates Mirzadeh et al. findings on width, pooling, and normalization.
    """
    def __init__(
        self,
        input_dim: int,
        memory_slots: int = 128,
        memory_dim: int = 512,
        num_classes: int = 100,
        stable_distribution: bool = True,
    ):
        super().__init__()
        
        # Wide encoder (prefer width over depth)
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, memory_dim * 4),
            nn.LayerNorm(memory_dim * 4) if not stable_distribution 
                else nn.BatchNorm1d(memory_dim * 4),
            nn.ReLU(),
            nn.Linear(memory_dim * 4, memory_dim * 2),
            nn.LayerNorm(memory_dim * 2) if not stable_distribution 
                else nn.BatchNorm1d(memory_dim * 2),
            nn.ReLU(),
        )
        
        # External memory matrix
        self.memory = nn.Parameter(
            torch.randn(memory_slots, memory_dim * 2) * 0.01
        )
        
        # Wide read mechanism (avoid bottlenecks)
        self.read_key = nn.Linear(memory_dim * 2, memory_dim * 2)
        
        # Classifier with preserved width (no GAP equivalent)
        self.classifier = nn.Sequential(
            nn.Linear(memory_dim * 4, memory_dim * 2),  # Concat encoded + read
            nn.ReLU(),
            nn.Linear(memory_dim * 2, num_classes),
        )
    
    def forward(self, x):
        # Encode input
        encoded = self.encoder(x)
        
        # Content-based memory read
        key = self.read_key(encoded)
        attention = torch.softmax(
            torch.matmul(key, self.memory.T) / (self.memory.size(-1) ** 0.5),
            dim=-1
        )
        read_vector = torch.matmul(attention, self.memory)
        
        # Combine and classify (preserve width)
        combined = torch.cat([encoded, read_vector], dim=-1)
        return self.classifier(combined)
```

## Trade-off analysis for different use cases

The paper reveals a fundamental **learning accuracy vs. retention** trade-off:

| Architecture | Learning Accuracy | Retention | Best For |
|--------------|-------------------|-----------|----------|
| ResNets/WRNs (standard) | **Highest** | Low | Single-task, early CL stages |
| Simple CNNs + BN + MaxPool | Medium-High | **High** | General continual learning |
| ResNets w/o GAP | High | High | When ResNet features needed |
| ViTs | Medium | **Highest** | Distribution-robust scenarios |
| Wide MLPs | Medium | High | Tabular/embedding data |

**For cognitive AI applications:**
- **Educational AI** (adaptive tutoring): Prioritize retention—use wide CNNs or ViTs since users expect the system to remember their progress
- **Micro models** (edge deployment): Use wide, shallow architectures; remove GAP to maximize retention per parameter
- **Multi-model orchestration**: Use ViT encoders for shared representations due to distribution robustness

## Implementation checklist

For any neural network-based memory or continual learning project:

1. **Width over depth**: Allocate parameters to hidden dimension expansion rather than additional layers
2. **Remove or reduce GAP**: Replace `nn.AdaptiveAvgPool2d((1,1))` with `nn.AdaptiveAvgPool2d((4,4))` or larger
3. **Use MaxPool for feature extraction**: Provides better learning accuracy without forgetting penalties
4. **Conditional normalization**: BatchNorm when input distributions are stable; LayerNorm/GroupNorm otherwise
5. **Consider ViT backbones**: For systems that must handle diverse, shifting input distributions
6. **Skip connections optional**: Include for training stability, but don't expect CL benefits
7. **Preserve classifier width**: Ensure feature dimensions before the final classifier remain large (8K+ for image tasks)

These architectural choices can provide the equivalent of sophisticated replay or regularization methods—sometimes exceeding their performance—at no additional memory or computational cost during inference.

## Conclusion

The Mirzadeh et al. findings demonstrate that **architectural decisions are first-order concerns** for continual learning systems. For memory-based cognitive AI architectures like those envisioned in the Transdifferential Cognitive Architecture framework, implementing these guidelines can dramatically reduce catastrophic forgetting without algorithmic complexity. The key insight: a ResNet-18 with GAP removed and simple fine-tuning outperforms the same architecture with Experience Replay storing 1,000 examples. Architecture is not merely infrastructure—it is the primary lever for achieving stable, adaptive learning systems.