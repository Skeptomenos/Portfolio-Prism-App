import pytest
import tempfile
from pathlib import Path

from portfolio_src.data.pipeline_db import PipelineDatabase


class TestPipelineDatabase:
    @pytest.fixture
    def db(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = Path(f.name)
        db = PipelineDatabase(db_path)
        yield db
        db_path.unlink()

    def test_start_and_complete_run(self, db):
        run_id = db.start_run()
        assert run_id > 0

        db.complete_run(run_id, positions_count=10, holdings_count=100)

        latest = db.get_latest_run()
        assert latest["id"] == run_id
        assert latest["status"] == "completed"
        assert latest["positions_count"] == 10

    def test_fail_run(self, db):
        run_id = db.start_run()
        db.fail_run(run_id, [{"error": "test error"}])

        with db._connection() as conn:
            row = conn.execute(
                "SELECT * FROM pipeline_runs WHERE id = ?", (run_id,)
            ).fetchone()
            assert row["status"] == "failed"

    def test_insert_positions_with_generated_value(self, db):
        run_id = db.start_run()

        positions = [
            {
                "isin": "US67066G1040",
                "name": "NVIDIA",
                "quantity": 10.5,
                "unit_price": 159.84,
                "source": "test",
            },
            {
                "isin": "XF000BTC0017",
                "name": "Bitcoin",
                "quantity": 0.000231,
                "unit_price": 74372.29,
                "source": "test",
            },
        ]
        db.insert_positions(positions, run_id)

        df = db.get_positions(run_id)

        nvidia = df[df["isin"] == "US67066G1040"].iloc[0]
        assert abs(nvidia["market_value"] - 1678.32) < 1

        bitcoin = df[df["isin"] == "XF000BTC0017"].iloc[0]
        assert abs(bitcoin["market_value"] - 17.18) < 0.01

    def test_insert_holdings(self, db):
        run_id = db.start_run()

        holdings = [
            {
                "parent_isin": "DIRECT",
                "parent_name": "Direct Holdings",
                "child_isin": "US67066G1040",
                "child_name": "NVIDIA",
                "weight_percent": 100.0,
                "value_eur": 1679.37,
            }
        ]
        db.insert_holdings(holdings, run_id)

        df = db.get_holdings(run_id)
        assert len(df) == 1
        assert df.iloc[0]["child_isin"] == "US67066G1040"

    def test_constraint_rejects_invalid_isin(self, db):
        run_id = db.start_run()

        positions = [
            {
                "isin": "INVALID",
                "name": "Bad",
                "quantity": 1,
                "unit_price": 100,
                "source": "test",
            }
        ]
        db.insert_positions(positions, run_id)

        df = db.get_positions(run_id)
        assert len(df) == 0

    def test_get_aggregated_holdings(self, db):
        run_id = db.start_run()

        holdings = [
            {
                "parent_isin": "DIRECT",
                "parent_name": "Direct",
                "child_isin": "US67066G1040",
                "child_name": "NVIDIA",
                "weight_percent": 100.0,
                "value_eur": 1000.0,
            },
            {
                "parent_isin": "IE00B4L5Y983",
                "parent_name": "iShares",
                "child_isin": "US67066G1040",
                "child_name": "NVIDIA",
                "weight_percent": 5.0,
                "value_eur": 500.0,
            },
        ]
        db.insert_holdings(holdings, run_id)
        db.complete_run(run_id)

        df = db.get_aggregated_holdings(run_id)
        assert len(df) == 1
        assert df.iloc[0]["total_value"] == 1500.0
        assert df.iloc[0]["occurrence_count"] == 2

    def test_get_positions_from_latest_run(self, db):
        run1 = db.start_run()
        db.insert_positions(
            [
                {
                    "isin": "US67066G1040",
                    "name": "NVIDIA",
                    "quantity": 10,
                    "unit_price": 100,
                    "source": "test",
                }
            ],
            run1,
        )
        db.complete_run(run1)

        run2 = db.start_run()
        db.insert_positions(
            [
                {
                    "isin": "XF000BTC0017",
                    "name": "Bitcoin",
                    "quantity": 1,
                    "unit_price": 50000,
                    "source": "test",
                }
            ],
            run2,
        )
        db.complete_run(run2)

        df = db.get_positions()
        assert len(df) == 1
        assert df.iloc[0]["isin"] == "XF000BTC0017"
