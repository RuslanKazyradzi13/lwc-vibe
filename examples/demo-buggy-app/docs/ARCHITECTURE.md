# Demo checkout architecture

- `src/api/` — HTTP routes (Express-like style).
- `src/services/` — order and discount business logic.
- `src/db/` — storage (a JSON file).
- `src/ui/` — receipt rendering for printing.
- `src/payments/` — payment terminal integration (described, but the directory does not exist).
