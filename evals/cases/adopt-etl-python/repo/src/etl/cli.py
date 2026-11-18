import argparse
import os

import httpx
from sqlalchemy import create_engine

from etl.extract import fetch_events
from etl.load import load
from etl.transform import to_row


def main() -> None:
    parser = argparse.ArgumentParser(prog="shipments-etl")
    parser.add_argument("--since", default="yesterday")
    args = parser.parse_args()
    engine = create_engine(os.environ["REPORTING_DATABASE_URL"])
    with httpx.Client(headers={"Authorization": f"Bearer {os.environ['CARRIER_TOKEN']}"}) as client:
        rows = [to_row(e) for e in fetch_events(args.since, client)]
    print(f"loaded {load(rows, engine)} events")
