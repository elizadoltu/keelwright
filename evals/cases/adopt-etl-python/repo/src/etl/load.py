"""SQLAlchemy Core (tables and insert statements), not the ORM: the job only appends rows."""

from sqlalchemy import Column, DateTime, MetaData, String, Table, insert
from sqlalchemy.engine import Engine

from etl.models import ShipmentRow

metadata = MetaData(schema="reporting")
shipments = Table(
    "shipment_events",
    metadata,
    Column("tracking_number", String, nullable=False),
    Column("status", String, nullable=False),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
    Column("city", String),
)


def load(rows: list[ShipmentRow], engine: Engine) -> int:
    if not rows:
        return 0
    with engine.begin() as conn:
        conn.execute(insert(shipments), [row.dict() for row in rows])
    return len(rows)
