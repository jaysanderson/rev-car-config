# Harbourline Ridge Configurator

Interactive mockup of a dealer car-configuration experience for a dealer management system vendor.

- **Progress Agentic RAG** drives the conversational assistant: cited answers from spec sheets, pricing, finance terms and term dates, in the customer's language, with the ability to change the build.
- **Domo** supplies stock intelligence from the DMS: stock by site, ageing, transfer feasibility, inbound pipeline and order-bank ETA. It shapes every option on the page rather than living behind a "check stock" button.

Harbourline, Kestrel and Ridge are fictional. All prices, stock and ages are illustrative.

## Run locally

Open `public/index.html` in a browser, or:

```sh
docker build -t harbourline . && docker run -p 8080:8080 harbourline
```

## Deploy

```sh
fly deploy
```
