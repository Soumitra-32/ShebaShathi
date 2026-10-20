"""
Unit tests for red-flag detector.
"""
import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.engine import redflag as rf
from app.engine.fees import calculate as calculate_fee


class TestRedFlag:
    def test_below_official(self):
        """Claimed amount below official should not flag."""
        result = rf.check(claimed_amount=3000, pages=48, validity_years=10, delivery="regular")
        assert result["official_total"] > 0
        assert result["flag"] is False

    def test_above_official(self):
        """Claimed amount above official should flag."""
        result = rf.check(claimed_amount=7000, pages=48, validity_years=10, delivery="regular")
        assert result["flag"] is True
        assert result["difference"] > 0

    def test_matches_official(self):
        """Claimed amount equal to official should not flag."""
        official_total = calculate_fee(48, 10, "regular")["total"]
        result = rf.check(claimed_amount=official_total, pages=48, validity_years=10, delivery="regular")
        assert result["difference"] == pytest.approx(0, abs=0.01)
        assert result["flag"] is False

    def test_different_delivery(self):
        """Express delivery should have higher official total."""
        regular = rf.check(claimed_amount=3000, pages=48, validity_years=10, delivery="regular")
        express = rf.check(claimed_amount=3000, pages=48, validity_years=10, delivery="express")
        assert express["official_total"] > regular["official_total"]
