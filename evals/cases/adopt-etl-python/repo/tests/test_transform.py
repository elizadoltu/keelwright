from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from etl.models import CarrierEvent
from etl.transform import to_row


def event(status: str, location: str | None = "Cluj-Napoca, RO") -> CarrierEvent:
    return CarrierEvent(tracking_number="T1", status=status, occurred_at=datetime(2026, 1, 1, tzinfo=timezone.utc), location=location)


def test_maps_carrier_codes_and_city() -> None:
    row = to_row(event("DL"))
    assert row.status == "delivered"
    assert row.city == "Cluj-Napoca"


def test_unknown_status_is_rejected() -> None:
    with pytest.raises(ValidationError):
        to_row(event("ZZ"))
