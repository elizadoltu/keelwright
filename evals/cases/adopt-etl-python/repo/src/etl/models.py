"""Every record that crosses a boundary is a Pydantic model: raw carrier events in, rows out."""

from datetime import datetime

from pydantic import BaseModel, validator


class CarrierEvent(BaseModel):
    tracking_number: str
    status: str
    occurred_at: datetime
    location: str | None = None


class ShipmentRow(BaseModel):
    tracking_number: str
    status: str
    occurred_at: datetime
    city: str | None

    @validator("status")
    def known_status(cls, v: str) -> str:
        allowed = {"in_transit", "delivered", "exception"}
        if v not in allowed:
            raise ValueError(f"unknown status {v}")
        return v
