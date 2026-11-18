.PHONY: install lint typecheck test run

install:
	poetry install

lint:
	poetry run ruff check .
	poetry run ruff format --check .

typecheck:
	poetry run mypy src

test:
	poetry run pytest -q

run:
	poetry run shipments-etl --since yesterday
