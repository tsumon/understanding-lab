"""Produce the fixed, precomputed overfitting experiment catalog."""

import hashlib
import json
import sys
from importlib.metadata import version
from itertools import product
from pathlib import Path

import numpy as np
from numpy.polynomial import Polynomial


SEEDS = (17, 29, 43)
SAMPLE_SIZES = (20, 40, 80)
NOISE_LEVELS = (0.0, 0.1, 0.3)
GRID = np.linspace(0.0, 1.0, 201)


def generate():
    result = {
        "version": "overfitting.v1",
        "generator": {"numpy": version("numpy"), "seeds": list(SEEDS)},
        "tolerances": {"relative": 1e-8, "absolute": 1e-10},
        "datasets": {},
        "cases": [],
    }
    for seed in SEEDS:
        rng = np.random.default_rng(seed)
        pools = {}
        for name, size in (("train", 80), ("validation", 200), ("test", 200)):
            pools[name] = (rng.uniform(0.0, 1.0, size), rng.standard_normal(size))
        for noise in NOISE_LEVELS:
            dataset_key = f"{seed}:{noise:g}"
            data = {}
            for name, (x, epsilon) in pools.items():
                data[name] = {
                    "ids": [f"{seed}:{name}:{i}" for i in range(len(x))],
                    "x": x.tolist(),
                    "y": (np.cos(1.5 * np.pi * x) + noise * epsilon).tolist(),
                }
            result["datasets"][dataset_key] = data
            for n, degree in product(SAMPLE_SIZES, range(1, 13)):
                train = data["train"]
                fit, info = Polynomial.fit(train["x"][:n], train["y"][:n], degree, full=True)
                if info[1] != degree + 1:
                    raise ValueError(f"rank-deficient: {seed}/{n}/{noise}/{degree}")
                metrics = {}
                for split_name, metric in (
                    ("train", "trainMse"),
                    ("validation", "validationMse"),
                    ("test", "testMse"),
                ):
                    split = data[split_name]
                    count = n if split_name == "train" else len(split["x"])
                    residual = fit(split["x"][:count]) - np.asarray(split["y"][:count])
                    metrics[metric] = float(np.mean(residual**2))
                curve = np.column_stack((GRID, fit(GRID))).tolist()
                if not np.isfinite(np.asarray(curve)).all():
                    raise ValueError(f"non-finite curve: {seed}/{n}/{noise}/{degree}")
                if not all(np.isfinite(value) for value in metrics.values()):
                    raise ValueError(f"non-finite metric: {seed}/{n}/{noise}/{degree}")
                result["cases"].append({
                    "key": f"{seed}:{n}:{noise:g}:{degree}",
                    "config": {"seed": seed, "n": n, "noise": noise, "degree": degree},
                    "datasetKey": dataset_key,
                    "curve": curve,
                    "metrics": metrics,
                })
    return result


def main():
    root = Path(__file__).resolve().parents[2]
    output = root / "public/experiments"
    output.mkdir(parents=True, exist_ok=True)
    data_path = output / "overfitting.v1.json"
    data_bytes = (json.dumps(generate(), allow_nan=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    data_path.write_bytes(data_bytes)
    manifest = {
        "version": "overfitting.v1",
        "python": sys.version.split()[0],
        "numpy": version("numpy"),
        "generatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "dataSha256": hashlib.sha256(data_bytes).hexdigest(),
    }
    manifest_path = output / "overfitting.v1.manifest.json"
    manifest_path.write_text(json.dumps(manifest, allow_nan=False, sort_keys=True, separators=(",", ":")) + "\n")
    print(f"Generated {data_path} ({len(data_bytes)} bytes)")


if __name__ == "__main__":
    main()
