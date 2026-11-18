import httpx

from etl.models import CarrierEvent

CARRIER_URL = "https://api.carrier.example/v2/events"


def fetch_events(since: str, client: httpx.Client) -> list[CarrierEvent]:
    response = client.get(CARRIER_URL, params={"since": since}, timeout=30)
    response.raise_for_status()
    return [CarrierEvent.parse_obj(item) for item in response.json()["events"]]
