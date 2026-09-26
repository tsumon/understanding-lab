import hashlib
import json
import sys
from copy import deepcopy
from pathlib import Path

import numpy as np
import pytest

from generate import generate


ROOT = Path(__file__).resolve().parents[2]


def assert_packs_match(expected, actual):
    assert expected["version"] == actual["version"]
    assert expected["generator"] == actual["generator"]
    assert expected["tolerances"] == actual["tolerances"]
    assert expected["datasets"].keys() == actual["datasets"].keys()
    for dataset_key, expected_splits in expected["datasets"].items():
        actual_splits = actual["datasets"][dataset_key]
        assert expected_splits.keys() == actual_splits.keys()
        for split_name, expected_split in expected_splits.items():
            actual_split = actual_splits[split_name]
            assert expected_split["ids"] == actual_split["ids"]
            np.testing.assert_allclose(
                expected_split["x"], actual_split["x"], rtol=1e-8, atol=1e-10
            )
            np.testing.assert_allclose(
                expected_split["y"], actual_split["y"], rtol=1e-8, atol=1e-10
            )

    assert len(expected["cases"]) == len(actual["cases"])
    for expected_case, actual_case in zip(expected["cases"], actual["cases"]):
        assert expected_case["key"] == actual_case["key"]
        assert expected_case["config"] == actual_case["config"]
        assert expected_case["datasetKey"] == actual_case["datasetKey"]
        assert expected_case["metrics"].keys() == actual_case["metrics"].keys()
        np.testing.assert_allclose(
            expected_case["curve"], actual_case["curve"], rtol=1e-8, atol=1e-10
        )
        for metric_name, expected_value in expected_case["metrics"].items():
            np.testing.assert_allclose(
                expected_value, actual_case["metrics"][metric_name],
                rtol=1e-8, atol=1e-10,
            )


def test_pack_comparison_tolerates_only_numerical_differences():
    expected = generate()
    slightly_different = deepcopy(expected)
    slightly_different["datasets"]["17:0"]["train"]["x"][0] += 1e-11
    slightly_different["cases"][0]["metrics"]["trainMse"] += 1e-11
    assert_packs_match(expected, slightly_different)

    outside_tolerance = deepcopy(expected)
    outside_tolerance["datasets"]["17:0"]["train"]["x"][0] += 1e-6
    with pytest.raises(AssertionError):
        assert_packs_match(expected, outside_tolerance)

    changed_id = deepcopy(expected)
    changed_id["datasets"]["17:0"]["train"]["ids"][0] = "changed-id"
    with pytest.raises(AssertionError):
        assert_packs_match(expected, changed_id)

    changed_config = deepcopy(expected)
    changed_config["cases"][0]["config"]["degree"] += 1
    with pytest.raises(AssertionError):
        assert_packs_match(expected, changed_config)


def test_catalog_is_complete_and_finite():
    pack = generate()
    assert len(pack["datasets"]) == 9
    assert len(pack["cases"]) == 324
    assert len({case["key"] for case in pack["cases"]}) == 324
    for case in pack["cases"]:
        assert np.isfinite(np.array(case["curve"])).all()
        assert len(case["curve"]) == 201
        assert all(np.isfinite(v) and v >= 0 for v in case["metrics"].values())


def test_splits_are_disjoint():
    for data in generate()["datasets"].values():
        groups = [set(data[name]["ids"]) for name in ("train", "validation", "test")]
        coordinates = [set(data[name]["x"]) for name in ("train", "validation", "test")]
        assert len(groups[0]) == 80
        assert len(groups[1]) == len(groups[2]) == 200
        assert groups[0].isdisjoint(groups[1])
        assert groups[0].isdisjoint(groups[2])
        assert groups[1].isdisjoint(groups[2])
        assert coordinates[0].isdisjoint(coordinates[1])
        assert coordinates[0].isdisjoint(coordinates[2])
        assert coordinates[1].isdisjoint(coordinates[2])
        assert data["validation"]["x"] != data["test"]["x"]
        assert data["validation"]["y"] != data["test"]["y"]


def test_every_case_matches_independent_least_squares():
    pack = generate()
    for case in pack["cases"]:
        config = case["config"]
        data = pack["datasets"][case["datasetKey"]]
        n, degree = config["n"], config["degree"]
        training_x = np.asarray(data["train"]["x"][:n])
        training_y = np.asarray(data["train"]["y"][:n])
        lo, hi = training_x.min(), training_x.max()

        def predict(x):
            normalized = 2 * (np.asarray(x) - lo) / (hi - lo) - 1
            basis = np.polynomial.polynomial.polyvander(normalized, degree)
            return basis @ coefficients

        training_basis = np.polynomial.polynomial.polyvander(
            2 * (training_x - lo) / (hi - lo) - 1, degree
        )
        coefficients, _, rank, _ = np.linalg.lstsq(training_basis, training_y, rcond=None)
        assert rank == degree + 1, case["key"]
        np.testing.assert_allclose(
            np.asarray(case["curve"])[:, 0], np.linspace(0.0, 1.0, 201),
            rtol=0, atol=0, err_msg=case["key"],
        )
        np.testing.assert_allclose(
            np.asarray(case["curve"])[:, 1],
            predict(np.linspace(0.0, 1.0, 201)), rtol=1e-8, atol=1e-10,
            err_msg=case["key"],
        )
        for split_name, metric_name in (
            ("train", "trainMse"),
            ("validation", "validationMse"),
            ("test", "testMse"),
        ):
            count = n if split_name == "train" else 200
            split = data[split_name]
            residual = predict(split["x"][:count]) - np.asarray(split["y"][:count])
            expected = np.mean(residual**2)
            np.testing.assert_allclose(
                case["metrics"][metric_name], expected,
                rtol=1e-8, atol=1e-10, err_msg=f"{case['key']} {metric_name}",
            )


def test_reuses_fixed_pools_and_training_prefixes():
    pack = generate()
    for seed in (17, 29, 43):
        datasets = [pack["datasets"][f"{seed}:{noise:g}"] for noise in (0.0, 0.1, 0.3)]
        for split in ("train", "validation", "test"):
            assert datasets[0][split]["x"] == datasets[1][split]["x"]
            assert datasets[0][split]["x"] == datasets[2][split]["x"]
            assert datasets[0][split]["ids"] == datasets[1][split]["ids"]
        for noise in (0.0, 0.1, 0.3):
            data = pack["datasets"][f"{seed}:{noise:g}"]["train"]
            for n in (20, 40, 80):
                for degree in range(1, 13):
                    case = next(c for c in pack["cases"] if c["key"] == f"{seed}:{n}:{noise:g}:{degree}")
                    assert case["datasetKey"] == f"{seed}:{noise:g}"
                    assert data["x"][:20] == data["x"][:n][:20]
                    assert data["y"][:20] == data["y"][:n][:20]


def test_published_pack_is_reproducible_and_manifest_matches_bytes():
    pack_path = ROOT / "public/experiments/overfitting.v1.json"
    manifest_path = ROOT / "public/experiments/overfitting.v1.manifest.json"
    generated = generate()
    assert generated == generate()
    assert_packs_match(generated, json.loads(pack_path.read_text()))
    manifest = json.loads(manifest_path.read_text())
    assert manifest["python"] == sys.version.split()[0]
    assert manifest["numpy"] == np.__version__
    assert manifest["generatorSha256"] == hashlib.sha256(
        (ROOT / "tools/experiment/generate.py").read_bytes()
    ).hexdigest()
    assert manifest["dataSha256"] == hashlib.sha256(pack_path.read_bytes()).hexdigest()
