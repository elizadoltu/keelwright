# Project idea: csvcheck

A command-line tool that checks CSV files against a schema file (column names, types, required values, allowed values) and reports every problem with its line number. It is for data engineers, mostly inside CI pipelines.

It must install as a single file on Linux, macOS and Windows without needing a runtime, start instantly and handle multi-gigabyte files. Open source under the MIT licence.

Output: human-readable by default, JSON with a flag, and a non-zero exit code when a file fails.
