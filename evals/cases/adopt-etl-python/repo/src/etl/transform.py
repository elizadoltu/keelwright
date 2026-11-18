from etl.models import CarrierEvent, ShipmentRow

STATUS_MAP = {"IT": "in_transit", "DL": "delivered", "EX": "exception"}


def to_row(event: CarrierEvent) -> ShipmentRow:
    city = event.location.split(",")[0].strip() if event.location else None
    return ShipmentRow(
        tracking_number=event.tracking_number,
        status=STATUS_MAP.get(event.status, event.status),
        occurred_at=event.occurred_at,
        city=city,
    )
