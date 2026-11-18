# shipments-etl

Nightly job for the data team: pulls shipment events from the carrier API, normalises them, and loads them into the `reporting` PostgreSQL database that the dashboards read.

Runs on a GitLab schedule (`nightly` job). Locally: `make install`, then `make run`.
