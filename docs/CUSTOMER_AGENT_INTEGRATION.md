# Customer Agent integration API

Nextly exposes a read-only, versioned service-to-service API for the standalone
Customer Agent at `/api/integrations/agent/v1/`.

The API reads the existing catalog, storefront, price-list, inventory,
reservation, location and order tables. It does not create a second product,
stock or order model, and it has no write endpoints.

## Authentication

Provision a credential on the Nextly server. The command prints the token once;
the database stores only a SHA-256 hash of the high-entropy secret.

```text
pnpm integration:credential create --name customer-agent --scopes catalog:read,inventory:read,pricing:read,locations:read,orders:read
pnpm integration:credential rotate --key-id <key-id>
pnpm integration:credential disable --key-id <key-id>
```

Send the returned value as:

```text
Authorization: Bearer <key-id>.<secret>
```

The API verifies the secret with a constant-time comparison and records only
safe request metadata: integration id, endpoint, required scope, request id,
status and duration. It never logs the bearer token or request payload.

## Response contract

Successful responses use `{ "data": ... }`. Errors use:

```json
{ "error": { "code": "MACHINE_CODE", "message": "Safe message" } }
```

Every response includes `x-nextly-request-id` and uses `Cache-Control: no-store`.
Search is limited to 20 results. Product, price and stock reads are restricted
to active storefront exposure, active variants, positive storefront pricing and
the canonical storefront location scope.

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| GET | `/capabilities` | `catalog:read` | Discover read-only capabilities |
| GET | `/products/search?q=...&storefrontId=...&limit=...` | `catalog:read` | Search visible products/variants |
| GET | `/products/:variantId?storefrontId=...` | `catalog:read` | Read one visible variant |
| GET | `/price?variantId=...&storefrontId=...` | `pricing:read` | Read exact price-list amount and currency |
| GET | `/stock?variantId=...&locationId=...&storefrontId=...` | `inventory:read` | Read canonical available units |
| GET | `/locations?storefrontId=...` | `locations:read` | Read active storefront locations |
| GET | `/opening-hours?locationId=...` | `locations:read` | Returns `OPENING_HOURS_NOT_SUPPORTED` |
| GET | `/orders/status?orderReference=...&customerId=...` | `orders:read` | Read status only for the supplied customer |

Order status always requires both the order reference and customer context. A
reference belonging to another customer returns the same safe `ORDER_NOT_FOUND`
response, preventing order enumeration.

## Domain sources

- Product search/detail reuse the public catalog visibility predicates.
- Price reads use the active storefront default price list.
- Stock uses `onHand - reserved`, scoped to active storefront locations and
  clamped at zero for public reads.
- Locations use `storefront_locations` and active `locations`.
- Order status reads canonical `sales`/`orders` and `order_fulfillments`.
- Opening hours are intentionally disabled: Nextly currently has only free-form
  `settings.openingHours`, not a structured location-hours model.
