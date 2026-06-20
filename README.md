# LotoAI

LotoAI is a backend-only TypeScript platform for collecting, storing, and analyzing Vietnamese lottery results. Phase 1 focuses on daily data collection, MongoDB Atlas storage, statistics-ready schema design, command-line jobs, and GitHub Actions automation.

This phase does not include AI prediction, machine learning, deep learning, frontend UI, mobile apps, or betting logic.

## Database Architecture

LotoAI stores raw draw results and normalized number rows separately, with physical collections split by region:

- `lottery_results_mien_bac` preserves original northern results.
- `lottery_results_mien_trung` preserves original central results.
- `lottery_results_mien_nam` preserves original southern results.
- `lottery_numbers_mien_bac` expands northern prize numbers into statistics-friendly rows.
- `lottery_numbers_mien_trung` expands central prize numbers into statistics-friendly rows.
- `lottery_numbers_mien_nam` expands southern prize numbers into statistics-friendly rows.

After each result is saved, normalized rows for the same `date + province` are deleted and rebuilt so both collections stay synchronized.

## Collection Design

### lottery_results_mien_bac / lottery_results_mien_trung / lottery_results_mien_nam

```json
{
  "date": "2026-06-19",
  "region": "mien-bac",
  "province": "xsmb",
  "stationName": "Mien Bac",
  "results": {
    "db": ["63155"],
    "g1": ["42245"],
    "g2": ["17963", "84785"],
    "g3": [],
    "g4": [],
    "g5": [],
    "g6": [],
    "g7": [],
    "g8": []
  },
  "source": "xskt",
  "sourceUrl": "https://xskt.net/xsmb/19-06-2026"
}
```

Indexes:

- `{ date: 1, province: 1 }` unique
- `{ date: 1 }`
- `{ region: 1 }`
- `{ province: 1 }`

### lottery_numbers_mien_bac / lottery_numbers_mien_trung / lottery_numbers_mien_nam

```json
{
  "date": "2026-06-19",
  "region": "mien-bac",
  "province": "xsmb",
  "stationName": "Mien Bac",
  "prize": "db",
  "position": 1,
  "fullNumber": "63155",
  "last2": "55",
  "last3": "155",
  "head": "5",
  "tail": "5",
  "sourceResultId": "..."
}
```

Indexes:

- `{ last2: 1 }`
- `{ last3: 1 }`
- `{ date: 1 }`
- `{ region: 1 }`
- `{ province: 1 }`
- `{ region: 1, last2: 1 }`
- `{ province: 1, last2: 1 }`
- `{ date: 1, region: 1 }`
- `{ date: 1, province: 1 }`

## Why lottery_numbers Exists

The raw result document is ideal for auditability, but statistics usually need flattened rows. The `lottery_numbers_*` collections allow fast frequency queries such as top `last2`, top `last3`, regional counts, province counts, and date-window analysis while preserving leading zeros.

Example:

```text
fullNumber = 03004
last2 = 04
last3 = 004
head = 0
tail = 4
```

## Setup

```bash
npm install
cp .env.example .env
npm run build
```

Update `.env` with your MongoDB Atlas credentials. Do not commit `.env`.

## MongoDB Atlas Setup

1. Create or use an Atlas cluster.
2. Create a database user with read/write access.
3. Allow your runner IP address or GitHub Actions access strategy.
4. Put the connection string in `MONGODB_URI`.
5. Ensure the URI targets database `loto_ai`.

## Environment Variables

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.o2zrfpm.mongodb.net/loto_ai?retryWrites=true&w=majority&appName=Cluster0
LOTTERY_SOURCE_BASE_URL=https://xskt.com.vn
XSKT_XSMB_DAILY_URL_TEMPLATE=https://xskt.net/xsmb/{dd}-{mm}-{yyyy}
LOTTERY_FETCH_TIMEOUT_MS=25000
```

Required variables are validated on startup.

## Run Commands

```bash
npm run job:daily
npm run job:date -- 2026-06-19
npm run job:mien-bac
npm run job:mien-trung
npm run job:mien-nam
npm run job:region -- mien-nam
npm run job:region -- mien-nam 2026-06-19
npm run job:province -- vinh-long 2026-06-19
npm run import:xsmb:200 -- 200 2026-06-19
npm run import:xsmn:200 -- 200 2026-06-19
npm run import:xsmt:200 -- 200 2026-06-19
npm run stats:last2 -- --region mien-bac --days 30 --limit 10
npm run stats:last3 -- --province xsmb --days 30 --limit 10
```

## GitHub Actions Setup

The workflow lives at `.github/workflows/daily-lottery-job.yml`.

Required secret:

- `MONGODB_URI`

Optional repository variables:

- `LOTTERY_SOURCE_BASE_URL`
- `XSKT_XSMB_DAILY_URL_TEMPLATE`
- `LOTTERY_FETCH_TIMEOUT_MS`

The scheduled job runs at `30 12 * * *`, which is 19:30 Vietnam time.

## Crawler Architecture

Crawler logic implements `LotteryCrawler` and is separate from persistence. The first implementation uses Axios and Cheerio. It can be replaced later without changing repositories or database synchronization.

## Future Roadmap

Phase 2:

- Statistics Dashboard
- REST API

Phase 3:

- Frequency Analysis
- Markov Chain

Phase 4:

- XGBoost
- Random Forest

Phase 5:

- LSTM
- Transformer

## Assumptions and TODOs

- The XSMB URL template is explicit and implemented directly.
- Other province URLs are built from `LOTTERY_SOURCE_BASE_URL`, the province source path, and `dd-mm-yyyy`; confirm exact source paths during production hardening.
- The parser is intentionally replaceable because public lottery HTML can change.
- Add integration tests with recorded HTML fixtures before relying on unattended production crawling.
