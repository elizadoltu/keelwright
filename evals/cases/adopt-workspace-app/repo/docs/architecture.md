# Architecture

The web app calls the API over HTTP (`VITE_API_URL`). The API owns the database; the web app never talks to it. Items have an owner and a status (available, reserved, gone).
