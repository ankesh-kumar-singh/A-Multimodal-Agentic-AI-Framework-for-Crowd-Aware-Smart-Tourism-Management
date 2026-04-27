# model.py
# Global Transformer Unimodal with learnable station embedding.
# Station identity is fused with temporal sequence features.

import math
import torch
import torch.nn as nn
from config import (
    TABULAR_DIM, SEQ_LEN, N_STATIONS, STATION_EMB,
    D_MODEL, N_HEADS, N_LAYERS, FFN_DIM, DROPOUT,
)


class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=512, dropout=0.1):
        super().__init__()
        self.dropout = nn.Dropout(dropout)
        pe  = torch.zeros(max_len, d_model)
        pos = torch.arange(max_len).unsqueeze(1).float()
        div = torch.exp(
            torch.arange(0, d_model, 2).float()
            * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(pos * div)
        pe[:, 1::2] = torch.cos(pos * div)
        self.register_buffer("pe", pe.unsqueeze(0))

    def forward(self, x):
        return self.dropout(x + self.pe[:, :x.size(1)])


class GlobalTransformerPredictor(nn.Module):
    """
    Global Transformer: one model trained across ALL 378 stations.
    Station identity is captured via a learnable embedding that is
    concatenated/added to the sequence representation before prediction.

    Architecture:
      1. Learnable station embedding (N_STATIONS × STATION_EMB)
      2. Linear projection: TABULAR_DIM → D_MODEL
      3. Positional encoding
      4. N_LAYERS × TransformerEncoderLayer (pre-LN)
      5. Global average pool → (B, D_MODEL)
      6. Fuse with station embedding via concat → (B, D_MODEL + STATION_EMB)
      7. FC head → scalar prediction

    Input:
      X      : (B, SEQ_LEN, TABULAR_DIM)  — tabular features
      s_idx  : (B,)                         — station index [0, N_STATIONS)

    Output:
      pred   : (B,)                         — normalised footfall
    """

    def __init__(self):
        super().__init__()

        # ── Station embedding ──────────────────────────────────
        self.station_emb = nn.Embedding(N_STATIONS, STATION_EMB)
        nn.init.normal_(self.station_emb.weight, mean=0.0, std=0.01)

        # ── Input projection ───────────────────────────────────
        self.input_proj = nn.Linear(TABULAR_DIM, D_MODEL)
        self.pos_enc    = PositionalEncoding(D_MODEL, dropout=DROPOUT)

        # ── Transformer encoder (pre-LayerNorm = stable) ───────
        enc_layer = nn.TransformerEncoderLayer(
            d_model         = D_MODEL,
            nhead           = N_HEADS,
            dim_feedforward = FFN_DIM,
            dropout         = DROPOUT,
            batch_first     = True,
            norm_first      = True,   # PRE-LN: prevents explosion
        )
        self.encoder = nn.TransformerEncoder(
            enc_layer, num_layers=N_LAYERS
        )

        # ── Fusion + prediction head ───────────────────────────
        fused_dim = D_MODEL + STATION_EMB
        self.head = nn.Sequential(
            nn.LayerNorm(fused_dim),
            nn.Linear(fused_dim, D_MODEL),
            nn.GELU(),
            nn.Dropout(DROPOUT),
            nn.Linear(D_MODEL, 64),
            nn.GELU(),
            nn.Dropout(DROPOUT * 0.5),
            nn.Linear(64, 1),
        )

    def forward(self,
                X:     torch.Tensor,
                s_idx: torch.Tensor) -> torch.Tensor:
        """
        X      : (B, SEQ_LEN, TABULAR_DIM)
        s_idx  : (B,)  long tensor
        returns: (B,)
        """
        # Station embedding
        s_emb = self.station_emb(s_idx)   # (B, STATION_EMB)

        # Temporal encoding
        x = self.input_proj(X)             # (B, T, D_MODEL)
        x = self.pos_enc(x)
        x = self.encoder(x)                # (B, T, D_MODEL)
        z = x.mean(dim=1)                  # (B, D_MODEL)

        # Fuse temporal + station
        fused = torch.cat([z, s_emb], dim=1)  # (B, D_MODEL+STATION_EMB)
        return self.head(fused).squeeze(-1)    # (B,)

    def get_attention_weights(self,
                               X:     torch.Tensor,
                               s_idx: torch.Tensor) -> torch.Tensor:
        """
        Returns per-timestep attention importance for XAI.
        Shape: (B, T)
        """
        x = self.input_proj(X)
        x = self.pos_enc(x)
        ws = []
        for layer in self.encoder.layers:
            xn = layer.norm1(x)
            _, w = layer.self_attn(
                xn, xn, xn,
                need_weights=True,
                average_attn_weights=True,
            )
            ws.append(w)   # (B, T, T)
            x = layer(x)
        avg = torch.stack(ws).mean(0)   # (B, T, T)
        return avg.mean(1)               # (B, T)


if __name__ == "__main__":
    model  = GlobalTransformerPredictor()
    n      = sum(p.numel() for p in model.parameters())
    print(f"GlobalTransformerPredictor")
    print(f"  Parameters : {n:,}")
    print(f"  D_MODEL    : {D_MODEL}")
    print(f"  N_LAYERS   : {N_LAYERS}")
    print(f"  N_HEADS    : {N_HEADS}")
    print(f"  STATION_EMB: {STATION_EMB}")

    X    = torch.randn(4, SEQ_LEN, TABULAR_DIM)
    sidx = torch.tensor([0, 1, 100, 377])
    out  = model(X, sidx)
    attn = model.get_attention_weights(X, sidx)

    print(f"  Output : {out.shape}")
    print(f"  Attn   : {attn.shape}")
    assert out.shape == (4,)
    assert attn.shape == (4, SEQ_LEN)
    print("✓ model.py smoke test passed")
